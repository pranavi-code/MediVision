import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Case {
  _id: string;
  caseId: string;
  patient: {
    name: string;
    email?: string;
  };
  createdAt: string;
  updatedAt: string;
  images?: Array<{ _id: string; modality?: string }>;
}

export default function LabCases() {
  const { token } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function fetchCases() {
      if (!token) return;

      try {
        setLoading(true);
        const res = await fetch("http://localhost:8585/api/lab/cases", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setCases(data.items || []);
        }
      } catch (error) {
        console.error("Failed to fetch lab cases:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCases();
  }, [token]);

  const filteredCases = cases.filter(case_ => {
    const searchLower = searchTerm.toLowerCase();
    return (
      case_.caseId.toLowerCase().includes(searchLower) ||
      case_.patient?.name?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Lab Cases</h1>
        <div className="text-muted-foreground">Loading cases...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lab Cases</h1>
          <p className="text-sm text-muted-foreground">Browse your assigned cases and upload files</p>
        </div>
        
        <Link to="/lab/upload">
          <Button>Upload Scans</Button>
        </Link>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-4">
        <Input
          placeholder="Search cases..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <div className="text-sm text-muted-foreground">
          {filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Cases Grid */}
      {filteredCases.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-muted-foreground">
                {searchTerm ? "No cases found matching your search." : "No cases assigned to you yet."}
              </div>
              {!searchTerm && (
                <p className="text-sm text-muted-foreground mt-2">
                  Cases requiring scans will appear here when assigned by administrators.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredCases.map((case_) => (
            <Card key={case_._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {case_.caseId}
                    </CardTitle>
                    <CardDescription>
                      Patient: {case_.patient?.name || "Unknown"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm font-medium">Created</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(case_.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium">Updated</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(case_.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium">Images</div>
                    <div className="text-sm text-muted-foreground">
                      {case_.images?.length || 0} uploaded
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium">Modalities</div>
                    <div className="text-sm text-muted-foreground">
                      {case_.images?.map(img => img.modality).filter(Boolean).join(", ") || "None"}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    <Link to={`/lab/cases/${case_.caseId}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>
                    <Link to={`/lab/upload?caseId=${case_.caseId}`}>
                      <Button size="sm">Upload Files</Button>
                    </Link>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {case_.patient?.email}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}