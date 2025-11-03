import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Download, 
  Calendar, 
  User, 
  Filter,
  Search,
  Eye,
  TrendingUp
} from "lucide-react";

interface Report {
  _id: string;
  caseId: string;
  reportType: string;
  generatedAt: string;
  doctor: {
    name: string;
    specialization?: string;
  };
  findings: string;
  recommendations: string;
  priority: string;
  status: string;
  modality?: string;
  confidence?: number;
}

export default function PatientReports() {
  const { token } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");

  useEffect(() => {
    async function fetchReports() {
      if (!token) return;

      try {
        setLoading(true);
        const res = await fetch("http://localhost:8585/api/patient/reports", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setReports(data.items || []);
          setFilteredReports(data.items || []);
        }
      } catch (error) {
        console.error("Failed to fetch reports:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchReports();
  }, [token]);

  // Filter reports
  useEffect(() => {
    let filtered = reports;

    if (searchTerm) {
      filtered = filtered.filter(report => 
        report.caseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.findings.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.doctor.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(report => report.reportType === typeFilter);
    }

    if (modalityFilter !== "all") {
      filtered = filtered.filter(report => report.modality === modalityFilter);
    }

    setFilteredReports(filtered);
  }, [reports, searchTerm, typeFilter, modalityFilter]);

  const priorityColors = {
    low: "text-green-600 bg-green-50",
    medium: "text-yellow-600 bg-yellow-50", 
    high: "text-red-600 bg-red-50",
    urgent: "text-red-800 bg-red-100"
  };

  const reportTypeLabels = {
    ai_analysis: "AI Analysis",
    doctor_review: "Doctor Review",
    final_report: "Final Report",
    follow_up: "Follow-up"
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handleDownloadReport = async (reportId: string, caseId: string) => {
    try {
      const res = await fetch(`http://localhost:8585/api/patient/reports/${reportId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${caseId}_report.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download report:", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-40 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Medical Reports</h1>
        <p className="text-sm text-muted-foreground">
          View and download your medical analysis reports
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(reportTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={modalityFilter} onValueChange={setModalityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Modalities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modalities</SelectItem>
                <SelectItem value="CT">CT Scan</SelectItem>
                <SelectItem value="MRI">MRI</SelectItem>
                <SelectItem value="X-Ray">X-Ray</SelectItem>
                <SelectItem value="Ultrasound">Ultrasound</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="text-sm text-muted-foreground flex items-center">
              Showing {filteredReports.length} of {reports.length} reports
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="space-y-4">
        {filteredReports.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No reports found</h3>
              <p className="text-muted-foreground">
                {searchTerm || typeFilter !== "all" || modalityFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "You don't have any medical reports yet"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredReports.map((report) => (
            <Card key={report._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-3">
                      Case {report.caseId}
                      <Badge variant="outline">
                        {reportTypeLabels[report.reportType as keyof typeof reportTypeLabels]}
                      </Badge>
                      <Badge className={`${priorityColors[report.priority as keyof typeof priorityColors]}`}>
                        {report.priority.toUpperCase()}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(report.generatedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Dr. {report.doctor.name}
                        {report.doctor.specialization && (
                          <span className="text-xs">({report.doctor.specialization})</span>
                        )}
                      </span>
                      {report.modality && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {report.modality}
                        </span>
                      )}
                      {report.confidence && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          {Math.round(report.confidence * 100)}% confidence
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/patient/reports/${report._id}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </a>
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleDownloadReport(report._id, report.caseId)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Findings */}
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Key Findings</h4>
                    <p className="text-sm leading-relaxed">
                      {report.findings.length > 200 
                        ? `${report.findings.substring(0, 200)}...` 
                        : report.findings
                      }
                    </p>
                  </div>
                  
                  {/* Recommendations */}
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Recommendations</h4>
                    <p className="text-sm leading-relaxed">
                      {report.recommendations.length > 200
                        ? `${report.recommendations.substring(0, 200)}...`
                        : report.recommendations
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reports Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{reports.length}</div>
                <div className="text-sm text-muted-foreground">Total Reports</div>
              </div>
              
              {Object.entries(reportTypeLabels).map(([type, label]) => {
                const count = reports.filter(r => r.reportType === type).length;
                if (count === 0) return null;
                return (
                  <div key={type} className="text-center">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground">{label}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}