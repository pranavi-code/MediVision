from __future__ import annotations

import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from bson import ObjectId

from medrax.utils.database import get_db
from medrax.utils.jwt import verify_jwt
# Avoid circular import with api; import lazily inside functions when needed


doctor_router = APIRouter(prefix="/api/doctor", tags=["doctor"])


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def _auth_doctor(authorization: Optional[str]):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return payload


def _oid(id_or_str: str) -> ObjectId:
    try:
        return ObjectId(id_or_str)
    except Exception:
        # not a valid ObjectId
        return ObjectId()


async def _resolve_doctor_id(user_payload: dict) -> Optional[str]:
    """Given a JWT payload, resolve the corresponding doctors._id as string.

    Admins return None (meaning bypass doctor scoping).
    Doctors are matched by email, which keeps Admin -> Doctor assignment consistent
    since Admin UI stores doctors collection _id in cases.assignedDoctorId.
    """
    role = user_payload.get("role")
    if role == "admin":
        return None
    email = user_payload.get("email")
    if not email:
        raise HTTPException(status_code=403, detail="Doctor email missing in token")
    db = get_db()
    doc = await db["doctors"].find_one({"email": email})
    if not doc:
        raise HTTPException(status_code=403, detail="Doctor profile not found")
    return str(doc.get("_id"))


class ReportCreate(BaseModel):
    content: str
    status: str = "draft"  # draft | final
    aiAgreement: str | None = None  # agree | partial | disagree
    diagnosis: str | None = None
    recommendations: list[str] | None = None


