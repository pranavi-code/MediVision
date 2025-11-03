import DoctorLayout from "@/components/DoctorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Activity, 
  FileText, 
  MessageSquare, 
  User, 
  Calendar,
  Image as ImageIcon,
  Send,
  Save,
  CheckCircle
} from "lucide-react";

export default function DoctorAnalysis() {
  const { caseId } = useParams<{ caseId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [caseData, setCaseData] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  
  // Report form state
  const [reportContent, setReportContent] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [aiAgreement, setAiAgreement] = useState<string>("");
  const [doctorComments, setDoctorComments] = useState("");
  const [savingReport, setSavingReport] = useState(false);

  const recommendationOptions = [
    "Follow-up CT scan",
    "Antibiotic therapy", 
    "Cardiology consultation",
    "Pulmonology referral",
    "Repeat chest X-ray in 2 weeks",
    "Echocardiogram",
    "Blood work (CBC, BMP)",
    "Oxygen therapy"
  ];

  useEffect(() => {
    loadCaseData();
  }, [caseId, token]);

  async function loadCaseData() {
    if (!caseId || !token) return;
    
    setLoading(true);
    try {
      // Load case details
      const caseRes = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (caseRes.ok) {
        const data = await caseRes.json();
        setCaseData(data);
      }

      // Load images
      const imagesRes = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}/images`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (imagesRes.ok) {
        const imgData = await imagesRes.json();
        setImages(imgData.items || []);
      }

      // Load reports
      const reportsRes = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}/reports`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (reportsRes.ok) {
        const reportData = await reportsRes.json();
        setReports(reportData.items || []);
      }

    } catch (error) {
      console.error('Failed to load case data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runAIAnalysis() {
    if (!caseId || !token) return;
    
    setAnalyzing(true);
    try {
      const res = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setCaseData((prev: any) => ({ ...prev, ai_analysis: data.analysis }));
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveReport(status: "draft" | "final") {
    if (!caseId || !token) return;
    
    setSavingReport(true);
    try {
      const payload = {
        content: reportContent,
        status,
        aiAgreement: aiAgreement || null,
        diagnosis: diagnosis || null,
        recommendations: recommendations || [],
        doctorComments: doctorComments || null
      };

      const res = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}/reports`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Reload reports
        loadCaseData();
        // Clear form
        setReportContent("");
        setDiagnosis("");
        setRecommendations([]);
        setAiAgreement("");
        setDoctorComments("");
      }
    } catch (error) {
      console.error('Failed to save report:', error);
    } finally {
      setSavingReport(false);
    }
  }

  function toggleRecommendation(rec: string) {
    setRecommendations(prev => 
      prev.includes(rec) 
        ? prev.filter(r => r !== rec)
        : [...prev, rec]
    );
  }

  if (loading) {
    return (
      <DoctorLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-muted-foreground">Loading case analysis...</div>
        </div>
      </DoctorLayout>
    );
  }

  if (!caseData) {
    return (
      <DoctorLayout>
        <div className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Case Not Found</h2>
            <p className="text-muted-foreground mb-4">The case you're looking for doesn't exist or you don't have access to it.</p>
            <Link to="/doctor/cases">
              <Button>Back to Cases</Button>
            </Link>
          </div>
        </div>
      </DoctorLayout>
    );
  }

  return (
    <DoctorLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/doctor/cases">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cases
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Analysis - Case {caseId}</h1>
              <p className="text-muted-foreground">
                Patient: {caseData.patient?.name || 'Unknown'} 
                {caseData.patient?.email && ` (${caseData.patient.email})`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => navigate(`/doctor/chat?caseId=${encodeURIComponent(caseId!)}`)}
              variant="outline"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Open Chat
            </Button>
            <Button 
              onClick={runAIAnalysis} 
              disabled={analyzing || images.length === 0}
            >
              <Activity className="h-4 w-4 mr-2" />
              {analyzing ? "Analyzing..." : "Run AI Analysis"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Case Info & AI Analysis */}
          <div className="space-y-6">
            {/* Case Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Case Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Case ID:</span> {caseData.caseId}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>{' '}
                    {new Date(caseData.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Patient:</span> {caseData.patient?.name || 'Unknown'}
                  </div>
                  <div>
                    <span className="font-medium">DOB:</span> {caseData.patient?.dob || 'Not specified'}
                  </div>
                </div>
                {caseData.symptoms && (
                  <div className="mt-4">
                    <div className="font-medium text-sm mb-1">Symptoms:</div>
                    <div className="text-sm text-muted-foreground">{caseData.symptoms}</div>
                  </div>
                )}
                {caseData.history && (
                  <div className="mt-4">
                    <div className="font-medium text-sm mb-1">Medical History:</div>
                    <div className="text-sm text-muted-foreground">{caseData.history}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Images */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Images ({images.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {images.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No images uploaded</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {images.map((img, idx) => (
                      <div key={img._id || idx} className="text-center">
                        <img 
                          src={img.display_path?.startsWith('/') 
                            ? `http://localhost:8585${img.display_path}`
                            : `http://localhost:8585/api/images/${img.gridfs_id}`
                          } 
                          className="h-32 w-full object-contain rounded border bg-white"
                          alt={`Case image ${idx + 1}`}
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          {img.modality && <span className="font-medium">{img.modality}</span>}
                          <br />
                          {new Date(img.uploadedAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Analysis Results */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  AI Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!caseData.ai_analysis ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      No AI analysis available. {images.length === 0 ? 'Upload images first.' : 'Click "Run AI Analysis" to start.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {caseData.ai_analysis.display_path && (
                      <div>
                        <div className="font-medium text-sm mb-2">Processed Image:</div>
                        <img 
                          src={`http://localhost:8585${caseData.ai_analysis.display_path}`}
                          className="max-h-64 rounded border object-contain bg-white w-full"
                          alt="AI processed"
                        />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-sm mb-2 flex items-center gap-2">
                        Analysis Summary:
                        {typeof caseData.ai_analysis.confidence === 'number' && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {Math.round(caseData.ai_analysis.confidence)}% confidence
                          </span>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap text-sm bg-muted p-3 rounded">
                        {caseData.ai_analysis.summary}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Analyzed: {new Date(caseData.ai_analysis.analyzedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Reports & Doctor Input */}
          <div className="space-y-6">
            {/* Existing Reports */}
            {reports.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Previous Reports ({reports.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <div key={report._id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{report.authorName}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            report.status === 'final' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {report.status}
                          </span>
                        </div>
                        {report.diagnosis && (
                          <div className="text-sm mb-1">
                            <span className="font-medium">Diagnosis:</span> {report.diagnosis}
                          </div>
                        )}
                        {report.aiAgreement && (
                          <div className="text-sm mb-1">
                            <span className="font-medium">AI Agreement:</span> {report.aiAgreement}
                          </div>
                        )}
                        {report.content && (
                          <div className="text-sm whitespace-pre-wrap bg-muted p-2 rounded mt-2">
                            {report.content}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(report.updatedAt || report.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* New Report Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Create Report
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI Agreement */}
                {caseData.ai_analysis && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">AI Analysis Agreement:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['agree', 'partial', 'disagree'].map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input 
                            type="radio" 
                            name="aiAgreement"
                            value={option}
                            checked={aiAgreement === option}
                            onChange={(e) => setAiAgreement(e.target.value)}
                          />
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagnosis */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Primary Diagnosis:</label>
                  <Textarea 
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Enter primary diagnosis and differential considerations..."
                    className="min-h-[80px]"
                  />
                </div>

                {/* Recommendations */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Recommendations:</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {recommendationOptions.map((rec) => (
                      <label key={rec} className="flex items-center gap-2 text-sm">
                        <input 
                          type="checkbox"
                          checked={recommendations.includes(rec)}
                          onChange={() => toggleRecommendation(rec)}
                        />
                        {rec}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Doctor Comments */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Additional Comments:</label>
                  <Textarea 
                    value={doctorComments}
                    onChange={(e) => setDoctorComments(e.target.value)}
                    placeholder="Additional clinical observations, follow-up notes..."
                    className="min-h-[80px]"
                  />
                </div>

                {/* Full Report Content */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Complete Report:</label>
                  <Textarea 
                    value={reportContent}
                    onChange={(e) => setReportContent(e.target.value)}
                    placeholder="Write the complete medical report here..."
                    className="min-h-[120px]"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-4">
                  <Button 
                    onClick={() => saveReport('draft')}
                    disabled={savingReport || !reportContent.trim()}
                    variant="outline"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button 
                    onClick={() => saveReport('final')}
                    disabled={savingReport || !reportContent.trim() || !diagnosis.trim()}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {savingReport ? 'Saving...' : 'Finalize Report'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DoctorLayout>
  );
}