import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Shield, Zap, Activity, Users, FileText, ArrowRight, Sparkles, ChevronDown, Moon, Sun } from "lucide-react";
import heroImage from "@/assets/hero-medical-ai.jpg";
import featuresBg from "@/assets/features-bg.jpg";

const Landing = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Animated background gradient */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-accent/10 animate-gradient-shift rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/10 via-transparent to-primary/10 animate-gradient-shift rounded-full blur-3xl" style={{ animationDelay: "2s" }} />
      </div>
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/70 backdrop-blur-xl border-b border-border/50 animate-fade-in">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 group cursor-pointer">
              <Activity className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                MediVision
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="relative overflow-hidden"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
              <Link to="/login">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link to="/signup">
                <Button variant="hero">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary rounded-full animate-ping" style={{ animationDuration: "3s" }} />
          <div className="absolute top-1/3 right-1/3 w-2 h-2 bg-accent rounded-full animate-ping" style={{ animationDuration: "4s", animationDelay: "1s" }} />
          <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-primary rounded-full animate-ping" style={{ animationDuration: "5s", animationDelay: "2s" }} />
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 animate-slide-in-right hover:scale-105 transition-transform">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span className="text-sm font-medium">AI-Powered Medical Diagnosis</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold leading-tight animate-fade-in-up">
                Multimodal AI for{" "}
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] animate-gradient-shift bg-clip-text text-transparent">
                  Real-Time
                </span>{" "}
                Chest X-ray Diagnosis
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed animate-fade-in" style={{ animationDelay: "200ms" }}>
                MediVision combines advanced AI models for segmentation, classification, and visual question
                answering to assist clinicians in interpreting chest X-rays with unprecedented accuracy.
              </p>
              <div className="flex flex-wrap gap-4 animate-fade-in" style={{ animationDelay: "400ms" }}>
                <Link to="/signup">
                  <Button variant="hero" size="lg" className="group">
                    Start Diagnosing
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg">
                  View Demo
                </Button>
              </div>
              <div className="flex items-center gap-8 pt-4 animate-fade-in" style={{ animationDelay: "600ms" }}>
                <div className="text-center group cursor-default">
                  <div className="text-3xl font-bold text-primary group-hover:scale-110 transition-transform">99.2%</div>
                  <div className="text-sm text-muted-foreground">Accuracy</div>
                </div>
                <div className="h-12 w-px bg-border" />
                <div className="text-center group cursor-default">
                  <div className="text-3xl font-bold text-primary group-hover:scale-110 transition-transform">2.5k+</div>
                  <div className="text-sm text-muted-foreground">Test Cases</div>
                </div>
                <div className="h-12 w-px bg-border" />
                <div className="text-center group cursor-default">
                  <div className="text-3xl font-bold text-primary group-hover:scale-110 transition-transform">7</div>
                  <div className="text-sm text-muted-foreground">AI Models</div>
                </div>
              </div>
            </div>
            <div className="relative group animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-accent/30 rounded-3xl blur-3xl group-hover:blur-2xl transition-all" />
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-3xl opacity-20 group-hover:opacity-30 animate-pulse-glow" />
              <img
                src={heroImage}
                alt="MediVision AI Analysis"
                className="relative rounded-3xl shadow-2xl border border-primary/20 group-hover:scale-[1.02] transition-transform duration-500"
              />
            </div>
          </div>
          </div>
          
          {/* Scroll indicator */}
          <div className="flex justify-center mt-16 animate-bounce">
            <ChevronDown className="h-8 w-8 text-muted-foreground" />
          </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="absolute inset-0 opacity-5">
          <img src={featuresBg} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Powered by{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Advanced AI
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our intelligent agent orchestrates multiple specialized models to deliver comprehensive diagnostic insights
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-8 rounded-2xl bg-card/80 backdrop-blur-sm border border-border hover:border-primary/50 transition-all hover:shadow-2xl hover:-translate-y-2 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <feature.icon className="h-6 w-6 text-primary animate-pulse" style={{ animationDuration: "3s" }} />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">Built on Cutting-Edge Technology</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Leveraging state-of-the-art AI models and frameworks
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {techStack.map((tech, index) => (
              <div
                key={index}
                className="p-6 rounded-xl bg-card/80 backdrop-blur-sm border border-border text-center hover:border-primary/50 transition-all hover:scale-105 hover:shadow-xl animate-fade-in group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="text-2xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform">{tech.name}</div>
                <div className="text-sm text-muted-foreground">{tech.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="relative rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-12 md:p-16 text-center overflow-hidden group hover:shadow-2xl transition-shadow">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTZ2LTZoNnYtNmg2djZoNnY2aC02djZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <div className="relative z-10 space-y-6 max-w-3xl mx-auto animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-bold text-white animate-fade-in-up">
                Ready to Transform Medical Diagnosis?
              </h2>
              <p className="text-xl text-white/90">
                Join leading healthcare professionals using MediVision for accurate, AI-powered chest X-ray analysis
              </p>
              <div className="flex flex-wrap gap-4 justify-center pt-4">
                <Link to="/signup">
                  <Button variant="glass" size="lg" className="bg-white text-primary hover:bg-white/90">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
                  Contact Sales
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">MediVision</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2025 MediVision. HIPAA-compliant medical AI platform.
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Privacy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms</a>
              <a href="#" className="hover:text-primary transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const features = [
  {
    icon: Brain,
    title: "Intelligent Agent Workflow",
    description: "ReAct-based reasoning orchestrates multiple AI models for complex multi-step clinical queries.",
  },
  {
    icon: Zap,
    title: "Real-Time Analysis",
    description: "Instant segmentation, classification, and diagnosis using state-of-the-art deep learning models.",
  },
  {
    icon: Shield,
    title: "HIPAA Compliant",
    description: "Secure, privacy-conscious architecture with encrypted storage and RBAC access control.",
  },
  {
    icon: FileText,
    title: "Automated Reports",
    description: "Generate comprehensive diagnostic reports with visual explanations and clinical recommendations.",
  },
  {
    icon: Users,
    title: "Multi-User Support",
    description: "Designed for doctors, radiologists, medical students, and clinical researchers.",
  },
  {
    icon: Activity,
    title: "Visual Question Answering",
    description: "Natural language interface powered by GPT-4o and LLaVA-Med for intuitive interaction.",
  },
];

const techStack = [
  { name: "GPT-4o", description: "Multimodal LLM" },
  { name: "MedSAM", description: "Segmentation" },
  { name: "CheXagent", description: "Visual QA" },
  { name: "DenseNet-121", description: "Classification" },
  { name: "RoentGen", description: "X-ray Generation" },
  { name: "Maira-2", description: "Grounding" },
  { name: "LangGraph", description: "Orchestration" },
  { name: "FastAPI", description: "Backend" },
];

export default Landing;
