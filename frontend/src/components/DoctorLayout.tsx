import { useState } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Activity, 
  FileText, 
  MessageSquare, 
  LayoutDashboard, 
  LogOut,
  Menu,
  X 
} from "lucide-react";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Inline auth guard to avoid stale view via back/forward cache
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  const navItems = [
    { 
      path: "/doctor/dashboard", 
      label: "Dashboard", 
      icon: LayoutDashboard 
    },
    { 
      path: "/doctor/cases", 
      label: "My Cases", 
      icon: FileText 
    },
    { 
      path: "/doctor/chat", 
      label: "MedRAX Chat", 
      icon: MessageSquare 
    }
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const doctorDisplay = (() => {
    const name = user?.name?.trim();
    if (name && !name.includes("@")) return `Dr. ${name}`;
    const email = user?.email?.trim() || "";
    if (email) {
      const prefix = email.split("@")[0] || "";
      if (prefix) {
        const formatted = prefix.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
        return formatted ? `Dr. ${formatted}` : "Doctor";
      }
    }
    return "Doctor";
  })();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            <Button
              variant="ghost" 
              size="sm"
              className="md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <div className="font-semibold text-lg">MediVision</div>
                <div className="text-xs text-muted-foreground">Doctor Portal</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground hidden sm:block">
              {doctorDisplay}
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-lg transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col h-full pt-16 md:pt-4">
            <nav className="flex-1 px-4 py-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                      ${isActive(item.path) 
                        ? 'bg-primary text-primary-foreground' 
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
