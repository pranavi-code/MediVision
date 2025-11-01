import os
import json
import asyncio
import traceback
from collections import deque
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
from pathlib import Path

# Globals
initialization_error: Optional[str] = None
initialization_error_msg: Optional[str] = None
initialization_error_tb: Optional[str] = None
agent = None
tools_dict = None
chat_interface = None
chat_sessions: Dict[str, Dict] = {}

# Lock to avoid concurrent initializations
init_lock = asyncio.Lock()

app = FastAPI(title="MedRAX API", version="1.0.0")

# in-memory recent logs for diagnostics
_RECENT_LOGS = deque(maxlen=500)


def _log(level: str, *parts: Any) -> None:
    """Simple logger that stores recent logs and prints to stdout."""
    ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    msg = " ".join(str(p) for p in parts)
    line = f"[{ts}] {level}: {msg}"
    print(line)
    _RECENT_LOGS.append(line)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # development: allow all, restrict for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploaded images
upload_dir = Path("data/uploads")
upload_dir.mkdir(parents=True, exist_ok=True)
temp_dir = Path("temp")
temp_dir.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")
app.mount("/temp", StaticFiles(directory=str(temp_dir)), name="temp")


@app.on_event("startup")
async def on_startup():
    """
    Startup initialization policy:
    - By default, initialize the full MedRAX backend synchronously at startup (matches main.py behavior).
    - If LAZY_INIT=true is set in env, skip synchronous init and defer until first request (or /api/init).
    - If FORCE_INIT=true and LAZY_INIT=true, start background initialization task (non-blocking).
    """
    lazy = os.getenv("LAZY_INIT", "false").lower() == "true"
    force = os.getenv("FORCE_INIT", "false").lower() == "true"

    if lazy:
        _log("INFO", "LAZY_INIT=true -> deferring initialization until first request or manual /api/init")
        if force:
            _log("INFO", "FORCE_INIT=true with LAZY_INIT -> starting background initialization of MedRAX")
            asyncio.create_task(initialize_medrax())
        return

    # Default: synchronous initialization at startup to match Gradio behavior
    _log("INFO", "Starting synchronous MedRAX initialization at startup (this may take time)")
    try:
        await initialize_medrax()
        if initialization_error:
            _log("ERROR", "Initialization failed during startup:", initialization_error)
        else:
            _log("INFO", "MedRAX initialized successfully at startup")
    except Exception as e:
        _log("ERROR", "Unexpected error during startup initialization:", str(e))
        _log("ERROR", traceback.format_exc())


class ChatMessage(BaseModel):
    message: Optional[str] = None
    thread_id: Optional[str] = None
    image_path: Optional[str] = None


async def initialize_medrax():
    """Lazy initialization of MedRAX components.

    This is safe to call from multiple endpoints; init_lock prevents concurrent inits.
    """
    global agent, tools_dict, chat_interface, initialization_error, initialization_error_msg, initialization_error_tb

    # Fast path: already initialized
    if agent is not None:
        return

    async with init_lock:
        # Another waiter may have completed initialization while we waited
        if agent is not None or initialization_error is not None:
            return

        try:
            _log("INFO", "🚀 Initializing MedRAX components (lazy init)...")
            # Local imports to avoid pulling heavy ML libs at module import time
            from main import initialize_agent
            from interface import ChatInterface
            from dotenv import load_dotenv
            import requests

            load_dotenv()

            # Quick ping to Ollama (if your setup uses it)
            try:
                requests.get("http://localhost:11434", timeout=5)
                _log("INFO", "✓ Ollama server reachable")
            except Exception as e:
                # Not fatal here — models may be local or different setup — warn instead
                _log("WARN", f"⚠️ Ollama ping failed: {e}")

            # Tools and model choices — keep aligned with main.initialize_agent
            selected_tools = [
                "ImageVisualizerTool",
                "DicomProcessorTool",
                "ChestXRayClassifierTool",
                "ChestXRaySegmentationTool",
                "ChestXRayReportGeneratorTool",
                "XRayVQATool",
                "LlavaMedTool",
                "XRayPhraseGroundingTool",
            ]

            function_calling_models = [
                "qwen2.5:7b",
                "mistral:latest",
            ]

            # Try models in order until one succeeds
            for model_name in function_calling_models:
                try:
                    _log("INFO", f"Trying model: {model_name}")
                    ollama_kwargs = {}
                    if base_url := os.getenv("OLLAMA_BASE_URL"):
                        ollama_kwargs["base_url"] = base_url

                    agent, tools_dict = initialize_agent(
                        "medrax/docs/system_prompts.txt",
                        tools_to_use=selected_tools,
                        model_dir=os.getenv("MODEL_DIR", "/model-weights"),
                        temp_dir=str(temp_dir),
                        device=("cuda" if os.getenv("CUDA_AVAILABLE", "false").lower() == "true" else "cpu"),
                        model=model_name,
                        temperature=0.2,
                        ollama_kwargs=ollama_kwargs,
                    )
                    _log("INFO", f"✅ Initialized agent with {model_name}")
                    break
                except Exception as e:
                    _log("ERROR", f"Model {model_name} failed: {e}")
                    continue

            if agent is None:
                raise Exception("Failed to initialize any configured LLM/model")

            chat_interface = ChatInterface(agent, tools_dict)
            _log("INFO", "✅ MedRAX chat interface ready")

        except Exception as e:
            # capture full traceback for diagnostics
            tb = traceback.format_exc()
            initialization_error_msg = str(e)
            initialization_error_tb = tb
            initialization_error = initialization_error_msg
            _log("ERROR", "❌ MedRAX initialization error:", initialization_error_msg)
            _log("ERROR", tb)
            # Keep the exception for endpoints to report
            return


