import os
import json
import asyncio
import traceback
from collections import deque
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from gradio import ChatMessage  # for consistent history objects
from medrax.utils.jwt import verify_jwt
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


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def _require_auth(authorization: Optional[str]):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

# ------------------------------
# Role Personas (server-enforced)
# ------------------------------
# Keep concise and avoid rigid markdown structures; adapt to question.
PERSONAS: Dict[str, str] = {
    "doctor": (
        "You are assisting a licensed clinician. Use precise clinical framing and appropriate medical terminology. "
        "Respond directly to the clinician’s question. Start with a one‑line takeaway, then provide key findings as short clinical bullets (no markdown headers). "
        "Use any imaging-analysis tools internally when an image is present, but do not mention tool names, calls, or raw outputs in your reply. Synthesize results in plain language. "
        "Only conclude 'no acute cardiopulmonary process' if the classifier probabilities for major pathologies (Effusion, Pneumonia, Pneumothorax, Consolidation, Edema) are all below ~0.15; otherwise discuss likely findings with probabilities. "
        "Include a small 'Findings:' block listing up to the top 3 pathologies with probability ≥ 0.15 in the format 'Label p=0.xx'. If none exceed threshold, write 'Findings: No pathologies exceeded threshold (0.15)'. Then include 'Impression:' as a one-line clinical summary tailored to the question. "
        "After the Impression, add a brief explanation (2–5 concise bullets) using medical terms to justify the interpretation: distribution/laterality and lobar involvement, pattern (e.g., alveolar consolidation with air bronchograms vs interstitial), pleural findings (e.g., costophrenic angle blunting, meniscus sign), cardiac/mediastinal contours, support devices, and relevant technical factors. Where reasonable, list 1–3 differentials and suggest targeted next steps (e.g., repeat CXR, bedside ultrasound, CT, labs, empiric therapy) without mentioning tools. "
        "Avoid walkthroughs, code blocks, or step‑by‑step tool descriptions. If uncertain, state uncertainty briefly and propose next steps."
    ),
    "patient": (
        "You are explaining to a patient or caregiver. Use plain language, avoid jargon, and keep a gentle, reassuring tone. "
        "Be comprehensive: explain what the image and findings mean, potential causes, and what to watch for. "
        "When an image is present, rely on tool outputs (dicom_processor if needed, chest_xray_classifier, and optionally segmentation) and translate them into plain language. "
        "Provide practical next steps and safety guidance without diagnosing; include a clear disclaimer to consult a healthcare professional for diagnosis. "
        "Use short paragraphs or simple bullets (no markdown headers)."
    ),
    "general": (
        "Teaching mode for a student/learner. Provide detailed, step-by-step reasoning with correct terminology. "
        "When an image is present, demonstrate tool-first analysis (dicom_processor if needed, chest_xray_classifier, optional segmentation), explain the outputs, thresholds, and uncertainty. "
        "Include a small 'Findings:' block listing up to the top 3 pathologies with probability ≥ 0.15 in the format 'Label p=0.xx'. If none exceed threshold, write 'Findings: No pathologies exceeded threshold (0.15)'. Then include 'Impression:' as a one-line summary. "
        "Define important terms briefly and provide structured explanations without using markdown headers. Adapt structure to the question and avoid hallucinations by relying on the provided image/context and tool outputs."
    ),
}

def _persona_text(role: Optional[str]) -> str:
    key = (role or "").lower()
    if key in PERSONAS:
        return f"[Persona::{key}] " + PERSONAS[key]
    return "[Persona::general] " + PERSONAS["general"]

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

# Admin/DB imports (lazy-safe). Import routers individually; log failures and continue.
connect_to_mongo = None
close_mongo_connection = None
ensure_indexes = None
try:
    from medrax.utils import database as _mdb
    connect_to_mongo = _mdb.connect_to_mongo
    close_mongo_connection = _mdb.close_mongo_connection
    ensure_indexes = _mdb.ensure_indexes
    _log("INFO", "DB utilities imported")
except Exception as _e:
    _log("WARN", f"DB utilities import failed: {_e}")

try:
    from medrax.auth_api import auth_router
    app.include_router(auth_router)
    _log("INFO", "Auth router mounted at /api/auth")
