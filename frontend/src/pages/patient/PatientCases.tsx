import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Calendar, 
  User, 
  Eye,
  Search,
  MessageCircle
} from "lucide-react";
interface PatientInfo { name?: string; email?: string; dob?: string; phone?: string }
interface CaseItem {
  _id: string;
  caseId: string;
  createdAt?: string;
  assignedDoctor?: { name?: string };
  description?: string;
  modality?: string;
  images?: Array<{ display_path?: string; modality?: string; uploadedAt?: string }>;
  reports?: Array<{ status?: string; createdAt?: string }>;
}

export default function PatientCases() {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [filteredCases, setFilteredCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function fetchCases() {
      if (!token) return;

      try {
        setLoading(true);
        const res = await fetch("http://localhost:8585/api/patient/cases", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setCases(data.items || []);
          setFilteredCases(data.items || []);
        }
      } catch (error) {
        console.error("Failed to fetch cases:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCases();
  }, [token]);

  // Filter cases based on search only (no status/priority)
  useEffect(() => {
    let filtered = cases;
    if (searchTerm) {
      filtered = filtered.filter((c) =>
        c.caseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.assignedDoctor?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredCases(filtered);
  }, [cases, searchTerm]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
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
            <div key={i} className="animate-pulse h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">My Cases</h1>
        <p className="text-sm text-muted-foreground">View your cases, images, and reports</p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="text-sm text-muted-foreground flex items-center">
              Showing {filteredCases.length} of {cases.length} cases
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cases List */}
      <div className="space-y-4">
        {filteredCases.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No cases found</h3>
              <p className="text-muted-foreground">
                {searchTerm ? "Try adjusting your search" : "You don't have any medical cases yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCases.map((case_) => (
            <Card key={case_._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    {/* Case ID */}
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{case_.caseId}</h3>
                      {case_.reports && case_.reports.some(r => r.status === "final") && (
                        <span className="text-xs text-green-600">Report Available</span>
                      )}
                    </div>

                    {/* Description */}
                    {case_.description && (
                      <p className="text-muted-foreground">{case_.description}</p>
                    )}

                    {/* Case Details */}
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        Created: {formatDate(case_.createdAt || "")}
                      </div>
                      
                      {case_.assignedDoctor?.name && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="w-4 h-4" />
                          Dr. {case_.assignedDoctor.name}
                        </div>
                      )}
                      {/* Images count */}
                      <div className="text-sm text-muted-foreground">
                        {case_.images?.length ? `${case_.images.length} image${case_.images.length>1?"s":""}` : "No images yet"}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/patient/cases/${case_.caseId}`}>
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/patient/chat?caseId=${encodeURIComponent(case_.caseId)}`}>
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Ask MedRAX
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {/* End */}
    </div>
  );
}