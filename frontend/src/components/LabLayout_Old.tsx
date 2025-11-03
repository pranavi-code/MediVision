import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

interface Notifications {
  new_assignments: number;
  urgent_cases: number;
}

interface LabLayoutProps {
  children: React.ReactNode;
}

export default function LabLayout({ children }: LabLayoutProps) {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notifications>({ new_assignments: 0, urgent_cases: 0 });
  const [lastCheck, setLastCheck] = useState<string>("");

  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchNotifications() {
      if (token) {
        try {
          const url = lastCheck 
            ? `http://localhost:8585/api/lab/notifications?since=${encodeURIComponent(lastCheck)}`
            : "http://localhost:8585/api/lab/notifications";
          
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (res.ok) {
            const data = await res.json();
            setNotifications({
              new_assignments: data.new_assignments || 0,
              urgent_cases: data.urgent_cases || 0
            });
            setLastCheck(new Date().toISOString());
          }
        } catch (error) {
          console.error("Failed to fetch lab notifications:", error);
        }
      }
    }

    // Fetch immediately and then every 30 seconds
    fetchNotifications();
    interval = setInterval(fetchNotifications, 30000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, lastCheck]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="border-r p-4 flex flex-col gap-4">
        <div className="text-lg font-semibold">Lab Portal</div>
        
        <nav className="flex flex-col gap-2">
          <Link to="/lab/dashboard">
            <Button variant="ghost" className="w-full justify-start">
              Dashboard
            </Button>
          </Link>
          
          <Link to="/lab/cases">
            <Button variant="ghost" className="w-full justify-start">
              Cases
              {notifications.new_assignments > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {notifications.new_assignments}
                </Badge>
              )}
            </Button>
          </Link>
          
          <Link to="/lab/upload">
            <Button variant="ghost" className="w-full justify-start">
              Upload Scans
              {notifications.urgent_cases > 0 && (
                <Badge variant="outline" className="ml-auto">
                  {notifications.urgent_cases} urgent
                </Badge>
              )}
            </Button>
          </Link>
          
          <Link to="/lab/workflow">
            <Button variant="ghost" className="w-full justify-start">
              Workflow
            </Button>
          </Link>
        </nav>
        
        <div className="mt-auto pt-4 border-t">
          <div className="text-sm text-muted-foreground mb-2">
            {user.name || user.email}
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            Lab Technician
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
            Logout
          </Button>
        </div>
      </aside>
      
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}