@doctor_router.get("/cases")
async def list_my_cases(Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    # Admins can see all; doctors are scoped by doctors._id stored in cases.assignedDoctorId
    doc_id = await _resolve_doctor_id(user)
    q = {} if doc_id is None else {"assignedDoctorId": doc_id}
    cur = db["cases"].find(q).sort("createdAt", -1)
    items: List[Dict[str, Any]] = []
    async for c in cur:
        c["_id"] = str(c.get("_id"))
        items.append(c)
    return {"items": items}


@doctor_router.get("/cases/{caseId}")
async def get_my_case(caseId: str, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    c["_id"] = str(c.get("_id"))
    return c


@doctor_router.get("/cases/{caseId}/images")
async def get_case_images(caseId: str, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"images": 1, "assignedDoctorId": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"items": c.get("images", [])}


@doctor_router.post("/cases/{caseId}/reports")
async def create_report(caseId: str, payload: ReportCreate, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    rep = {
        "_id": str(ObjectId()),
        "authorId": str(user.get("sub")),
        "authorName": user.get("name"),
        "status": payload.status,
        "content": payload.content,
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    await db["cases"].update_one({"_id": c.get("_id")}, {"$push": {"reports": rep}})
    return {"ok": True, "report": rep}


@doctor_router.get("/cases/{caseId}/reports")
async def list_reports(caseId: str, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"reports": 1, "assignedDoctorId": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"items": c.get("reports", [])}


class ReportUpdate(BaseModel):
    content: Optional[str] = None
    status: Optional[str] = None  # draft | final
    aiAgreement: Optional[str] = None
    diagnosis: Optional[str] = None
    recommendations: Optional[list[str]] = None


@doctor_router.patch("/cases/{caseId}/reports/{reportId}")
async def update_report(caseId: str, reportId: str, payload: ReportUpdate, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    reports = c.get("reports", [])
    idx = next((i for i,r in enumerate(reports) if str(r.get("_id"))==reportId), -1)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Report not found")
    for k in ["content","status","aiAgreement","diagnosis","recommendations"]:
        v = getattr(payload, k)
        if v is not None:
            reports[idx][k] = v
    reports[idx]["updatedAt"] = datetime.utcnow().isoformat()
    await db["cases"].update_one({"_id": c.get("_id")}, {"$set": {"reports": reports}})
    return {"ok": True, "report": reports[idx]}


class CaseUpdate(BaseModel):
    history: Optional[str] = None
    symptoms: Optional[str] = None


@doctor_router.patch("/cases/{caseId}")
async def update_case_fields(caseId: str, payload: CaseUpdate, Authorization: Optional[str] = Header(None)):
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = {"updatedAt": datetime.utcnow().isoformat()}
    if payload.history is not None:
        updates["history"] = payload.history
    if payload.symptoms is not None:
        updates["symptoms"] = payload.symptoms
    await db["cases"].update_one({"_id": c.get("_id")}, {"$set": updates})
    return {"ok": True}


@doctor_router.get("/notifications")
async def doctor_notifications(since: Optional[str] = None, Authorization: Optional[str] = Header(None)):
    """Return lightweight counts for new images and analyses since ISO timestamp."""
    user = _auth_doctor(Authorization)
    db = get_db()
    doc_id = await _resolve_doctor_id(user)
    q = {} if doc_id is None else {"assignedDoctorId": doc_id}
    cur = db["cases"].find(q)
    new_images = 0
    new_analyses = 0
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except Exception:
            since_dt = None
    async for c in cur:
        for img in c.get("images", []) or []:
            ts = img.get("uploadedAt")
            if since_dt and ts:
                try:
                    if datetime.fromisoformat(ts) > since_dt:
                        new_images += 1
                except Exception:
                    pass
        ai = c.get("ai_analysis") or {}
        ts2 = ai.get("analyzedAt")
        if since_dt and ts2:
            try:
                if datetime.fromisoformat(ts2) > since_dt:
                    new_analyses += 1
            except Exception:
                pass
    return {"new_images": new_images, "new_analyses": new_analyses, "since": since or ""}


@doctor_router.post("/cases/{caseId}/analyze")
async def analyze_case(caseId: str, Authorization: Optional[str] = Header(None)):
    """Run MedRAX analysis on the latest image of the case and store results.

    Not hard-coded: uses the live chat interface tools. Stores output text and display image path.
    """
    user = _auth_doctor(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    doc_id = await _resolve_doctor_id(user)
    if (doc_id is not None) and (c.get("assignedDoctorId") != doc_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    images = c.get("images", [])
    if not images:
        raise HTTPException(status_code=400, detail="No images attached")
    latest = sorted(images, key=lambda x: x.get("uploadedAt", ""))[-1]
    img_path = latest.get("original_path")

    # Lazy import to avoid circulars
    from api import initialize_medrax, chat_interface, initialization_error
    await initialize_medrax()
    if initialization_error:
        raise HTTPException(status_code=500, detail=f"Initialization failed: {initialization_error}")

    # Build a concise context-only prompt
    patient = c.get("patient", {})
    # Inject doctor persona instructions (no markdown headers; adapt to question)
    try:
        from api import _persona_text
        persona = _persona_text("doctor")
    except Exception:
        persona = ""
    context = (
        (persona + "\n\n") +
        f"Patient: {patient.get('name','Unknown')} | Age/DOB: {patient.get('dob','')} | Phone: {patient.get('phone','')}\n"
        f"Case ID: {c.get('caseId')} | Created: {c.get('createdAt','')}\n"
        "Analyze the attached image. If the image_path is a DICOM, first call dicom_processor to obtain a viewable image. "
        "Then call chest_xray_classifier on the viewable image. Optionally call chest_xray_segmentation to localize findings.\n"
        "Base your summary on the tool outputs. Report the top relevant pathologies with probabilities. "
        "Only conclude 'no acute cardiopulmonary process' if Effusion, Pneumonia, Pneumothorax, Consolidation and Edema are all < 0.15.\n"
        "Include a small 'Findings:' block listing up to the top 3 pathologies with probability ≥ 0.15 in the format 'Label p=0.xx'. If none exceed threshold, write 'Findings: No pathologies exceeded threshold (0.15)'. "
        "Then include 'Impression:' as a one-line clinical summary. Return a clinically useful, structured summary (no markdown headers). End with a single line 'Confidence: NN%' where NN is 0-100."
    )

    # Use chat_interface to process a single message with the latest image
    try:
        # We call internal generator once to completion to get final message and display_path
        history = []
        final_text = ""
        display = None
        async for updated_history, display_path, _ in chat_interface.process_message(context, img_path, history):
            history = updated_history
            display = display_path or display
        # pick last assistant message
        if history:
            last_assist = None
            for m in reversed(history):
                if getattr(m, "role", getattr(m, "role", None)) == "assistant":
                    last_assist = m
                    break
            final_text = getattr(last_assist, "content", "") if last_assist else ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

    # Try to parse a confidence score from the final_text (e.g., 'Confidence: 85%')
    confidence: float | None = None
    try:
        import re
        m = re.search(r"Confidence\s*:\s*(\d{1,3})\s*%", final_text, re.IGNORECASE)
        if m:
            v = float(m.group(1))
            if 0 <= v <= 100:
                confidence = v
        else:
            # fallback: look for 'score NN/100'
            m2 = re.search(r"(\d{1,3})\s*/\s*100", final_text)
            if m2:
                v2 = float(m2.group(1))
                if 0 <= v2 <= 100:
                    confidence = v2
    except Exception:
        confidence = None

    result = {
        "summary": final_text,
        "display_path": display,
        "image_path": img_path,
        "confidence": confidence,
        "analyzedAt": datetime.utcnow().isoformat(),
        "by": str(user.get("sub")),
    }
    await db["cases"].update_one({"_id": c.get("_id")}, {"$set": {"ai_analysis": result, "updatedAt": datetime.utcnow().isoformat()}})
    return {"ok": True, "analysis": result}