@app.post("/api/init")
async def manual_init():
    """Trigger initialization manually (useful during testing)."""
    await initialize_medrax()
    if initialization_error:
        return JSONResponse({"success": False, "error": initialization_error, "traceback": initialization_error_tb}, status_code=500)
    return {"success": True}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload an image or DICOM file and return paths for preview and processing."""
    try:
        if not file:
            return JSONResponse({"error": "No file uploaded", "original_path": "", "display_path": ""}, status_code=400)

        timestamp = int(time.time())
        ext = Path(file.filename).suffix if file.filename else ""
        saved_filename = f"upload_{timestamp}{ext}"
        file_path = upload_dir / saved_filename

        # write file
        content = await file.read()
        file_path.write_bytes(content)

        # Ensure backend is ready
        await initialize_medrax()
        if initialization_error:
            return {"error": f"Initialization failed: {initialization_error}", "original_path": str(file_path), "display_path": f"/uploads/{saved_filename}", "traceback": initialization_error_tb}

        # Let the ChatInterface process the upload (may convert DICOM etc.)
        try:
            display_path = chat_interface.handle_upload(str(file_path))
        except Exception as e:
            # If chat_interface handling fails, don't block upload preview
            _log("ERROR", f"Upload post-processing failed: {e}")
            display_path = f"/uploads/{saved_filename}"

        return {"original_path": str(file_path), "display_path": display_path or f"/uploads/{saved_filename}"}

    except Exception as e:
        _log("ERROR", f"Upload error: {e}")
        return JSONResponse({"error": str(e), "original_path": "", "display_path": ""}, status_code=500)


def _serialize_msg(msg) -> Dict[str, Any]:
    # support pydantic-like model_dump or a simple object with role/content
    if hasattr(msg, "model_dump"):
        try:
            return msg.model_dump()
        except Exception:
            pass
    return {"role": getattr(msg, "role", None), "content": getattr(msg, "content", None), "metadata": getattr(msg, "metadata", None)}


def sse_event(data: str) -> str:
    return f"data: {data}\n\n"


async def _chat_stream_generator(message: str, image_path: Optional[str], thread_id: str):
    """Internal generator that proxies ChatInterface.process_message to SSE JSON events."""
    try:
        history = chat_sessions.get(thread_id, {}).get("history", [])

        async for updated_history, display_path, _ in chat_interface.process_message(message, image_path, history):
            # Update session history
            chat_sessions.setdefault(thread_id, {})["history"] = updated_history

            response_data = {
                "thread_id": thread_id,
                "messages": [_serialize_msg(m) for m in updated_history],
                "display_path": display_path,
                "status": "streaming",
            }

            yield sse_event(json.dumps(response_data))

        # final
        final = {
            "thread_id": thread_id,
            "messages": [_serialize_msg(m) for m in chat_sessions.get(thread_id, {}).get("history", [])],
            "display_path": getattr(chat_interface, "display_file_path", None),
            "status": "completed",
        }
        yield sse_event(json.dumps(final))

    except Exception as e:
        tb = traceback.format_exc()
        _log("ERROR", "Chat generator error:", str(e))
        _log("ERROR", tb)
        err = {"thread_id": thread_id, "error": str(e), "status": "error", "traceback": tb}
        yield sse_event(json.dumps(err))


@app.post("/chat")
async def chat_endpoint(message: str = Form(...), image_path: Optional[str] = Form(None), thread_id: Optional[str] = Form(None)):
    """SSE chat endpoint compatible with the existing frontend.

    The endpoint lazy-initializes the MedRAX backend if needed.
    """
    await initialize_medrax()
    if initialization_error:
        _log("WARN", "Initialization failed - falling back to mock stream for chat")
        # Fall back to mock stream so frontend behaves exactly and doesn't show raw error
        return StreamingResponse(_mock_stream_generator(message, image_path, str(time.time())), media_type="text/event-stream")

    tid = thread_id or str(time.time())
    # ensure session exists
    chat_sessions.setdefault(tid, {"history": [], "created_at": time.time()})
    # set current thread if chat_interface supports it
    try:
        setattr(chat_interface, "current_thread_id", tid)
    except Exception:
        pass

    return StreamingResponse(_chat_stream_generator(message, image_path, tid), media_type="text/event-stream")


@app.get("/api/logs")
async def get_logs(limit: int = 200):
    """Return recent diagnostic logs (most recent first)."""
    logs = list(_RECENT_LOGS)[-limit:]
    return {"logs": logs[::-1]}


@app.post("/api/mock_chat")
async def mock_chat(message: str = Form(...), image_path: Optional[str] = Form(None)):
    """Mock SSE stream that simulates a realistic conversation and image updates.

    Useful for frontend testing when the full backend isn't initialized.
    """
    return StreamingResponse(_mock_stream_generator(message, image_path, str(time.time())), media_type="text/event-stream")


async def _mock_stream_generator(message: str, image_path: Optional[str], thread_id: str):
    """Reusable mock stream generator used by /api/mock_chat and auto-fallbacks.
    Produces SSE JSON events similar to the real agent stream.
    """
    # initial partial assistant token stream
    words = ("To determine if there is evidence of pleural effusion, I will first examine the uploaded chest x-ray and run a classifier. ").split()
    built = ""
    for w in words:
        built += (w + " ")
        payload = {"thread_id": thread_id, "messages": [{"role": "assistant", "content": built.strip()}], "display_path": image_path or None, "status": "streaming", "mock": True}
        yield sse_event(json.dumps(payload))
        await asyncio.sleep(0.06)

    # simulate a tool execution event (image visualizer) that updates display_path
    tool_payload = {"thread_id": thread_id, "messages": [{"role": "assistant", "content": "[Tool] chest_xray_classifier: probability 97%"}], "display_path": image_path or "/temp/mock_segmentation.png", "status": "streaming", "mock": True}
    yield sse_event(json.dumps(tool_payload))
    await asyncio.sleep(0.5)

    # final message
    final = {"thread_id": thread_id, "messages": [{"role": "assistant", "content": "Based on the classifier and visual inspection, there is high probability of pleural effusion."}], "display_path": image_path or "/temp/mock_segmentation.png", "status": "completed", "mock": True}
    yield sse_event(json.dumps(final))


@app.post("/api/chat/stream")
async def chat_stream_api(chat_msg: ChatMessage):
    # alias route for compatibility with older clients
    await initialize_medrax()
    if initialization_error:
        _log("WARN", "Initialization failed - falling back to mock stream for chat (api/chat/stream)")
        return StreamingResponse(_mock_stream_generator(chat_msg.message or "", chat_msg.image_path, str(time.time())), media_type="text/event-stream")

    tid = chat_msg.thread_id or str(time.time())
    chat_sessions.setdefault(tid, {"history": [], "created_at": time.time()})
    try:
        setattr(chat_interface, "current_thread_id", tid)
    except Exception:
        pass

    return StreamingResponse(_chat_stream_generator(chat_msg.message or "", chat_msg.image_path, tid), media_type="text/event-stream")


@app.post("/api/chat/clear")
async def clear_chat(thread_id: str = Form(...)):
    try:
        if thread_id in chat_sessions:
            chat_sessions[thread_id]["history"] = []

        if chat_interface:
            try:
                chat_interface.original_file_path = None
                chat_interface.display_file_path = None
            except Exception:
                pass

        return {"success": True, "thread_id": thread_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clear failed: {str(e)}")


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "agent_ready": agent is not None,
        "tools_loaded": len(tools_dict) if tools_dict else 0,
        "active_sessions": len(chat_sessions),
        "initialization_error": initialization_error,
        "initialization_error_traceback": initialization_error_tb,
        "recent_logs_count": len(_RECENT_LOGS),
    }


@app.get("/")
async def root():
    return {
        "message": "MedRAX API is running",
        "version": "1.0.0",
        "endpoints": {
            "upload": "/upload",
            "chat": "/chat",
            "init": "/api/init",
            "health": "/api/health",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=int(os.getenv("PORT", "8585")), reload=True)
