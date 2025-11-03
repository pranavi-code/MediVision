from __future__ import annotations

import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from medrax.utils.database import get_db
from medrax.utils.jwt import verify_jwt, create_jwt


patient_router = APIRouter(prefix="/api/patient", tags=["patient"])


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def _auth_patient(authorization: Optional[str]):
    """Authenticate patient or admin."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") not in ("user", "patient", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return payload


async def _get_patient_cases(user_payload: dict) -> List[str]:
    """Get case IDs that belong to this patient based on email match.
    
    Patients can see cases where patient.email matches their JWT email.
    Admins can see all cases.
    """
    role = user_payload.get("role")
    if role == "admin":
        return []  # Admin sees all, no filtering needed
    
    allowed = user_payload.get("allowedCaseIds")
    if allowed and isinstance(allowed, list):
        return allowed

    email = user_payload.get("email")
    if not email:
        return []
    
    db = get_db()
    cases = []
    async for c in db["cases"].find({"patient.email": email}):
        cases.append(c.get("caseId"))
    
    return cases


class PatientLoginPayload(BaseModel):
    caseId: Optional[str] = None
    patientId: Optional[str] = None
    dob: str


@patient_router.post("/login")
async def patient_login(payload: PatientLoginPayload):
    """Patient login via caseId+dob or patientId+dob.

    Returns a JWT with role=patient and allowedCaseIds to authorize access.
    """
    db = get_db()
    if not payload.dob:
        raise HTTPException(status_code=400, detail="DOB is required")

    token_claims: Dict[str, Any] = {
        "role": "patient",
    }
    name = "Patient"
    email: Optional[str] = None
    allowed_ids: List[str] = []

    if payload.caseId:
        c = await db["cases"].find_one({"caseId": payload.caseId})
        if not c:
            raise HTTPException(status_code=404, detail="Case not found")
        patient = c.get("patient", {})
        if (patient.get("dob") or "").strip() != payload.dob.strip():
            raise HTTPException(status_code=401, detail="Invalid credentials")
        allowed_ids = [payload.caseId]
        name = patient.get("name") or name
        email = patient.get("email") or None
    elif payload.patientId:
        from bson import ObjectId
        try:
            pid = ObjectId(payload.patientId)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid patientId")
        p = await db["patients"].find_one({"_id": pid})
        if not p:
            raise HTTPException(status_code=404, detail="Patient not found")
        if (p.get("dob") or "").strip() != payload.dob.strip():
            raise HTTPException(status_code=401, detail="Invalid credentials")
        name = p.get("name") or name
        email = p.get("email") or None
        # Build case list for this patient
        q: Dict[str, Any] = {}
        if email:
            q = {"patient.email": email}
        else:
            # fallback by name+dob
            q = {"patient.name": name, "patient.dob": payload.dob}
        async for c in db["cases"].find(q):
            cid = c.get("caseId")
            if cid:
                allowed_ids.append(cid)
        if not allowed_ids:
            # not fatal; allows login but no cases
            allowed_ids = []
    else:
        raise HTTPException(status_code=400, detail="Provide caseId or patientId")

    if email:
        token_claims["email"] = email
    if name:
        token_claims["name"] = name
    token_claims["allowedCaseIds"] = allowed_ids

    token = create_jwt(token_claims, _jwt_secret(), exp_seconds=60 * 60 * 8)
    user_obj = {
        "id": payload.caseId or payload.patientId or "patient",
        "email": email or "",
        "role": "patient",
        "name": name,
    }
    return {"ok": True, "token": token, "user": user_obj}


@patient_router.get("/cases")
async def list_my_cases(Authorization: Optional[str] = Header(None)):
    """List cases belonging to this patient."""
    user = _auth_patient(Authorization)
    db = get_db()
    
    # Admin can see all; patients can be filtered by allowedCaseIds or email
    if user.get("role") == "admin":
        q = {}
    else:
        allowed = user.get("allowedCaseIds")
        if allowed:
            q = {"caseId": {"$in": allowed}}
        else:
            email = user.get("email")
            if not email:
                return {"items": []}
            q = {"patient.email": email}
    
    cur = db["cases"].find(q).sort("createdAt", -1)
    items: List[Dict[str, Any]] = []
    async for c in cur:
        c["_id"] = str(c.get("_id"))
        # Remove sensitive fields for patient view
        if user.get("role") != "admin":
            c.pop("assignedDoctorId", None)
            c.pop("assignedLabTechId", None)
            c.pop("lab_notes", None)
        items.append(c)
    
    return {"items": items}


@patient_router.get("/cases/{caseId}")
async def get_my_case(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get a specific case belonging to this patient."""
    user = _auth_patient(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check patient ownership
    if user.get("role") != "admin":
        allowed = user.get("allowedCaseIds") or []
        if c.get("caseId") not in allowed:
            email = user.get("email")
            patient_email = c.get("patient", {}).get("email")
            if not email or patient_email != email:
                raise HTTPException(status_code=403, detail="Forbidden")
        
        # Remove sensitive fields for patient view
        c.pop("assignedDoctorId", None)
        c.pop("assignedLabTechId", None)
        c.pop("lab_notes", None)
    
    c["_id"] = str(c.get("_id"))
    return c


@patient_router.get("/cases/{caseId}/images")
async def get_case_images(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get images for a patient's case."""
    user = _auth_patient(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"images": 1, "patient": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check patient ownership
    if user.get("role") != "admin":
        allowed = user.get("allowedCaseIds") or []
        if c.get("caseId") not in allowed:
            email = user.get("email")
            patient_email = c.get("patient", {}).get("email")
            if not email or patient_email != email:
                raise HTTPException(status_code=403, detail="Forbidden")
    
    # Filter out internal paths, only show display paths
    images = c.get("images", [])
    filtered_images = []
    for img in images:
        filtered_img = {
            "_id": img.get("_id"),
            "display_path": img.get("display_path"),
            "modality": img.get("modality"),
            "uploadedAt": img.get("uploadedAt"),
        }
        filtered_images.append(filtered_img)
    
    return {"items": filtered_images}


@patient_router.get("/cases/{caseId}/reports")
async def get_case_reports(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get medical reports for a patient's case."""
    user = _auth_patient(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"reports": 1, "patient": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check patient ownership
    if user.get("role") != "admin":
        allowed = user.get("allowedCaseIds") or []
        if c.get("caseId") not in allowed:
            email = user.get("email")
            patient_email = c.get("patient", {}).get("email")
            if not email or patient_email != email:
                raise HTTPException(status_code=403, detail="Forbidden")
    
    # Only show finalized reports to patients
    reports = c.get("reports", [])
    if user.get("role") != "admin":
        reports = [r for r in reports if r.get("status") == "final"]
    
    return {"items": reports}


@patient_router.get("/cases/{caseId}/analysis")
async def get_case_analysis(caseId: str, Authorization: Optional[str] = Header(None)):
    """Get AI analysis results for a patient's case."""
    user = _auth_patient(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId}, {"ai_analysis": 1, "patient": 1, "caseId": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check patient ownership
    if user.get("role") != "admin":
        allowed = user.get("allowedCaseIds") or []
        if c.get("caseId") not in allowed:
            email = user.get("email")
            patient_email = c.get("patient", {}).get("email")
            if not email or patient_email != email:
                raise HTTPException(status_code=403, detail="Forbidden")
    
    analysis = c.get("ai_analysis")
    if not analysis:
        return {"analysis": None}
    
    # Filter out internal paths for patient view
    filtered_analysis = {
        "summary": analysis.get("summary"),
        "display_path": analysis.get("display_path"),
        "confidence": analysis.get("confidence"),
        "analyzedAt": analysis.get("analyzedAt")
    }
    
    return {"analysis": filtered_analysis}


class PatientFeedback(BaseModel):
    rating: int  # 1-5 stars
    comments: Optional[str] = None
    category: Optional[str] = "general"  # "care_quality", "communication", "timeliness", etc.


@patient_router.post("/cases/{caseId}/feedback")
async def submit_feedback(caseId: str, payload: PatientFeedback, Authorization: Optional[str] = Header(None)):
    """Submit patient feedback for a case."""
    user = _auth_patient(Authorization)
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    
    # Check patient ownership
    if user.get("role") != "admin":
        allowed = user.get("allowedCaseIds") or []
        if c.get("caseId") not in allowed:
            email = user.get("email")
            patient_email = c.get("patient", {}).get("email")
            if not email or patient_email != email:
                raise HTTPException(status_code=403, detail="Forbidden")
    
    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    feedback = {
        "rating": payload.rating,
        "comments": payload.comments,
        "category": payload.category,
        "submittedAt": datetime.utcnow().isoformat(),
        "patientEmail": user.get("email")
    }
    
    await db["cases"].update_one(
        {"_id": c.get("_id")}, 
        {
            "$set": {
                "patient_feedback": feedback,
                "updatedAt": datetime.utcnow().isoformat()
            }
        }
    )
    
    return {"ok": True, "feedback": feedback}


@patient_router.get("/dashboard")
async def patient_dashboard(Authorization: Optional[str] = Header(None)):
    """Get patient dashboard overview."""
    user = _auth_patient(Authorization)
    db = get_db()
    
    if user.get("role") == "admin":
        # Admin gets overall stats
        total = await db["cases"].count_documents({})
        completed = await db["cases"].count_documents({"status": "analysis_complete"})
        pending = await db["cases"].count_documents({"status": {"$ne": "analysis_complete"}})
        return {
            "total_cases": total,
            "completed_cases": completed,
            "pending_cases": pending,
            "recent_reports": 0,
            "is_admin_view": True
        }
    
    email = user.get("email")
    allowed = user.get("allowedCaseIds") or []
    
    # Build filter by priority: allowedCaseIds first (caseId login), else email
    if allowed:
        q = {"caseId": {"$in": allowed}}
    elif email:
        q = {"patient.email": email}
    else:
        q = {"caseId": {"$in": []}}  # empty
    
    total = await db["cases"].count_documents(q)
    completed = await db["cases"].count_documents({**q, "status": "analysis_complete"})
    pending = max(0, total - completed)
    
    # Count recent reports (last 30 days)
    from datetime import timedelta
    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
    recent_reports = 0
    async for c in db["cases"].find(q):
        reports = c.get("reports", [])
        for r in reports:
            if r.get("status") == "final" and r.get("createdAt") and r.get("createdAt") >= thirty_days_ago:
                recent_reports += 1
    
    return {
        "total_cases": total,
        "completed_cases": completed,
        "pending_cases": pending,
        "recent_reports": recent_reports
    }


@patient_router.get("/notifications")
async def patient_notifications(since: Optional[str] = None, Authorization: Optional[str] = Header(None)):
    """Get notifications for patient."""
    user = _auth_patient(Authorization)
    
    if user.get("role") == "admin":
        return {"new_reports": 0, "status_updates": 0, "since": since or ""}
    
    email = user.get("email")
    allowed = user.get("allowedCaseIds") or []
    db = get_db()
    if allowed:
        q = {"caseId": {"$in": allowed}}
    elif email:
        q = {"patient.email": email}
    else:
        q = {"caseId": {"$in": []}}
    
    new_reports = 0
    status_updates = 0
    
    since_dt = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except Exception:
            since_dt = None
    
    async for c in db["cases"].find(q):
        # New final reports
        reports = c.get("reports", [])
        for r in reports:
            if r.get("status") == "final" and since_dt and r.get("createdAt"):
                try:
                    if datetime.fromisoformat(r.get("createdAt")) > since_dt:
                        new_reports += 1
                except Exception:
                    pass
        
        # Status updates
        if since_dt and c.get("updatedAt"):
            try:
                if datetime.fromisoformat(c.get("updatedAt")) > since_dt:
                    status_updates += 1
            except Exception:
                pass
    
    return {
        "new_reports": new_reports,
        "status_updates": status_updates,
        "since": since or ""
    }


@patient_router.get("/health-summary")
async def get_health_summary(Authorization: Optional[str] = Header(None)):
    """Get a summary of patient's health data across all cases."""
    user = _auth_patient(Authorization)
    
    if user.get("role") == "admin":
        return {"message": "Admin view not available for health summary"}
    
    email = user.get("email")
    allowed = user.get("allowedCaseIds") or []
    
    db = get_db()
    if allowed:
        q = {"caseId": {"$in": allowed}}
    elif email:
        q = {"patient.email": email}
    else:
        q = {"caseId": {"$in": []}}
    
    cases = []
    timeline = []
    
    async for c in db["cases"].find(q).sort("createdAt", 1):
        case_summary = {
            "caseId": c.get("caseId"),
            "date": c.get("createdAt", "").split("T")[0] if c.get("createdAt") else "",
            "status": c.get("status"),
            "has_analysis": bool(c.get("ai_analysis")),
            "has_reports": bool(c.get("reports", [])),
            "modalities": list(set(img.get("modality") for img in c.get("images", []) if img.get("modality")))
        }
        cases.append(case_summary)
        
        # Add to timeline
        timeline.append({
            "date": case_summary["date"],
            "event": f"Case {c.get('caseId')} created",
            "type": "case_created"
        })
        
        # Add analysis to timeline
        if c.get("ai_analysis", {}).get("analyzedAt"):
            analysis_date = c.get("ai_analysis", {}).get("analyzedAt", "").split("T")[0]
            timeline.append({
                "date": analysis_date,
                "event": f"Analysis completed for case {c.get('caseId')}",
                "type": "analysis_complete"
            })
    
    # Sort timeline by date
    timeline.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    return {
        "total_cases": len(cases),
        "cases": cases,
        "timeline": timeline[:10]  # Last 10 events
    }