except Exception as _e:
    _log("ERROR", f"Failed to mount auth router: {_e}")

try:
    from medrax.cases_api import cases_router
    app.include_router(cases_router)
    _log("INFO", "Cases router mounted at /api")
except Exception as _e:
    _log("ERROR", f"Failed to mount cases router: {_e}")

try:
    from medrax.doctor_api import doctor_router
    app.include_router(doctor_router)
    _log("INFO", "Doctor router mounted at /api/doctor")
except Exception as _e:
    _log("ERROR", f"Failed to mount doctor router: {_e}")

try:
    from medrax.admin_api import admin_router
    app.include_router(admin_router)
    _log("INFO", "Admin router mounted at /api")
except Exception as _e:
    _log("ERROR", f"Failed to mount admin router: {_e}")

try:
    from medrax.lab_api import lab_router
    app.include_router(lab_router)
    _log("INFO", "Lab router mounted at /api/lab")
except Exception as _e:
    _log("ERROR", f"Failed to mount lab router: {_e}")

try:
    from medrax.patient_api import patient_router
    app.include_router(patient_router)
    _log("INFO", "Patient router mounted at /api/patient")
except Exception as _e:
    _log("ERROR", f"Failed to mount patient router: {_e}")


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

    # Attempt DB connection first (non-fatal if not configured)
    try:
        # connect and ensure indexes if DB variables are set
        await connect_to_mongo()  # may raise if MONGODB_URI missing
        try:
            await ensure_indexes()
            _log("INFO", "MongoDB connected and indexes ensured")
        except Exception as e_idx:
            _log("WARN", f"Index creation failed or skipped: {e_idx}")
    except Exception as e_db:
        _log("WARN", f"MongoDB connection skipped or failed: {e_db}")

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


