import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  CheckCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dicomInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentStreamingMessageId = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateMessageId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8585/upload', {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await response.json();

      if (data.error) {
        setError(`Upload failed: ${data.error}`);
        return;
      }

      // Set the display path for preview and original path for API calls
      setUploadedImage(data.display_path);
      setUploadedImagePath(data.original_path);

      // Add upload success message
      const uploadMessage: ChatMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: `✅ File uploaded successfully: ${file.name}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, uploadMessage]);

    } catch (error) {
      console.error('Upload error:', error);
      setError('Failed to upload file. Please check if the server is running.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDicomUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() && !uploadedImagePath) return;

    const userMessageId = generateMessageId();
    const assistantMessageId = generateMessageId();

    // Add user message
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
      image: uploadedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);
    setError(null);

    // Add streaming assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, assistantMessage]);
    currentStreamingMessageId.current = assistantMessageId;

    try {
      const formData = new FormData();
      formData.append('message', inputMessage);
      if (uploadedImagePath) {
        formData.append('image_path', uploadedImagePath);
      }

      const response = await fetch('http://localhost:8585/chat', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (!reader) {
        throw new Error('No reader available');
      }

      // We'll accumulate chunks and split on SSE event delimiter (\n\n)
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events
        const parts = buffer.split('\n\n');
        // keep the last incomplete part in buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;

          // Expect lines starting with 'data: '
          const dataPrefix = line.startsWith('data: ') ? line.slice(6) : line;

          try {
            const parsed = JSON.parse(dataPrefix);

            // If parsed contains an error, show it
            if (parsed.error) {
              setError(parsed.error || 'Unknown error from backend');
              // remove streaming placeholder
              setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
              setIsLoading(false);
              currentStreamingMessageId.current = null;
              return;
            }

            // Update display image if present
            if (parsed.display_path) {
              // display_path may be a relative path like /uploads/...
              setUploadedImage(parsed.display_path);
            }

            if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
              // take the last assistant message content
              const msgs = parsed.messages;
              const lastAssist = [...msgs].reverse().find((m: any) => m.role === 'assistant') || msgs[msgs.length - 1];
              const content = lastAssist?.content ?? '';

              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: String(content) }
                  : msg
              ));
            }

            if (parsed.status === 'completed') {
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg
              ));
            }

          } catch (err) {
            // Not JSON — append raw text safely
            const text = dataPrefix;
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: (msg.content ? msg.content + '\n' : '') + text }
                : msg
            ));
          }
        }
      }

      // finalize
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (error) {
      console.error('Chat error:', error);
      setError('Failed to send message. Please check if the server is running.');
      
      // Remove the failed streaming message
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      currentStreamingMessageId.current = null;
    }
  };

  const clearChat = () => {
    setMessages([]);
    setUploadedImage(null);
    setUploadedImagePath(null);
    setError(null);
  };

  const newThread = () => {
    setMessages([]);
    setError(null);
    // Keep the uploaded image for new thread
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="border-b bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                MedRAX AI Assistant
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Medical Reasoning Agent for Chest X-ray Analysis
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          
          {/* Chat Section */}
          <div className="lg:col-span-2 flex flex-col">
            <Card className="flex-1 flex flex-col shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chat
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={newThread}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      New Thread
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearChat}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0">
                {/* Messages */}
                <ScrollArea className="flex-1 px-4">
                  <div className="space-y-4 py-4">
                    {messages.length === 0 && (
                      <div className="text-center py-12">
                        <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-600 dark:text-slate-400">
                          Upload a chest X-ray and ask about the analysis
                        </p>
                      </div>
                    )}
                    
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-700 border shadow-sm'
                          }`}
                        >
                          {message.image && (
                            <div className="mb-2">
                              <img
                                src={message.image}
                                alt="Uploaded"
                                className="max-w-[200px] rounded-lg border"
                              />
                            </div>
                          )}
                          
                          <div className="whitespace-pre-wrap break-words">
                            {message.content}
                            {message.isStreaming && (
                              <Loader2 className="h-4 w-4 animate-spin inline-block ml-2" />
                            )}
                          </div>
                          
                          <div className="text-xs opacity-70 mt-2">
                            {message.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div ref={messagesEndRef} />
                </ScrollArea>

                {/* Error Display */}
                {error && (
                  <div className="px-4 pb-2">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Input Area */}
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask about the X-ray..."
                      disabled={isLoading}
                      className="flex-1"
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={isLoading || (!inputMessage.trim() && !uploadedImagePath)}
                      size="icon"
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

          {/* Image Upload & Preview Section */}
          <div className="flex flex-col gap-4">
            
            {/* Image Preview */}
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileImage className="h-5 w-5" />
                  Image Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {uploadedImage ? (
                  <div className="space-y-3">
                    <img
                      src={uploadedImage}
                      alt="Uploaded X-ray"
                      className="w-full rounded-lg border shadow-sm"
                    />
                    <Badge variant="secondary" className="w-full justify-center">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Image Ready
                    </Badge>
                  </div>
                ) : (
                  <div className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <FileImage className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        No image uploaded
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload Controls */}
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Files
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                
                {/* Image Upload */}
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
                    Upload X-Ray Image
                  </Button>
                </div>

                <Separator />

                {/* DICOM Upload */}
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
                    Upload DICOM File
                  </Button>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 text-center">
                  Supported: PNG, JPG, JPEG, GIF, WebP, DICOM
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">How to Use</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">1</div>
                  <p>Upload a chest X-ray image or DICOM file</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">2</div>
                  <p>Ask questions about the medical image</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">3</div>
                  <p>Get AI-powered medical analysis and insights</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;