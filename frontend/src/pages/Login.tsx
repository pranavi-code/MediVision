import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Mail, Lock, ArrowLeft, Moon, Sun, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { login, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  // Visiting /login should always clear any existing session (all roles)
  useEffect(() => {
    logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
  const u = await login(email, password);
  toast({ title: "Welcome back", description: u.name ? u.name : undefined });
  // If we came from a protected page, prefer sending back there when role matches
  const fromPath: string | undefined = location?.state?.from;
  const pathMatchesRole = (path?: string) => {
    if (!path) return false;
    if (path.startsWith("/admin")) return u.role === "admin";
    if (path.startsWith("/doctor")) return u.role === "doctor";
    if (path.startsWith("/lab")) return u.role === "lab_tech";
    if (path.startsWith("/patient")) return u.role === "patient";
    // Generic protected route like /upload is allowed for any logged-in user
    return ["/upload"].some((p) => path.startsWith(p));
  };
  if (fromPath && pathMatchesRole(fromPath)) {
    navigate(fromPath, { replace: true });
  } else {
    // Route by role defaults
    if (u.role === "admin") navigate("/admin", { replace: true });
    else if (u.role === "doctor") navigate("/doctor/cases", { replace: true });
    else if (u.role === "lab_tech") navigate("/lab/cases", { replace: true });
    else if (u.role === "patient") navigate("/patient/cases", { replace: true });
    else navigate("/upload", { replace: true });
  }
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative bg-background">
        <div className="absolute top-8 left-8 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          
        </div>

        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Activity className="h-10 w-10 text-primary" />
              <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                MediVision
              </span>
            </div>
            <h1 className="text-3xl font-bold">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to access your medical AI dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-2.5 text-muted-foreground"
                  onClick={()=>setShowPw(v=>!v)}
                  aria-label={showPw?"Hide password":"Show password"}
                >
                  {showPw ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                </button>
              </div>
            </div>

            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign up for free
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Patient?{" "}
            <Link to="/patient-login" className="text-primary hover:underline font-medium">
              Access your case here
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Image & Info */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary via-primary to-accent p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTZ2LTZoNnYtNmg2djZoNnY2aC02djZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20" />
        
        <div className="relative z-10 flex flex-col justify-center space-y-8 max-w-xl animate-fade-in-up">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight">
              AI-Powered Chest X-ray Diagnosis at Your Fingertips
            </h2>
            <p className="text-lg text-white/90">
              Access advanced multimodal AI models for real-time medical imaging analysis and diagnosis.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm">
              <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold mb-1">Real-Time Analysis</div>
                <div className="text-sm text-white/80">
                  Get instant diagnostic insights powered by GPT-4o and specialized medical AI models
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm">
              <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold mb-1">HIPAA Compliant</div>
                <div className="text-sm text-white/80">
                  Secure, encrypted platform with enterprise-grade privacy protection
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 space-y-2">
            <div className="flex items-center gap-8">
              <div>
                <div className="text-3xl font-bold">99.2%</div>
                <div className="text-sm text-white/80">Diagnostic Accuracy</div>
              </div>
              <div className="h-12 w-px bg-white/20" />
              <div>
                <div className="text-3xl font-bold">2.5k+</div>
                <div className="text-sm text-white/80">Validated Cases</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
