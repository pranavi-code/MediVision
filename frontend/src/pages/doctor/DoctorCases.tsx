import DoctorLayout from "@/components/DoctorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Search, MessageSquare, Activity, Eye } from "lucide-react";

type CaseItem = {
  _id: string;
  caseId: string;
  createdAt?: string;
  updatedAt?: string;
  patient?: { name?: string; dob?: string; phone?: string; email?: string };
  images?: any[];
  ai_analysis?: { summary?: string; confidence?: number };
  reports?: any[];
  history?: string;
  symptoms?: string;
};

export default function DoctorCases() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadCases();
  }, [token]);

  async function loadCases() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8585/api/doctor/cases", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setCases(data.items || []);
    } catch (error) {
      console.error('Failed to load cases:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredCases = useMemo(() => {
    if (!searchTerm) return cases;
    const term = searchTerm.toLowerCase();
    return cases.filter(c => 
      c.caseId.toLowerCase().includes(term) ||
      (c.patient?.name || '').toLowerCase().includes(term) ||
      (c.patient?.email || '').toLowerCase().includes(term)
    );
  }, [cases, searchTerm]);

  const openChat = (caseId: string) => {
    navigate(`/doctor/chat?caseId=${encodeURIComponent(caseId)}`);
  };

  const openAnalysis = (caseId: string) => {
    navigate(`/doctor/analysis/${encodeURIComponent(caseId)}`);
  };

  if (loading) {
    return (
      <DoctorLayout>
        <div className="p-6 flex items-center justify-center">
          <div className="text-muted-foreground">Loading cases...</div>
        </div>
      </DoctorLayout>
    );
  }

  return (
    <DoctorLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Cases</h1>
            <p className="text-muted-foreground">
              Manage your patient cases and access MedRAX analysis
            </p>
          </div>
          <Button onClick={loadCases} variant="outline">
            Refresh
          </Button>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by case ID, patient name, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Cases Grid */}
        {filteredCases.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-muted-foreground">
                {searchTerm ? 'No cases match your search' : 'No cases found'}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredCases.map((caseItem) => (
              <Card key={caseItem._id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">Case {caseItem.caseId}</CardTitle>
                      <div className="space-y-1 mt-2">
                        <div className="text-sm">
                          <span className="font-medium">Patient:</span>{' '}
                          {caseItem.patient?.name || 'Unknown'}
                        </div>
                        {caseItem.patient?.email && (
                          <div className="text-sm text-muted-foreground">
                            {caseItem.patient.email}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(caseItem.createdAt || '').toLocaleString()}
                        </div>
                        {caseItem.updatedAt !== caseItem.createdAt && (
                          <div className="text-xs text-muted-foreground">
                            Updated: {new Date(caseItem.updatedAt || '').toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => openChat(caseItem.caseId)}
                        size="sm"
                        className="w-full"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Open Chat
                      </Button>
                      <Button
                        onClick={() => openAnalysis(caseItem.caseId)}
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        <Activity className="h-4 w-4 mr-2" />
                        Analysis
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Images:</span>{' '}
                      {(caseItem.images || []).length}
                    </div>
                    <div>
                      <span className="font-medium">AI Analysis:</span>{' '}
                      {caseItem.ai_analysis ? (
                        <span className="text-green-600">
                          Complete ({Math.round(caseItem.ai_analysis.confidence || 0)}% confidence)
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not run</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Reports:</span>{' '}
                      {(caseItem.reports || []).length}
                    </div>
                  </div>
                  
                  {/* Quick preview of symptoms/history if available */}
                  {(caseItem.symptoms || caseItem.history) && (
                    <div className="mt-3 pt-3 border-t">
                      {caseItem.symptoms && (
                        <div className="text-xs">
                          <span className="font-medium">Symptoms:</span>{' '}
                          {caseItem.symptoms.substring(0, 100)}
                          {caseItem.symptoms.length > 100 && '...'}
                        </div>
                      )}
                      {caseItem.history && (
                        <div className="text-xs mt-1">
                          <span className="font-medium">History:</span>{' '}
                          {caseItem.history.substring(0, 100)}
                          {caseItem.history.length > 100 && '...'}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}