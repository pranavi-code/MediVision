import DoctorLayout from "@/components/DoctorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, FileText, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function DoctorDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    totalCases: 0,
    todayCases: 0,
    pendingReports: 0,
    completedAnalyses: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [token]);

  async function loadDashboardData() {
    if (!token) return;
    
    try {
      // Load cases for stats
      const res = await fetch("http://localhost:8585/api/doctor/cases", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const cases = data.items || [];
      
      const today = new Date().toDateString();
      const todayCount = cases.filter((c: any) => 
        new Date(c.createdAt || '').toDateString() === today
      ).length;
      
      const withAnalysis = cases.filter((c: any) => c.ai_analysis).length;
      const withReports = cases.filter((c: any) => 
        (c.reports || []).length > 0
      ).length;
      
      setStats({
        totalCases: cases.length,
        todayCases: todayCount,
        pendingReports: cases.length - withReports,
        completedAnalyses: withAnalysis
      });

      // Recent activity (simplified)
      const recent = cases.slice(0, 5).map((c: any) => ({
        id: c.caseId,
        patient: c.patient?.name || 'Unknown',
        action: c.ai_analysis ? 'AI Analysis Complete' : 'Case Created',
        time: c.updatedAt || c.createdAt
      }));
      setRecentActivity(recent);
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }

  return (
    <DoctorLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, Doctor. Here's your overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCases}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Cases</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayCases}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Analyses</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedAnalyses}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingReports}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div>
                      <div className="font-medium text-sm">Case {item.id}</div>
                      <div className="text-xs text-muted-foreground">
                        Patient: {item.patient} • {item.action}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.time).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DoctorLayout>
  );
}