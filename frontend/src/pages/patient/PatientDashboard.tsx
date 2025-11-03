import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { 
  Activity, 
  FileText, 
  Heart, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Calendar,
  User
} from "lucide-react";

interface DashboardStats {
  totalCases: number;
  activeCases: number;
  completedReports: number;
  pendingReviews: number;
}

interface RecentCase {
  _id: string;
  caseId: string;
  status: string;
  createdAt: string;
  assignedDoctor?: {
    name: string;
  };
  reportGenerated?: boolean;
}

interface HealthMetric {
  name: string;
  value: string;
  status: "normal" | "attention" | "critical";
  lastUpdated: string;
}

export default function PatientDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCases: 0,
    activeCases: 0,
    completedReports: 0,
    pendingReviews: 0
  });
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      if (!token) return;

      try {
        setLoading(true);
        
        // Fetch dashboard stats
        const statsRes = await fetch("http://localhost:8585/api/patient/dashboard", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData.stats || stats);
          setRecentCases(statsData.recent_cases || []);
        }

        // Fetch health summary
        const healthRes = await fetch("http://localhost:8585/api/patient/health-summary", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setHealthMetrics(healthData.metrics || []);
        }

      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [token]);

  const statusColors = {
    awaiting_scan: "bg-yellow-100 text-yellow-800",
    scan_uploaded: "bg-blue-100 text-blue-800",
    in_review: "bg-purple-100 text-purple-800",
    analysis_complete: "bg-green-100 text-green-800",
    report_generated: "bg-green-100 text-green-800"
  };

  const statusLabels = {
    awaiting_scan: "Awaiting Scan",
    scan_uploaded: "Scan Uploaded", 
    in_review: "Under Review",
    analysis_complete: "Analysis Complete",
    report_generated: "Report Ready"
  };

  const healthStatusColors = {
    normal: "text-green-600 bg-green-50",
    attention: "text-yellow-600 bg-yellow-50",
    critical: "text-red-600 bg-red-50"
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Patient Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your medical cases and health information
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cases</p>
                <p className="text-2xl font-bold">{stats.totalCases}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Cases</p>
                <p className="text-2xl font-bold">{stats.activeCases}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed Reports</p>
                <p className="text-2xl font-bold">{stats.completedReports}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold">{stats.pendingReviews}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Cases */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Cases
              <Button variant="outline" size="sm" asChild>
                <Link to="/patient/cases">View All</Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Your latest medical cases and their current status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentCases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No cases found
              </div>
            ) : (
              <div className="space-y-4">
                {recentCases.slice(0, 5).map((case_) => (
                  <div key={case_._id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">{case_.caseId}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {formatDate(case_.createdAt)}
                      </div>
                      {case_.assignedDoctor && (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <User className="w-3 h-3" />
                          Dr. {case_.assignedDoctor.name}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge className={`${statusColors[case_.status as keyof typeof statusColors]} mb-2`}>
                        {statusLabels[case_.status as keyof typeof statusLabels]}
                      </Badge>
                      {case_.reportGenerated && (
                        <div className="text-xs text-green-600">Report Available</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Health Summary
              <Button variant="outline" size="sm" asChild>
                <Link to="/patient/health">View Details</Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Key health metrics from your recent cases
            </CardDescription>
          </CardHeader>
          <CardContent>
            {healthMetrics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No health data available yet
              </div>
            ) : (
              <div className="space-y-4">
                {healthMetrics.map((metric, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{metric.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Last updated: {formatDate(metric.lastUpdated)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{metric.value}</div>
                      <Badge className={`text-xs ${healthStatusColors[metric.status]}`}>
                        {metric.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Frequently used patient portal features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-20 flex-col" asChild>
              <Link to="/patient/cases">
                <FileText className="w-6 h-6 mb-2" />
                View My Cases
              </Link>
            </Button>
            
            <Button variant="outline" className="h-20 flex-col" asChild>
              <Link to="/patient/reports">
                <TrendingUp className="w-6 h-6 mb-2" />
                Medical Reports
              </Link>
            </Button>
            
            <Button variant="outline" className="h-20 flex-col" asChild>
              <Link to="/patient/messages">
                <AlertCircle className="w-6 h-6 mb-2" />
                Messages & Alerts
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}