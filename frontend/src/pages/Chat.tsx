import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  Send,
  Trash2,
  RotateCcw,
  Activity,
  FileImage,
  MessageSquare,
  Loader2,
  AlertCircle,
  User,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import AuthorizedImage from "@/components/AuthorizedImage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  image?: string;
  isStreaming?: boolean;
}
interface UploadResponse {
  original_path: string;
  display_path: string;
  error?: string;
}

const BOX_HEIGHT = "min-h-[600px] max-h-[80vh]";

const Chat = () => {
  const { user, token, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const caseId = search.get("caseId");
  const [caseInfo, setCaseInfo] = useState<any | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Persist a stable thread ID across messages so the backend can store per-thread history
  const [threadId, setThreadId] = useState<string>(() => {
    try {
      const existing = sessionStorage.getItem("medrax_thread_id");
      if (existing && existing.length > 0) return existing;
    } catch {}
    const tid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem("medrax_thread_id", tid); } catch {}
    return tid;
  });
  const [threads, setThreads] = useState<any[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dicomInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hard guard: if not authenticated, redirect to login, preserving the target URL
  if (!loading && !token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  /* ------------------------------------------------- */
  /*  Auto-scroll to bottom when new messages arrive   */
  /* ------------------------------------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep thread ID in session storage to persist across reloads in the same tab
  useEffect(() => {
    try { sessionStorage.setItem("medrax_thread_id", threadId); } catch {}
  }, [threadId]);

  // Fetch saved threads for current user (optional UI list)
  const fetchThreads = async () => {
    if (!token) return;
    setThreadsLoading(true);
    try {
      const res = await fetch("http://localhost:8585/api/chat/threads?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(Array.isArray(data.items) ? data.items : []);
      }
    } catch (e) {
      // non-fatal
    } finally {
      setThreadsLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openThread = async (tid: string) => {
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:8585/api/chat/threads/${encodeURIComponent(tid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      // Convert stored messages into ChatMessage[] used by UI
      const toText = (content: any): string => {
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          const textPart = content.find((p: any) => p && p.type === "text" && typeof p.text === "string");
          if (textPart) return textPart.text as string;
          return JSON.stringify(content);
        }
        // image-only content handled separately so we don't render a stray "(image)" bubble
        if (content && typeof content === "object" && content.path) return "";
        try {
          const s = JSON.stringify(content);
          return s;
        } catch {
          return String(content);
        }
      };

      const stripPersona = (text: string): string => {
        if (!text) return text;
        if (text.startsWith("[Persona::")) {
          const parts = text.split("\n\n", 1);
          if (parts.length === 1) return text; // malformed
          return text.slice(text.indexOf("\n\n") + 2);
        }
        return text;
      };

      // Coalesce user image messages into the subsequent user text message
      const raw = Array.isArray(data.messages) ? data.messages : [];
      const restored: ChatMessage[] = [];
      let pendingUserImage: string | null = null;
      for (let i = 0; i < raw.length; i++) {
        const m = raw[i] || {};
        const role: "user" | "assistant" = (m?.role === "user" || m?.role === "assistant")
          ? (m.role as "user" | "assistant")
          : (m?.content != null ? "user" : "assistant");
        const c = m?.content;
        const isImageObj = c && typeof c === "object" && (c.path || c.display_path);
        if (role === "user") {
          if (isImageObj) {
            const rawPath = (c.display_path && String(c.display_path)) || (c.path && String(c.path)) || "";
            const useDisplay = rawPath.toLowerCase().endsWith(".dcm") ? (data.display_path || rawPath) : rawPath;
            pendingUserImage = normalize(useDisplay) || null;
            continue;
          }
          let text = toText(c);
          if (typeof text === "string") text = stripPersona(text);
          restored.push({
            id: generateMessageId(),
            role: "user",
            content: text,
            timestamp: new Date(),
            image: pendingUserImage || undefined,
          });
          pendingUserImage = null;
        } else {
          // assistant
          let image: string | undefined = undefined;
          if (isImageObj) {
            const rawPath = (c.display_path && String(c.display_path)) || (c.path && String(c.path)) || "";
            const useDisplay = rawPath.toLowerCase().endsWith(".dcm") ? (data.display_path || rawPath) : rawPath;
            image = normalize(useDisplay) || undefined;
          }
          const text = isImageObj ? "" : toText(c);
          restored.push({
            id: generateMessageId(),
            role: "assistant",
            content: text,
            timestamp: new Date(),
            image,
          });
        }
      }
      if (pendingUserImage) {
        restored.push({
          id: generateMessageId(),
          role: "user",
          content: "",
          timestamp: new Date(),
          image: pendingUserImage || undefined,
        });
      }

      setThreadId(tid);
      setMessages(restored);
      if (data.display_path) setUploadedImage(normalize(data.display_path));
      else setUploadedImage(null);
      setUploadedImagePath(null);
      setError(null);
    } catch {}
  };

  /* ------------------------------------------------- */
  /*  Light-box ESC handling                           */
  /* ------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    if (lightboxSrc) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxSrc]);

  const generateMessageId = () =>
    Date.now().toString() + Math.random().toString(36).substr(2, 9);

  const normalize = (p?: string | null) => {
    if (!p) return null;
    try {
      if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://"))
        return p;
      let path = p.replace(/\\/g, "/");
      if (/^[a-zA-Z]:\//.test(path)) return null;
      if (!path.startsWith("/")) path = "/" + path;
      return `http://localhost:8585${path}`;
    } catch {
      return null;
    }
  };

  /* ------------------------------------------------- */
  /*  File upload (X-Ray / DICOM)                     */
  /* ------------------------------------------------- */
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    if (caseId) formData.append("case_id", caseId);
    try {
      const response = await fetch("http://localhost:8585/upload", {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data: UploadResponse = await response.json();
      if (data.error) {
        setError(`Upload failed: ${data.error}`);
        return;
      }
      setUploadedImage(normalize(data.display_path || null));
      setUploadedImagePath(data.original_path);
    } catch {
      setError("Failed to upload file. Please check if the server is running.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };
  const handleDicomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  /* ------------------------------------------------- */
  /*  Send message with SSE streaming                 */
  /* ------------------------------------------------- */
  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImagePath) return;

  const userMessageId = generateMessageId();
  const assistantMessageId = generateMessageId();
  // Capture current preview + original path BEFORE clearing state
  const imagePathToSend = uploadedImagePath || null;
  const previewImageToAttach = uploadedImage || null;

    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
      image: previewImageToAttach || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setUploadedImage(null);
    setUploadedImagePath(null);
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const form = new FormData();
      form.append("message", inputMessage);
      form.append("thread_id", threadId);
      const imageWasSent = Boolean(imagePathToSend);
      if (imageWasSent && imagePathToSend) {
        form.append("image_path", imagePathToSend);
      }
      if (caseId) form.append("case_id", caseId);

      const response = await fetch("http://localhost:8585/chat", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("No reader available");

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const dataPrefix = line.startsWith("data: ") ? line.slice(6) : line;
          try {
            const parsed = JSON.parse(dataPrefix);

            if (parsed.error) {
              setError(parsed.error || "Unknown error from server");
              // remove streaming placeholder
              setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
              setIsLoading(false);
              return;
            }

            // Attach any display image to the current assistant message (not the preview)
            if (parsed.display_path && (Boolean(imagePathToSend))) {
              const abs = normalize(parsed.display_path);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, image: abs || m.image } : m
                )
              );
            }

            // Update content progressively.
            // Support either {messages:[...]} or {content: "delta"}
            let nextContent: string | undefined;
            if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
              const msgs = parsed.messages as Array<{ role: string; content: string }>;
              const lastAssist = [...msgs].reverse().find((m) => m.role === "assistant") || msgs[msgs.length - 1];
              nextContent = lastAssist?.content ?? "";
            } else if (typeof parsed.content === "string") {
              // append delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: (m.content || "") + parsed.content }
                    : m
                )
              );
            }

            if (nextContent !== undefined) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, content: String(nextContent) } : m))
              );
            }

            if (parsed.status === "completed") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
              );
            }
          } catch {
            // Not JSON — append raw text
            const text = dataPrefix;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: (m.content ? m.content + "\n" : "") + text }
                  : m
              )
            );
          }
        }
      }

      // finalize: stop streaming indicator
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
      );
      // if assistant message ended up empty (no text/image), remove the placeholder bubble
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === assistantMessageId);
        if (msg && !msg.image && (!msg.content || msg.content.trim().length === 0)) {
          return prev.filter((m) => m.id !== assistantMessageId);
        }
        return prev;
      });
    } catch (err) {
      setError("Failed to send message. Please check if the server is running.");
      // remove failed placeholder
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    // Load case details if caseId present; use role-specific endpoints
    const run = async () => {
      if (caseId && token) {
        try {
          const isPatient = (user?.role === "patient");
          if (isPatient) {
            const [resCase, resImgs, resAnal] = await Promise.all([
              fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}/images`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
              fetch(`http://localhost:8585/api/patient/cases/${encodeURIComponent(caseId)}/analysis`, {
                headers: { Authorization: `Bearer ${token}` },
              }),
            ]);
            if (resCase.ok) {
              const data = await resCase.json();
              setCaseInfo(data);
            }
            if (resImgs.ok) {
              const imgs = await resImgs.json();
              const items = imgs.items || [];
              if (items.length) {
                const latest = items.sort((a: any, b: any) => String(a.uploadedAt).localeCompare(String(b.uploadedAt)))[items.length - 1];
                setUploadedImage(normalize(latest.display_path));
                // Note: we do NOT have original_path from patient endpoint; backend /chat will auto-load by caseId
              }
            }
            if (resAnal.ok) {
              const a = await resAnal.json();
              const summary = a?.analysis?.summary;
              if (summary && messages.length === 0) {
                setMessages([
                  {
                    id: generateMessageId(),
                    role: "assistant",
                    content: `Doctor's analysis for case ${caseId}:\n\n${summary}`,
                    timestamp: new Date(),
                  },
                ]);
              }
            }
          } else {
            const res = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              setCaseInfo(data);
            }
          }
        } catch {}
      } else {
        setCaseInfo(null);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, token]);


  const clearChat = async () => {
    setError(null);
    // Tell backend to clear server-side state and delete persisted thread (best-effort)
    try {
      const form = new FormData();
      form.append("thread_id", threadId);
      await fetch("http://localhost:8585/api/chat/clear", {
        method: "POST",
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {}
    setMessages([]);
    setUploadedImage(null);
    setUploadedImagePath(null);
  };
  const newThread = () => {
    setMessages([]);
    setError(null);
    const tid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setThreadId(tid);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ------------------------------------------------- */
  /*  Render                                           */
  /* ------------------------------------------------- */
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const showStandaloneHeader = !(location.pathname.startsWith("/patient") || location.pathname.startsWith("/doctor") || location.pathname.startsWith("/lab"));
  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 w-full min-h-screen">
      {/* Header (only for general/standalone usage) */}
      {showStandaloneHeader && (
        <div className="border-b bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">MedRAX AI Assistant</h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {caseId && caseInfo ? (
                      <span>
                        Case {caseId} · Patient {caseInfo?.patient?.name || "Unknown"}
                      </span>
                    ) : (
                      <span>Medical Reasoning Agent for Chest X-ray Analysis</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                {user && (
                  <span className="hidden md:inline">
                    {user.role === "doctor"
                      ? ((user.name && !user.name.includes("@"))
                          ? `Dr. ${user.name}`
                          : (user.email
                              ? `Dr. ${user.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c=>c.toUpperCase())}`
                              : "Doctor"))
                      : (user.name && user.name.trim().length > 0 ? user.name : "User")}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { logout(); navigate("/login"); }}
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-2 py-6 max-w-7xl w-full">
        <div className="grid grid-cols-12 gap-6 w-full">
          {/* ---------- LEFT PANEL (CHAT) ---------- */}
          <div className="col-span-12 lg:col-span-8 flex flex-col">
            <Card className={`flex flex-col w-full h-full ${BOX_HEIGHT}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" /> Chat
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 p-0 overflow-hidden">
                {/* Error */}
                {error && (
                  <div className="px-4 pt-3">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Scrollable messages */}
                <ScrollArea className="flex-1 px-4 thin-scrollbar">
                  <div className="space-y-4 py-4">
                    {messages.length === 0 && (
                      <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                        Upload a chest X-ray and ask about the analysis
                      </div>
                    )}

                    {messages.map((message) => {
                      if (
                        message.role === "assistant" &&
                        !message.isStreaming &&
                        !message.image &&
                        (!message.content || message.content.trim() === "")
                      ) {
                        return null; // hide stray empty assistant bubble
                      }
                      return (
                      <div
                        key={message.id}
                        className={`flex gap-3 items-start ${
                          message.role === "user" ? "justify-end" : ""
                        }`}
                      >
                        {message.role === "assistant" && (
                          <img
                            src="/medrax_logo.jpg"
                            alt="MedRAX"
                            className="w-8 h-8 rounded-full border gr-avatar"
                          />
                        )}

                        <div
                          className={`max-w-[75%] ${
                            message.role === "user" ? "text-right" : "text-left"
                          }`}
                        >
                          <div
                            className={
                              message.role === "user"
                                ? "gr-bubble-user"
                                : "gr-bubble-assistant"
                            }
                          >
                            {message.image && (
                              <AuthorizedImage
                                srcPath={normalize(message.image) || undefined}
                                alt="attachment"
                                className="rounded-md border mb-2 max-h-64 object-contain cursor-pointer"
                                onClick={() => setLightboxSrc(normalize(message.image))}
                              />
                            )}
                            <div className="whitespace-pre-wrap">
                              {message.content}
                            </div>

                            {message.isStreaming && (
                              <div className="mt-2 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  Typing
                                  <span className="typing-dots">
                                    <span>.</span>
                                    <span>.</span>
                                    <span>.</span>
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-1 text-[11px] text-slate-500 gr-message-time">
                            {message.timestamp.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>

                        {message.role === "user" && (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center border gr-avatar">
                            <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                          </div>
                        )}
                      </div>
                    );})}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* ---------- INPUT BAR (FIXED) ---------- */}
                <div className="border-t bg-white dark:bg-slate-900 px-4 py-3 shrink-0">
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Ask about the X-ray…"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      disabled={isLoading}
                      className="rounded-md border border-slate-300 focus:border-blue-500 transition text-base px-3 bg-white flex-1 min-w-0 h-11"
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={
                        isLoading || (!inputMessage.trim() && !uploadedImagePath)
                      }
                      className="h-11 px-4 shrink-0"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---------- RIGHT PANEL (IMAGE & ACTIONS) ---------- */}
          <div className="col-span-12 lg:col-span-4 flex flex-col">
            <Card className={`flex flex-col w-full h-full ${BOX_HEIGHT}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileImage className="h-5 w-5" />
                  Image & Actions
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 overflow-auto space-y-4">
                {/* Threads (history) */}
                <div className="w-full rounded-lg border bg-white dark:bg-slate-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Threads</div>
                    <button onClick={fetchThreads} className="text-xs text-blue-600 underline" disabled={threadsLoading}>
                      {threadsLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {(!threads || threads.length === 0) ? (
                    <div className="text-xs text-slate-500">No saved threads yet.</div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-auto thin-scrollbar">
                      {threads.slice(0, 10).map((t) => (
                        <div key={t.threadId} className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            <span className="opacity-70">#{String(t.threadId).slice(-6)}</span>
                            {t.updatedAt ? <span className="ml-2 opacity-60">{String(t.updatedAt).replace('T',' ').slice(0,16)}</span> : null}
                          </div>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openThread(t.threadId)}>
                            Open
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Image preview */}
                <div className="w-full h-[280px] sm:h-[320px] md:h-[360px] rounded-lg border shadow-sm bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  {uploadedImage ? (
                    <AuthorizedImage
                      srcPath={normalize(uploadedImage) || undefined}
                      alt="Uploaded X-ray"
                      className="h-full w-full object-contain"
                      onError={() => setUploadedImage(null)}
                    />
                  ) : (
                    <div className="text-center text-slate-600 dark:text-slate-300">
                      <div className="mb-2 text-blue-600">
                        <Upload className="inline h-6 w-6" />
                      </div>
                      <div className="text-sm">Drop Image Here</div>
                      <div className="text-xs opacity-70">- or -</div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-blue-600 underline"
                      >
                        Click to Upload
                      </button>
                    </div>
                  )}
                </div>

                {/* Upload buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.gif,.webp"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full"
                      variant="outline"
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <FileImage className="h-4 w-4 mr-2" />
                      )}
                      Upload X-Ray
                    </Button>
                  </div>

                  <div>
                    <input
                      ref={dicomInputRef}
                      type="file"
                      accept=".dcm"
                      onChange={handleDicomUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={() => dicomInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full"
                      variant="outline"
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload DICOM
                    </Button>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={clearChat} className="w-full" variant="outline">
                    <Trash2 className="h-4 w-4 mr-2" /> Clear Chat
                  </Button>
                  <Button onClick={newThread} className="w-full" variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" /> New Thread
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Light-box */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl rounded"
          />
        </div>
      )}
    </div>
  );
};

export default Chat;