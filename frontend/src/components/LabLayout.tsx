import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Upload, LogOut, Menu, X } from "lucide-react";

interface LabLayoutProps {
  children: React.ReactNode;
}

export default function LabLayout({ children }: LabLayoutProps) {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!token) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;

  const nav = [
    { path: "/lab/cases", label: "Cases", icon: FileText },
    { path: "/lab/upload", label: "Upload Scans", icon: Upload },
  ];

  const isActive = (p: string) => location.pathname === p;
  const onLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setOpen(v => !v)}>
              {open ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}
            </Button>
            <div className="font-semibold text-lg">MediVision Lab</div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{(user?.name && user.name.trim().length>0) ? user.name : "Lab"}</span>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-2"/>Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform md:relative md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <nav className="pt-16 md:pt-4 px-4 py-4 space-y-2">
            {nav.map(n => {
              const Icon: any = n.icon;
              return (
                <Link key={n.path} to={n.path} onClick={() => setOpen(false)} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${isActive(n.path) ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-5 w-5"/>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
        <main className="flex-1 min-h-screen">
          <div className="mx-auto w-full max-w-6xl p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}