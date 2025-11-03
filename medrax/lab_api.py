from __future__ import annotations

import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from pydantic import BaseModel
from bson import ObjectId

from medrax.utils.database import get_db
from medrax.utils.jwt import verify_jwt


lab_router = APIRouter(prefix="/api/lab", tags=["lab"])


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def _auth_lab(authorization: Optional[str]):
    """Authenticate lab technician or admin."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") not in ("lab_tech", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return payload


async def _resolve_labtech_id(user_payload: dict) -> Optional[str]:
    """Given a JWT payload, resolve the corresponding labtechs._id as string.
    
    Admins return None (meaning bypass lab scoping).
    Lab techs are matched by email to keep consistency with admin assignment.
    """
    role = user_payload.get("role")
    if role == "admin":
        return None
    email = user_payload.get("email")
    if not email:
        raise HTTPException(status_code=403, detail="Lab tech email missing in token")
    db = get_db()
    doc = await db["labtechs"].find_one({"email": email})
    if not doc:
        raise HTTPException(status_code=403, detail="Lab tech profile not found")
    return str(doc.get("_id"))


@lab_router.get("/cases")
async def list_my_cases(Authorization: Optional[str] = Header(None)):
    """List cases assigned to this lab tech or all cases if admin."""
    user = _auth_lab(Authorization)
    db = get_db()
    
    # Admins can see all; lab techs are scoped by labtechs._id stored in cases.assignedLabTechId
    lab_id = await _resolve_labtech_id(user)
    q = {} if lab_id is None else {"assignedLabTechId": lab_id}
    
    cur = db["cases"].find(q).sort("createdAt", -1)
    items: List[Dict[str, Any]] = []
    async for c in cur:
        c["_id"] = str(c.get("_id"))
        items.append(c)
    return {"items": items}


@lab_router.get("/cases/{caseId}")
async def get_my_case(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get a specific case assigned to this lab tech."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    c["_id"] = str(c.get("_id"))
    return c


@lab_router.get("/cases/{caseId}/images")
async def get_case_images(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get images for a case assigned to this lab tech."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"images": 1, "assignedLabTechId": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    return {"items": c.get("images", [])}


@lab_router.post("/cases/{caseId}/upload")
async def upload_case_image(
    caseId: str,
    file: UploadFile = File(...),
    modality: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    Authorization: Optional[str] = Header(None)
):
    """Upload an image to a case assigned to this lab tech."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Use the existing cases API for consistency
    from medrax.cases_api import attach_image_to_case
    # Store images in MongoDB GridFS and keep a filesystem copy for processing/display
    return await attach_image_to_case(caseId, "gridfs", modality, file, Authorization)


class LabNote(BaseModel):
    content: str
    category: Optional[str] = None  # "technical", "quality", "protocol", etc.


@lab_router.post("/cases/{caseId}/notes")
async def add_lab_note(caseId: str, payload: LabNote, Authorization: Optional[str] = Header(None)):
    """Add a lab note to a case."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    note = {
        "_id": str(ObjectId()),
        "authorId": str(user.get("sub")),
        "authorName": user.get("name", user.get("email")),
        "content": payload.content,
        "category": payload.category,
        "createdAt": datetime.utcnow().isoformat(),
        "type": "lab_note"
    }
    
    await db["cases"].update_one(
        {"_id": c.get("_id")}, 
        {
            "$push": {"lab_notes": note},
            "$set": {"updatedAt": datetime.utcnow().isoformat()}
        }
    )
    return {"ok": True, "note": note}


@lab_router.get("/cases/{caseId}/notes")
async def list_lab_notes(caseId: str, Authorization: Optional[str] = Header(None)):
    """List lab notes for a case."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"lab_notes": 1, "assignedLabTechId": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    return {"items": c.get("lab_notes", [])}


class CaseStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


@lab_router.patch("/cases/{caseId}/status")
async def update_case_status(caseId: str, payload: CaseStatusUpdate, Authorization: Optional[str] = Header(None)):
    """Update case status (e.g., from 'awaiting_scan' to 'scan_uploaded')."""
    user = _auth_lab(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    lab_id = await _resolve_labtech_id(user)
    if (lab_id is not None) and (c.get("assignedLabTechId") != lab_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    updates = {
        "status": payload.status,
        "updatedAt": datetime.utcnow().isoformat()
    }
    
    if payload.notes:
        # Add a status change note
        note = {
            "_id": str(ObjectId()),
            "authorId": str(user.get("sub")),
            "authorName": user.get("name", user.get("email")),
            "content": f"Status changed to '{payload.status}': {payload.notes}",
            "category": "status_change",
            "createdAt": datetime.utcnow().isoformat(),
            "type": "lab_note"
        }
        await db["cases"].update_one(
            {"_id": c.get("_id")}, 
            {"$push": {"lab_notes": note}}
        )
    
    await db["cases"].update_one(
        {"_id": c.get("_id")}, 
        {"$set": updates}
    )
    
    return {"ok": True, "status": payload.status}


@lab_router.get("/dashboard")
async def lab_dashboard(Authorization: Optional[str] = Header(None)):
    """Get lab dashboard statistics."""
    user = _auth_lab(Authorization)
    db = get_db()
    
    lab_id = await _resolve_labtech_id(user)
    base_query = {} if lab_id is None else {"assignedLabTechId": lab_id}
    
    # Count cases by status
    statuses = ["awaiting_scan", "scan_uploaded", "analysis_complete", "archived"]
    counts = {}
    for status in statuses:
        query = {**base_query, "status": status}
        counts[status] = await db["cases"].count_documents(query)
    
    # Total cases
    total = await db["cases"].count_documents(base_query)
    
    # Recent activity - cases updated in last 24 hours
    from datetime import datetime, timedelta
    yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
    recent_query = {**base_query, "updatedAt": {"$gte": yesterday}}
    recent = await db["cases"].count_documents(recent_query)
    
    return {
        "total": total,
        "counts": counts,
        "recent_activity": recent,
        "pending_uploads": counts.get("awaiting_scan", 0),
        "completed_scans": counts.get("scan_uploaded", 0)
    }


@lab_router.get("/notifications")
async def lab_notifications(since: Optional[str] = None, Authorization: Optional[str] = Header(None)):
    """Get notifications for lab tech."""
    user = _auth_lab(Authorization)
    db = get_db()
    
    lab_id = await _resolve_labtech_id(user)
    q = {} if lab_id is None else {"assignedLabTechId": lab_id}
    
    # Count new case assignments since timestamp
    new_assignments = 0
    urgent_cases = 0
    
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except Exception:
            since_dt = None
    
    async for c in db["cases"].find(q):
        # New assignments
        if since_dt and c.get("createdAt"):
            try:
                if datetime.fromisoformat(c.get("createdAt")) > since_dt:
                    new_assignments += 1
            except Exception:
                pass
        
        # Urgent cases (awaiting scan for > 24 hours)
        if c.get("status") == "awaiting_scan" and c.get("createdAt"):
            try:
                created = datetime.fromisoformat(c.get("createdAt"))
                if (datetime.utcnow() - created).days >= 1:
                    urgent_cases += 1
            except Exception:
                pass
    
    return {
        "new_assignments": new_assignments,
        "urgent_cases": urgent_cases,
        "since": since or ""
    }