@app.on_event("shutdown")
async def on_shutdown():
    try:
        await close_mongo_connection()
        _log("INFO", "MongoDB connection closed")
    except Exception:
        # Ignore shutdown errors
        pass


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
                        temperature=0.1,
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
async def upload_file(file: UploadFile = File(...), case_id: Optional[str] = Form(None), modality: Optional[str] = Form(None), Authorization: Optional[str] = Header(None)):
    """Upload an image or DICOM file and return paths for preview and processing."""
    try:
        _require_auth(Authorization)
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

        original_path = str(file_path)
        display_path = display_path or f"/uploads/{saved_filename}"

        # Detect DICOM modality if not provided
        if not modality and (file.filename or "").lower().endswith(".dcm"):
            try:
                import pydicom  # type: ignore
                ds = pydicom.dcmread(str(file_path), stop_before_pixels=True)
                mod = getattr(ds, "Modality", None)
                modality = mod if isinstance(mod, str) else None
            except Exception:
                modality = None

        # If a case_id was provided, attach this image to that case
        if case_id:
            try:
                from medrax.utils.jwt import verify_jwt
                from medrax.utils.database import get_db
                def _jwt_secret() -> str:
                    return os.getenv("JWT_SECRET", "dev-secret-change-me")
                # require auth and push to case
                if not Authorization or not Authorization.lower().startswith("bearer "):
                    raise Exception("Missing token")
                token = Authorization.split(" ", 1)[1]
                payload = verify_jwt(token, _jwt_secret())
                if not payload:
                    raise Exception("Invalid token")
                db = get_db()
                case = await db["cases"].find_one({"caseId": case_id})
                if case:
                    entry = {
                        "_id": f"auto_{saved_filename}",
                        "original_path": original_path,
                        "display_path": display_path,
                        "modality": modality,
                        "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                        "uploadedBy": str(payload.get("sub")),
                    }
                    await db["cases"].update_one({"_id": case.get("_id")}, {"$push": {"images": entry}, "$set": {"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())}})
            except Exception as e:
                _log("WARN", f"Auto-attach to case {case_id} failed: {e}")

        return {"original_path": original_path, "display_path": display_path}

    except Exception as e:
        _log("ERROR", f"Upload error: {e}")
        return JSONResponse({"error": str(e), "original_path": "", "display_path": ""}, status_code=500)


def _serialize_msg(msg) -> Dict[str, Any]:
    """Serialize ChatMessage-like objects or simple dicts for persistence/streaming."""
    # gradio.ChatMessage or pydantic-like
    if hasattr(msg, "model_dump"):
        try:
            return msg.model_dump()
        except Exception:
            pass
    # Support dict-based messages
    if isinstance(msg, dict):
        return {
            "role": msg.get("role"),
            "content": msg.get("content"),
            "metadata": msg.get("metadata"),
        }
    # Fallback getattr
    return {
        "role": getattr(msg, "role", None),
        "content": getattr(msg, "content", None),
        "metadata": getattr(msg, "metadata", None),
    }


def sse_event(data: str) -> str:
    return f"data: {data}\n\n"


async def _chat_stream_generator(message: str, image_path: Optional[str], thread_id: str, user_payload: Optional[Dict[str, Any]] = None, case_id: Optional[str] = None):
    """Internal generator that proxies ChatInterface.process_message to SSE JSON events."""
    try:
        def _strip_persona_prefix(txt: Optional[str]) -> str:
            if not txt:
                return ""
            # If message was prefixed with persona (e.g., "[Persona::role]...\n\n<user text>"), drop the persona
            if txt.startswith("[Persona::"):
                parts = txt.split("\n\n", 1)
                if len(parts) == 2:
                    return parts[1]
            return txt

        history = chat_sessions.get(thread_id, {}).get("history", [])

        # Ensure user's turn is represented in server history before assistant streams
        pre_msgs = []
        if image_path:
            # Use simple dicts for history to ensure role/content persist correctly.
            img_entry = {"path": image_path}
            try:
                disp = getattr(chat_interface, "display_file_path", None)
                if disp:
                    img_entry["display_path"] = disp
            except Exception:
                pass
            pre_msgs.append({"role": "user", "content": img_entry})
        if message:
            pre_msgs.append({"role": "user", "content": _strip_persona_prefix(message)})
        if pre_msgs:
            history = history + pre_msgs
            chat_sessions.setdefault(thread_id, {})["history"] = history
            # Persist immediately (best-effort) so restored threads include user's messages
            try:
                if user_payload:
                    from medrax.utils.database import get_db
                    db = get_db()
                    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
                    doc = {
                        "userId": str(user_payload.get("sub")),
                        "role": user_payload.get("role"),
                        "threadId": thread_id,
                        "caseId": case_id,
                        "messages": [_serialize_msg(m) for m in history],
                        "display_path": getattr(chat_interface, "display_file_path", None),
                        "updatedAt": now_iso,
                        "lastMessageAt": now_iso,
                    }
                    await db["chat_threads"].update_one(
                        {"userId": doc["userId"], "threadId": thread_id},
                        {"$set": doc, "$setOnInsert": {"createdAt": now_iso}},
                        upsert=True,
                    )
            except Exception:
                pass

        # Special-case: greetings without image — reply succinctly and do NOT call tools
        user_text = _strip_persona_prefix(message)
        if (not image_path) and user_text and len(user_text.strip()) <= 40:
            import re
            if re.search(r"\b(hi|hello|hey|good\s*(morning|evening|afternoon))\b", user_text.strip(), re.I):
                assist = {"role": "assistant", "content": "Hello! How can I help you today? If you have a chest X-ray, you can upload it and I’ll analyze it."}
                history = history + [assist]
                chat_sessions.setdefault(thread_id, {})["history"] = history
                response_data = {
                    "thread_id": thread_id,
                    "messages": history,
                    "display_path": getattr(chat_interface, "display_file_path", None),
                    "status": "completed",
                }
                # Persist
                try:
                    if user_payload:
                        from medrax.utils.database import get_db
                        db = get_db()
                        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
                        doc = {
                            "userId": str(user_payload.get("sub")),
                            "role": user_payload.get("role"),
                            "threadId": thread_id,
                            "caseId": case_id,
                            "messages": response_data["messages"],
                            "display_path": response_data["display_path"],
                            "updatedAt": now_iso,
                            "lastMessageAt": now_iso,
                        }
                        await db["chat_threads"].update_one(
                            {"userId": doc["userId"], "threadId": thread_id},
                            {"$set": doc, "$setOnInsert": {"createdAt": now_iso}},
                            upsert=True,
                        )
                except Exception:
                    pass
                yield sse_event(json.dumps(response_data))
                return

        async for updated_history, display_path, _ in chat_interface.process_message(message, image_path, history):
            # Update session history
            chat_sessions.setdefault(thread_id, {})["history"] = updated_history

            response_data = {
                "thread_id": thread_id,
                "messages": [_serialize_msg(m) for m in updated_history],
                "display_path": display_path,
                "status": "streaming",
            }

            # Persist chat history incrementally (best-effort; non-blocking on failure)
            try:
                if user_payload:
                    from medrax.utils.database import get_db
                    db = get_db()
                    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
                    doc = {
                        "userId": str(user_payload.get("sub")),
                        "role": user_payload.get("role"),
                        "threadId": thread_id,
                        "caseId": case_id,
                        "messages": response_data["messages"],
                        "display_path": display_path,
                        "updatedAt": now_iso,
                        "lastMessageAt": now_iso,
                    }
                    # Upsert by (userId, threadId)
                    await db["chat_threads"].update_one(
                        {"userId": doc["userId"], "threadId": thread_id},
                        {"$set": doc, "$setOnInsert": {"createdAt": now_iso}},
                        upsert=True,
                    )
            except Exception as _e:
                # Do not disrupt streaming if DB is unavailable
                pass

            yield sse_event(json.dumps(response_data))

        # final
        final = {
            "thread_id": thread_id,
            "messages": [_serialize_msg(m) for m in chat_sessions.get(thread_id, {}).get("history", [])],
            "display_path": getattr(chat_interface, "display_file_path", None),
            "status": "completed",
        }
        # Final persist to ensure completion state is saved
        try:
            if user_payload:
                from medrax.utils.database import get_db
                db = get_db()
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
                await db["chat_threads"].update_one(
                    {"userId": str(user_payload.get("sub")), "threadId": thread_id},
                    {"$set": {
                        "messages": final["messages"],
                        "display_path": final["display_path"],
                        "updatedAt": now_iso,
                        "lastMessageAt": now_iso,
                        "caseId": case_id,
                    }, "$setOnInsert": {"createdAt": now_iso}},
                    upsert=True,
                )
        except Exception:
            pass
        yield sse_event(json.dumps(final))

    except Exception as e:
        tb = traceback.format_exc()
        _log("ERROR", "Chat generator error:", str(e))
        _log("ERROR", tb)
        err = {"thread_id": thread_id, "error": str(e), "status": "error", "traceback": tb}
        yield sse_event(json.dumps(err))


@app.post("/chat")
async def chat_endpoint(message: str = Form(...), image_path: Optional[str] = Form(None), thread_id: Optional[str] = Form(None), case_id: Optional[str] = Form(None), Authorization: Optional[str] = Header(None)):
    """SSE chat endpoint compatible with the existing frontend.

    The endpoint lazy-initializes the MedRAX backend if needed.
    """
    payload = _require_auth(Authorization)
    await initialize_medrax()
    if initialization_error:
        _log("WARN", "Initialization failed - falling back to mock stream for chat")
        # Fall back to mock stream so frontend behaves exactly and doesn't show raw error
        return StreamingResponse(_mock_stream_generator(message, image_path, str(time.time())), media_type="text/event-stream")

    # If case_id is provided, and no image_path provided, try to auto-use latest case image
    if case_id:
        try:
            from medrax.utils.database import get_db
            db = get_db()
            c = await db["cases"].find_one({"caseId": case_id})
            if c:
                imgs = c.get("images", [])
                if (not image_path) and imgs:
                    latest = sorted(imgs, key=lambda x: x.get("uploadedAt", ""))[-1]
                    image_path = latest.get("original_path") or image_path
                # Prepend patient context to the message (lightweight context injection)
                p = c.get("patient", {})
                prefix = f"Patient Context for case {case_id}: Name={p.get('name','')}, DOB={p.get('dob','')}, Phone={p.get('phone','')}.\n"
                message = prefix + (message or "")
        except Exception:
            pass

    # Inject persona based on JWT role without changing response shape
    try:
        persona = _persona_text(payload.get("role"))
        message = f"{persona}\n\n" + (message or "")
    except Exception:
        pass

    tid = thread_id or str(time.time())
    # ensure session exists
    chat_sessions.setdefault(tid, {"history": [], "created_at": time.time()})
    # set current thread if chat_interface supports it
    try:
        setattr(chat_interface, "current_thread_id", tid)
    except Exception:
        pass

    return StreamingResponse(_chat_stream_generator(message, image_path, tid, payload, case_id), media_type="text/event-stream")


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
async def chat_stream_api(chat_msg: ChatMessage, Authorization: Optional[str] = Header(None)):
    payload = _require_auth(Authorization)
    # alias route for compatibility with older clients
    await initialize_medrax()
    if initialization_error:
        _log("WARN", "Initialization failed - falling back to mock stream for chat (api/chat/stream)")
        return StreamingResponse(_mock_stream_generator(chat_msg.message or "", chat_msg.image_path, str(time.time())), media_type="text/event-stream")

    # Persona injection
    try:
        persona = _persona_text(payload.get("role"))
        if chat_msg and chat_msg.message:
            chat_msg.message = f"{persona}\n\n" + (chat_msg.message or "")
    except Exception:
        pass

    tid = chat_msg.thread_id or str(time.time())
    chat_sessions.setdefault(tid, {"history": [], "created_at": time.time()})
    try:
        setattr(chat_interface, "current_thread_id", tid)
    except Exception:
        pass

    return StreamingResponse(_chat_stream_generator(chat_msg.message or "", chat_msg.image_path, tid, payload, None), media_type="text/event-stream")


@app.post("/api/chat/clear")
async def clear_chat(thread_id: str = Form(...), Authorization: Optional[str] = Header(None)):
    _require_auth(Authorization)
    try:
        if thread_id in chat_sessions:
            chat_sessions[thread_id]["history"] = []

        if chat_interface:
            try:
                chat_interface.original_file_path = None
                chat_interface.display_file_path = None
            except Exception:
                pass
        # Also delete persisted thread (best-effort)
        try:
            payload = _require_auth(Authorization)
            from medrax.utils.database import get_db
            db = get_db()
            await db["chat_threads"].delete_one({"userId": str(payload.get("sub")), "threadId": thread_id})
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


# --------------------------
# Chat history API (optional)
# --------------------------
@app.get("/api/chat/threads")
async def list_chat_threads(limit: int = 50, Authorization: Optional[str] = Header(None)):
    payload = _require_auth(Authorization)
    try:
        from medrax.utils.database import get_db
        db = get_db()
        cur = db["chat_threads"].find({"userId": str(payload.get("sub"))}).sort("updatedAt", -1).limit(max(1, min(200, limit)))
        items = []
        async for d in cur:
            d["_id"] = str(d.get("_id"))
            # Avoid returning huge histories in list view
            d.pop("messages", None)
            items.append(d)
        return {"items": items}
    except Exception as e:
        # If DB is unavailable, return empty list instead of failing
        return {"items": [], "error": str(e)}


@app.get("/api/chat/threads/{thread_id}")
async def get_chat_thread(thread_id: str, Authorization: Optional[str] = Header(None)):
    payload = _require_auth(Authorization)
    try:
        from medrax.utils.database import get_db
        db = get_db()
        d = await db["chat_threads"].find_one({"userId": str(payload.get("sub")), "threadId": thread_id})
        if not d:
            raise HTTPException(status_code=404, detail="Thread not found")
        d["_id"] = str(d.get("_id"))
        return d
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chat/threads/{thread_id}")
async def delete_chat_thread(thread_id: str, Authorization: Optional[str] = Header(None)):
    payload = _require_auth(Authorization)
    try:
        from medrax.utils.database import get_db
        db = get_db()
        await db["chat_threads"].delete_one({"userId": str(payload.get("sub")), "threadId": thread_id})
        # Also clear in-memory if present
        if thread_id in chat_sessions:
            chat_sessions[thread_id]["history"] = []
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=int(os.getenv("PORT", "8585")), reload=True)
