import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Case {
  _id: string;
  caseId: string;
  patient: {
    name: string;
    email?: string;
  };
}

export default function LabUpload() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const preselectedCaseId = searchParams.get("caseId");
  
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(preselectedCaseId || "");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [modality, setModality] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);

  useEffect(() => {
    async function fetchCases() {
      if (!token) return;

      try {
        const res = await fetch("http://localhost:8585/api/lab/cases", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setCases(data.items || []);
        }
      } catch (error) {
        console.error("Failed to fetch cases:", error);
      }
    }

    fetchCases();
  }, [token]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };

  const handleUpload = async () => {
    if (!selectedCaseId || !selectedFiles || selectedFiles.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a case and at least one file to upload.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress([]);

    try {
      const files = Array.from(selectedFiles);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(prev => [...prev, `Uploading ${file.name}...`]);

        const formData = new FormData();
        formData.append("file", file);
        if (modality) formData.append("modality", modality);
        if (notes) formData.append("notes", notes);

        const res = await fetch(`http://localhost:8585/api/lab/cases/${selectedCaseId}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(`Failed to upload ${file.name}: ${error}`);
        }

        setUploadProgress(prev => 
          prev.map((msg, idx) => 
            idx === prev.length - 1 ? `✓ ${file.name} uploaded successfully` : msg
          )
        );
      }

      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${files.length} file(s) to case ${selectedCaseId}`,
      });

      // Reset form
      setSelectedFiles(null);
      setModality("");
      setNotes("");
      setUploadProgress([]);
      
      // Refresh cases list
      const res = await fetch("http://localhost:8585/api/lab/cases", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCases(data.items || []);
      }

    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const selectedCase = cases.find(c => c.caseId === selectedCaseId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload Scans</h1>
        <p className="text-sm text-muted-foreground">
          Upload medical images and scans to assigned cases
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upload Form */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>
              Select case and upload medical imaging files
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="case-select">Select Case</Label>
              <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a case awaiting scans..." />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((case_) => (
                    <SelectItem key={case_.caseId} value={case_.caseId}>
                      {case_.caseId} - {case_.patient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCase && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">{selectedCase.caseId}</div>
                <div className="text-sm text-muted-foreground">
                  Patient: {selectedCase.patient.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  Email: {selectedCase.patient.email || "Not provided"}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="files">Select Files</Label>
              <Input
                id="files"
                type="file"
                multiple
                accept=".dcm,.jpg,.jpeg,.png,.pdf,.tif,.tiff"
                onChange={handleFileSelect}
                disabled={!selectedCaseId}
              />
              <p className="text-xs text-muted-foreground">
                Supported: DICOM (.dcm), JPEG, PNG, PDF, TIFF
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="modality">Modality (Optional)</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger>
                  <SelectValue placeholder="Select imaging modality..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CR">CR - Computed Radiography</SelectItem>
                  <SelectItem value="CT">CT - Computed Tomography</SelectItem>
                  <SelectItem value="MR">MR - Magnetic Resonance</SelectItem>
                  <SelectItem value="US">US - Ultrasound</SelectItem>
                  <SelectItem value="XA">XA - X-Ray Angiography</SelectItem>
                  <SelectItem value="DX">DX - Digital Radiography</SelectItem>
                  <SelectItem value="MG">MG - Mammography</SelectItem>
                  <SelectItem value="PT">PT - Positron Emission Tomography</SelectItem>
                  <SelectItem value="RF">RF - Radio Fluoroscopy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any technical notes or observations..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <Button 
              onClick={handleUpload} 
              disabled={!selectedCaseId || !selectedFiles || uploading}
              className="w-full"
            >
              {uploading ? "Uploading..." : "Upload Files"}
            </Button>
          </CardContent>
        </Card>

  {/* Progress */}
        <div className="space-y-6">
          {/* File Preview */}
          {selectedFiles && (
            <Card>
              <CardHeader>
                <CardTitle>Selected Files</CardTitle>
                <CardDescription>
                  {selectedFiles.length} file(s) ready for upload
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from(selectedFiles).map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="text-sm font-medium">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                      <Badge variant="outline">
                        {file.type || "Unknown"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {uploadProgress.map((message, index) => (
                    <div key={index} className="text-sm">
                      {message}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Removed 'Pending Scans' section as requested */}
        </div>
      </div>
    </div>
  );
}