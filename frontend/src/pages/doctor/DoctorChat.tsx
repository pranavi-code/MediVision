import DoctorLayout from "@/components/DoctorLayout";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation, Link } from "react-router-dom";
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
  ArrowLeft
} from "lucide-react";

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

export default function DoctorChat() {
  const { user, token, logout } = useAuth();
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
  // Persist a stable thread ID per doctor chat session so server can store history per thread
  const [threadId, setThreadId] = useState<string>(() => {
    try {
      const existing = sessionStorage.getItem("medrax_doctor_thread_id");
      if (existing && existing.length > 0) return existing;
    } catch {}
    const tid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try { sessionStorage.setItem("medrax_doctor_thread_id", tid); } catch {}
    return tid;
  });
  const [threads, setThreads] = useState<any[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dicomInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Keep thread ID in session storage
  useEffect(() => {
    try { sessionStorage.setItem("medrax_doctor_thread_id", threadId); } catch {}
  }, [threadId]);

  // Load case details if caseId present
  useEffect(() => {
    const loadCase = async () => {
      if (caseId && token) {
        try {
          const res = await fetch(`http://localhost:8585/api/doctor/cases/${encodeURIComponent(caseId)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCaseInfo(data);
          }
        } catch {}
      } else {
        setCaseInfo(null);
      }
    };
    loadCase();
  }, [caseId, token]);

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

  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImagePath) return;

    const userMessageId = generateMessageId();
    const assistantMessageId = generateMessageId();
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
      if (imagePathToSend) {
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
              setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
              setIsLoading(false);
              return;
            }

            if (parsed.display_path && Boolean(imagePathToSend)) {
              const abs = normalize(parsed.display_path);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, image: abs || m.image } : m
                )
              );
            }

            let nextContent: string | undefined;
            if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
              const msgs = parsed.messages as Array<{ role: string; content: string }>;
              const lastAssist = [...msgs].reverse().find((m) => m.role === "assistant") || msgs[msgs.length - 1];
              nextContent = lastAssist?.content ?? "";
            } else if (typeof parsed.content === "string") {
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
            const text = dataPrefix;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: (m.content ? m.content + "\\n" : "") + text }
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
      // if assistant message ended empty (no text/image), remove the placeholder bubble
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === assistantMessageId);
        if (msg && !msg.image && (!msg.content || msg.content.trim().length === 0)) {
          return prev.filter((m) => m.id !== assistantMessageId);
        }
        return prev;
      });
    } catch (err) {
      setError("Failed to send message. Please check if the server is running.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    setError(null);
    // Ask backend to clear and delete persisted thread (best-effort)
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

  // Threads list/load helpers
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
    } catch {}
    setThreadsLoading(false);
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

      const toText = (content: any): string => {
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          const textPart = content.find((p: any) => p && p.type === "text" && typeof p.text === "string");
          if (textPart) return textPart.text as string;
          return JSON.stringify(content);
        }
        // Avoid stray "(image)" bubble; image-only handled separately
        if (content && typeof content === "object" && content.path) return "";
        try { return JSON.stringify(content); } catch { return String(content); }
      };

      const stripPersona = (text: string): string => {
        if (!text) return text;
        if (text.startsWith("[Persona::")) {
          const idx = text.indexOf("\n\n");
          if (idx >= 0) return text.slice(idx + 2);
        }
        return text;
      };

      // Coalesce user image messages into subsequent user text message for clean UI
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
          let image: string | undefined = undefined;
          let text = isImageObj ? "" : toText(c);
          if (isImageObj) {
            const rawPath = (c.display_path && String(c.display_path)) || (c.path && String(c.path)) || "";
            const useDisplay = rawPath.toLowerCase().endsWith(".dcm") ? (data.display_path || rawPath) : rawPath;
            image = normalize(useDisplay) || undefined;
          }
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <DoctorLayout>
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 w-full min-h-screen">

        {/* Main Content */}
        <div className="container mx-auto px-2 py-6 max-w-7xl w-full">
          <div className="grid grid-cols-12 gap-6 w-full">
            {/* Chat */}
            <div className="col-span-12 lg:col-span-8 flex flex-col">
              <Card className={`flex flex-col w-full h-full ${BOX_HEIGHT}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" /> 
                    {caseId ? `Chat for Case ${caseId}` : 'Chat'}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex flex-col flex-1 p-0 overflow-hidden">
                  {error && (
                    <div className="px-4 pt-3">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    </div>
                  )}

                  <ScrollArea className="flex-1 px-4 thin-scrollbar">
                    <div className="space-y-4 py-4">
                      {messages.length === 0 && (
                        <div className="text-center py-12 text-slate-600 dark:text-slate-400">
                          {caseId 
                            ? "Start chatting about this case. Upload images or ask about the patient's condition."
                            : "Upload a chest X-ray and ask about the analysis"
                          }
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
                                <img
                                  src={normalize(message.image) || undefined}
                                  alt="attachment"
                                  className="rounded-md border mb-2 max-h-64 object-contain cursor-pointer"
                                  onClick={() =>
                                    setLightboxSrc(normalize(message.image))
                                  }
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

                  {/* Input Bar */}
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

            {/* Right Panel - Threads, Image & Actions */}
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
                      <img
                        src={normalize(uploadedImage) || undefined}
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

        {/* Lightbox */}
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
    </DoctorLayout>
  );
}