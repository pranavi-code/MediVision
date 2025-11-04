import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  User, 
  FileText, 
  Activity, 
  MessageSquare, 
  LogOut,
  Menu,
  X
} from "lucide-react";

interface PatientLayoutProps {
  children: ReactNode;
}

export default function PatientLayout({ children }: PatientLayoutProps) {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Inline auth guard to prevent BFCache showing protected content when not logged in
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const navigation = [
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
                <div className="text-xs text-muted-foreground">Patient Portal</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground hidden sm:block">
              {user?.name && user.name.trim().length > 0 ? user.name : "Patient"}
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
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-lg transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:shadow-none ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex flex-col h-full pt-16 md:pt-4">
            <nav className="flex-1 px-4 py-4 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                      ${item.current ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
                    `}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
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
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}