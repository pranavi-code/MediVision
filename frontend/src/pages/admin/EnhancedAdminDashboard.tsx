import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  FileText, 
  UserPlus, 
  Settings, 
  Activity,
  TrendingUp,
  Clock,
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  Plus,
  Download,
  RefreshCw
} from "lucide-react";

interface DashboardStats {
  totalCases: number;
  totalDoctors: number;
  totalLabTechs: number;
  totalPatients: number;
  activeCases: number;
  completedCases: number;
  pendingScans: number;
  reportsGenerated: number;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  lastLogin?: string;
  specialization?: string;
  department?: string;
}

interface Case {
  _id: string;
  caseId: string;
  patient: {
    name: string;
    email?: string;
  };
  status: string;
  priority: string;
  createdAt: string;
  assignedDoctor?: {
    name: string;
  };
  assignedLabTech?: {
    name: string;
  };
}

export default function EnhancedAdminDashboard() {
  const { token, logout } = useAuth();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalCases: 0,
    totalDoctors: 0,
    totalLabTechs: 0,
    totalPatients: 0,
    activeCases: 0,
    completedCases: 0,
    pendingScans: 0,
    reportsGenerated: 0
  });
  
  const [users, setUsers] = useState<User[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showCaseDialog, setShowCaseDialog] = useState(false);
  
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "",
    specialization: "",
    department: ""
  });
  
  const [newCase, setNewCase] = useState({
    patientName: "",
    patientEmail: "",
    priority: "medium",
    assignedDoctorId: "",
    assignedLabTechId: "",
    description: ""
  });

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  const fetchDashboardData = async () => {
    if (!token) return;

    try {
      setLoading(true);
      
      // Fetch dashboard stats
      const statsRes = await fetch("http://localhost:8585/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats || stats);
      }

      // Fetch users
      const usersRes = await fetch("http://localhost:8585/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.items || []);
      }

      // Fetch recent cases
      const casesRes = await fetch("http://localhost:8585/api/admin/cases?limit=10", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (casesRes.ok) {
        const casesData = await casesRes.json();
        setCases(casesData.items || []);
      }

    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.role) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch("http://localhost:8585/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });

      if (res.ok) {
        toast({
          title: "User Created",
          description: `${newUser.name} has been added to the system`,
        });
        
        setNewUser({
          name: "",
          email: "",
          role: "",
          specialization: "",
          department: ""
        });
        setShowUserDialog(false);
        fetchDashboardData();
      } else {
        const error = await res.text();
        throw new Error(error);
      }
    } catch (error) {
      console.error("Failed to create user:", error);
      toast({
        title: "Failed to Create User",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  const handleCreateCase = async () => {
    if (!newCase.patientName) {
      toast({
        title: "Missing Information",
        description: "Patient name is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch("http://localhost:8585/api/admin/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patient: {
            name: newCase.patientName,
            email: newCase.patientEmail
          },
          priority: newCase.priority,
          assignedDoctorId: newCase.assignedDoctorId || undefined,
          assignedLabTechId: newCase.assignedLabTechId || undefined,
          description: newCase.description
        })
      });

      if (res.ok) {
        const createdCase = await res.json();
        toast({
          title: "Case Created",
          description: `Case ${createdCase.caseId} has been created`,
        });
        
        setNewCase({
          patientName: "",
          patientEmail: "",
          priority: "medium",
          assignedDoctorId: "",
          assignedLabTechId: "",
          description: ""
        });
        setShowCaseDialog(false);
        fetchDashboardData();
      } else {
        const error = await res.text();
        throw new Error(error);
      }
    } catch (error) {
      console.error("Failed to create case:", error);
      toast({
        title: "Failed to Create Case",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`http://localhost:8585/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ active: !currentStatus })
      });

      if (res.ok) {
        toast({
          title: "User Status Updated",
          description: `User has been ${!currentStatus ? "activated" : "deactivated"}`,
        });
        fetchDashboardData();
      }
    } catch (error) {
      console.error("Failed to update user status:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update user status",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const getRoleColor = (role: string) => {
    const colors = {
      admin: "bg-red-100 text-red-800",
      doctor: "bg-blue-100 text-blue-800",
      lab_tech: "bg-green-100 text-green-800",
      patient: "bg-gray-100 text-gray-800"
    };
    return colors[role as keyof typeof colors] || colors.patient;
  };

  const statusColors = {
    awaiting_scan: "bg-yellow-100 text-yellow-800",
    scan_uploaded: "bg-blue-100 text-blue-800",
    in_review: "bg-purple-100 text-purple-800",
    analysis_complete: "bg-green-100 text-green-800",
    report_generated: "bg-green-100 text-green-800"
  };

  const priorityColors = {
    low: "text-green-600 bg-green-50",
    medium: "text-yellow-600 bg-yellow-50",
    high: "text-red-600 bg-red-50",
    urgent: "text-red-800 bg-red-100"
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            System overview and management tools
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDashboardData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={logout} variant="outline">
            Logout
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cases</p>
                <p className="text-2xl font-bold">{stats.totalCases}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.activeCases} active
                </p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats.totalDoctors + stats.totalLabTechs}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.totalDoctors} doctors, {stats.totalLabTechs} lab techs
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Scans</p>
                <p className="text-2xl font-bold">{stats.pendingScans}</p>
                <p className="text-xs text-muted-foreground">
                  Awaiting upload
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reports Generated</p>
                <p className="text-2xl font-bold">{stats.reportsGenerated}</p>
                <p className="text-xs text-muted-foreground">
                  This month
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="cases" className="space-y-6">
        <TabsList>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Cases</h2>
            <Dialog open={showCaseDialog} onOpenChange={setShowCaseDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-1" />
                  Create Case
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Case</DialogTitle>
                  <DialogDescription>
                    Add a new medical case to the system
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Patient Name *</Label>
                    <Input
                      value={newCase.patientName}
                      onChange={(e) => setNewCase(prev => ({ ...prev, patientName: e.target.value }))}
                      placeholder="Enter patient name"
                    />
                  </div>
                  <div>
                    <Label>Patient Email</Label>
                    <Input
                      type="email"
                      value={newCase.patientEmail}
                      onChange={(e) => setNewCase(prev => ({ ...prev, patientEmail: e.target.value }))}
                      placeholder="Enter patient email"
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={newCase.priority} onValueChange={(value) => setNewCase(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={newCase.description}
                      onChange={(e) => setNewCase(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Case description or symptoms"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCaseDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCase}>
                    Create Case
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="space-y-4">
            {cases.map((case_) => (
              <Card key={case_._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{case_.caseId}</h3>
                        <Badge className={statusColors[case_.status as keyof typeof statusColors]}>
                          {case_.status.replace("_", " ").toUpperCase()}
                        </Badge>
                        <Badge className={priorityColors[case_.priority as keyof typeof priorityColors]}>
                          {case_.priority.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Patient: {case_.patient.name} • Created: {formatDate(case_.createdAt)}
                      </div>
                      {case_.assignedDoctor && (
                        <div className="text-sm text-muted-foreground">
                          Doctor: {case_.assignedDoctor.name}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">User Management</h2>
            <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="w-4 h-4 mr-1" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Create a new user account in the system
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={newUser.name}
                      onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div>
                    <Label>Role *</Label>
                    <Select value={newUser.role} onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="lab_tech">Lab Technician</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newUser.role === "doctor" && (
                    <div>
                      <Label>Specialization</Label>
                      <Input
                        value={newUser.specialization}
                        onChange={(e) => setNewUser(prev => ({ ...prev, specialization: e.target.value }))}
                        placeholder="e.g., Cardiology, Radiology"
                      />
                    </div>
                  )}
                  <div>
                    <Label>Department</Label>
                    <Input
                      value={newUser.department}
                      onChange={(e) => setNewUser(prev => ({ ...prev, department: e.target.value }))}
                      placeholder="Enter department"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowUserDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateUser}>
                    Create User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {users.map((user) => (
              <Card key={user._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{user.name}</h3>
                        <Badge className={getRoleColor(user.role)}>
                          {user.role.replace("_", " ").toUpperCase()}
                        </Badge>
                        <Badge variant={user.active ? "default" : "secondary"}>
                          {user.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user.email} • Joined: {formatDate(user.createdAt)}
                      </div>
                      {user.specialization && (
                        <div className="text-sm text-muted-foreground">
                          Specialization: {user.specialization}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleToggleUserStatus(user._id, user.active)}
                      >
                        {user.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="outline" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-4">
          <h2 className="text-lg font-semibold">System Settings</h2>
          
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Current system status and configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>System Version:</span>
                  <Badge variant="outline">v1.0.0</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Database Status:</span>
                  <Badge className="bg-green-100 text-green-800">Connected</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Active Users:</span>
                  <span>{users.filter(u => u.active).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Storage Used:</span>
                  <span>2.3 GB</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>System management tools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="w-4 h-4 mr-2" />
                  System Settings
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="w-4 h-4 mr-2" />
                  View Audit Logs
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  System Health Check
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}