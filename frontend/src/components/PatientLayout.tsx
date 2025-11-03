import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  FileText, 
  Activity, 
  MessageSquare, 
  Settings, 
  LogOut,
  Bell
} from "lucide-react";

interface PatientLayoutProps {
  children: ReactNode;
}

export default function PatientLayout({ children }: PatientLayoutProps) {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(0);
  
  // Inline auth guard to prevent BFCache showing protected content when not logged in
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  useEffect(() => {
    // Fetch notification count
    async function fetchNotifications() {
      if (!token) return;

      try {
        const res = await fetch("http://localhost:8585/api/patient/notifications", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.unread_count || 0);
        }
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    }

    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const navigation = [
    {
      name: "Dashboard",
      href: "/patient/dashboard",
      icon: Activity,
      current: location.pathname === "/patient/dashboard"
    },
    {
      name: "My Cases",
      href: "/patient/cases",
      icon: FileText,
      current: location.pathname.startsWith("/patient/cases")
    },
    {
      name: "MedRAX Chat",
      href: "/patient/chat",
      icon: MessageSquare,
      current: location.pathname === "/patient/chat"
    }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="flex flex-col w-64 bg-white shadow-sm">
        {/* Logo */}
        <div className="flex items-center justify-center h-16 px-4 border-b">
          <h1 className="text-xl font-bold text-primary">MediVision</h1>
          <Badge variant="secondary" className="ml-2 text-xs">
            Patient Portal
          </Badge>
        </div>

        {/* User Info */}
        <div className="p-4 border-b">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                <User className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">
                {user?.name || "Patient"}
              </p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  item.current
                    ? "bg-primary/10 text-primary border-r-2 border-primary"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon
                  className={`mr-3 flex-shrink-0 h-5 w-5 ${
                    item.current ? "text-primary" : "text-gray-400 group-hover:text-gray-500"
                  }`}
                />
                {item.name}
                {item.name === "MedRAX Chat" && notifications > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs">
                    {notifications}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="flex-shrink-0 p-4 border-t">
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              asChild
            >
              <Link to="/patient/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex-1"></div>
            
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <Button variant="ghost" size="sm" asChild>
                <Link to="/patient/notifications" className="relative">
                  <Bell className="h-5 w-5" />
                  {notifications > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-2 -right-2 text-xs min-w-[1.25rem] h-5 flex items-center justify-center p-1"
                    >
                      {notifications > 99 ? "99+" : notifications}
                    </Badge>
                  )}
                </Link>
              </Button>
              
              {/* User menu */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {user?.name?.split(" ")[0] || "Patient"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}