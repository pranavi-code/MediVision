from __future__ import annotations

from datetime import datetime
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from bson import ObjectId
from pymongo import ReturnDocument

from medrax.utils.database import get_db
from medrax.utils.emailer import send_email
import hashlib
import secrets


admin_router = APIRouter(prefix="/api", tags=["admin"])


def _case_id_prefix() -> str:
    return os.getenv("CASE_ID_PREFIX", "CX")


async def _next_case_id() -> str:
    """Generate a unique, sequential human-readable case id per year.

    Uses a counters collection with atomic $inc to avoid race conditions.
    Example: CX20250001
    """
    db = get_db()
    year = datetime.utcnow().year
    counter = await db["counters"].find_one_and_update(
        {"_id": f"case_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = counter.get("seq", 1)
    return f"{_case_id_prefix()}{year}{seq:04d}"


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid id")
    return ObjectId(id_str)


# =========================
# Schemas (minimal, flexible)
# =========================


class PatientModel(BaseModel):
    name: str
    dob: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class CreateCasePayload(BaseModel):
    patient: PatientModel
    assignedDoctorId: Optional[str] = Field(default=None)
    assignedLabTechId: Optional[str] = Field(default=None)


class AssignPayload(BaseModel):
    assignedDoctorId: Optional[str] = None
    assignedLabTechId: Optional[str] = None


class StatusPayload(BaseModel):
    status: str


ALLOWED_STATUSES = {
    "awaiting_scan",
    "scan_uploaded",
    "analysis_complete",
    "archived",
}


# ===== Cases =====


@admin_router.post("/cases")
async def create_case(payload: CreateCasePayload):
    db = get_db()
    cid = await _next_case_id()
    now = datetime.utcnow().isoformat()
    doc: Dict[str, Any] = {
        "caseId": cid,
        "patient": payload.patient.dict(),
        "assignedDoctorId": payload.assignedDoctorId,
        "assignedLabTechId": payload.assignedLabTechId,
        # status removed per simplified workflow
        "scanPath": None,
        "aiAnalysis": None,
        "doctorNotes": None,
        "createdAt": now,
        "updatedAt": now,
    }
    await db["cases"].insert_one(doc)

    # Optional: create or upsert patient record, and email them the Case ID
    try:
        patient = payload.patient.dict()
        if patient and (patient.get("email") or patient.get("phone")):
            # upsert into patients by email if available, otherwise by name+dob
            pfilt: Dict[str, Any] = {}
            if patient.get("email"):
                pfilt["email"] = patient["email"]
            else:
                pfilt = {"name": patient.get("name"), "dob": patient.get("dob")}
            await db["patients"].update_one(pfilt, {"$set": patient, "$setOnInsert": {"createdAt": now}}, upsert=True)

            # Email patient a simple instruction with Case ID (no credentials needed)
            app_base = os.getenv("APP_BASE_URL", "http://localhost:5173")
            patient_url = f"{app_base}/patient-login?caseId={cid}"
            if patient.get("email"):
                send_email(
                    to=patient["email"],
                    subject=f"Your Case ID: {cid}",
                    text=(
                        f"Hello {patient.get('name','')},\n\n"
                        f"Your case has been created. Case ID: {cid}.\n"
                        f"You can view status and results here: {patient_url}\n\n"
                        f"— MediVision"
                    ),
                )
    except Exception as _e:
        # Do not fail case creation if patient upsert/email fails
        pass

    return {"ok": True, "caseId": cid}


@admin_router.get("/cases")
async def list_cases(
    status: Optional[str] = Query(default=None),
    doctorId: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    skip: int = 0,
    limit: int = 50,
):
    db = get_db()
    filt: Dict[str, Any] = {}
    if status:
        filt["status"] = status
    if doctorId:
        filt["assignedDoctorId"] = doctorId
    if q:
        # simple OR search on patient fields
        filt["$or"] = [
            {"patient.name": {"$regex": q, "$options": "i"}},
            {"patient.phone": {"$regex": q, "$options": "i"}},
            {"patient.email": {"$regex": q, "$options": "i"}},
            {"caseId": {"$regex": q, "$options": "i"}},
        ]
    cursor = db["cases"].find(filt).skip(max(0, skip)).limit(min(200, max(1, limit))).sort("updatedAt", -1)
    items = [
        {**c, "_id": str(c.get("_id"))} async for c in cursor
    ]
    return {"items": items}


@admin_router.get("/cases/{caseId}")
async def get_case(caseId: str):
    db = get_db()
    c = await db["cases"].find_one({"caseId": caseId})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    c["_id"] = str(c.get("_id"))
    return c


@admin_router.get("/cases/stats")
async def case_stats():
    """Return simple counts per status for dashboard counters."""
    db = get_db()
    statuses = ["awaiting_scan", "scan_uploaded", "analysis_complete", "archived"]
    counts: Dict[str, int] = {}
    for s in statuses:
        counts[s] = await db["cases"].count_documents({"status": s})
    total = await db["cases"].count_documents({})
    return {"total": total, **counts}


@admin_router.patch("/cases/{caseId}/assign")
async def assign_case(caseId: str, payload: AssignPayload):
    db = get_db()
    updates: Dict[str, Any] = {}
    if payload.assignedDoctorId is not None:
        updates["assignedDoctorId"] = payload.assignedDoctorId
    if payload.assignedLabTechId is not None:
        updates["assignedLabTechId"] = payload.assignedLabTechId
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updatedAt"] = datetime.utcnow().isoformat()
    res = await db["cases"].update_one({"caseId": caseId}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"ok": True}


@admin_router.patch("/cases/{caseId}/status")
async def update_case_status(caseId: str, payload: StatusPayload):
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    db = get_db()
    res = await db["cases"].update_one(
        {"caseId": caseId},
        {"$set": {"status": payload.status, "updatedAt": datetime.utcnow().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"ok": True}


@admin_router.patch("/cases/{caseId}/archive")
async def archive_case(caseId: str):
    db = get_db()
    res = await db["cases"].update_one(
        {"caseId": caseId},
        {"$set": {"status": "archived", "updatedAt": datetime.utcnow().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"ok": True}


@admin_router.post("/cases/{caseId}/resend")
async def resend_instructions(caseId: str):
    db = get_db()
    case = await db["cases"].find_one({"caseId": caseId})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    patient = case.get("patient", {}) or {}
    email = patient.get("email")
    app_base = os.getenv("APP_BASE_URL", "http://localhost:5173")
    patient_url = f"{app_base}/patient-login?caseId={caseId}"

    sent = False
    if email:
        try:
            sent = send_email(
                to=email,
                subject=f"Your Case ID: {caseId}",
                text=(
                    f"Hello {patient.get('name','')},\n\n"
                    f"Here is your case link. Case ID: {caseId}.\n"
                    f"Access your case here: {patient_url}\n\n"
                    f"— MediVision"
                ),
            ) or False
        except Exception:
            sent = False

    return {"ok": True, "sent": bool(sent), "caseId": caseId, "email": email or ""}


# ===== Doctors =====


class CreateDoctorPayload(BaseModel):
    name: str
    email: str
    password: str
    specialty: Optional[str] = None


@admin_router.post("/doctors")
async def add_doctor(payload: CreateDoctorPayload):
    db = get_db()
    # basic validation
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    doc = {
        "name": payload.name,
        "email": payload.email,
        "passwordPlain": payload.password,  # stored to allow 'Send Credentials' later per requirements
        "specialty": payload.specialty,
        "active": True,
        "createdAt": datetime.utcnow().isoformat(),
    }
    res = await db["doctors"].insert_one(doc)

    # Create or update user credential with provided password
    try:
        pw_hash = hashlib.sha256(payload.password.encode()).hexdigest()
        await db["users"].update_one(
            {"email": payload.email},
            {"$set": {"email": payload.email, "role": "doctor", "passwordHash": pw_hash, "active": True, "updatedAt": datetime.utcnow().isoformat()},
             "$setOnInsert": {"createdAt": datetime.utcnow().isoformat()}},
            upsert=True,
        )

        app_base = os.getenv("APP_BASE_URL", "http://localhost:5173")
        dashboard_url = f"{app_base}/doctor-dashboard"
        send_email(
            to=payload.email,
            subject="Your MediVision Doctor Account",
            text=(
                f"Hello {payload.name},\n\n"
                f"An account has been created for you on MediVision.\n"
                f"Role: Doctor\n"
                f"Password: {payload.password}\n"
                f"Login/Dashboard: {dashboard_url}\n\n"
                f"Please change your password after first login.\n\n— MediVision"
            ),
        )
    except Exception as _e:
        # Soft-fail email/user creation; admin can resend later
        pass

    return {"ok": True, "id": str(res.inserted_id)}


@admin_router.get("/doctors")
async def list_doctors():
    db = get_db()
    items = [
        {**d, "_id": str(d.get("_id"))} async for d in db["doctors"].find({}).sort("name", 1)
    ]
    return {"items": items}


@admin_router.patch("/doctors/{id}/toggle")
async def toggle_doctor(id: str):
    db = get_db()
    doc = await db["doctors"].find_one({"_id": _oid(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    new_active = not bool(doc.get("active", True))
    # Toggle active flag on doctors collection
    await db["doctors"].update_one({"_id": _oid(id)}, {"$set": {"active": new_active}})
    # Also reflect this on the corresponding user to affect login ability
    await db["users"].update_one(
        {"email": doc.get("email")},
        {"$set": {"active": new_active, "updatedAt": datetime.utcnow().isoformat()}},
    )
    return {"ok": True, "active": new_active}


@admin_router.post("/doctors/{id}/resend")
async def resend_doctor_credentials(id: str):
    """Regenerate a temporary password and email it to the doctor."""
    db = get_db()
    doc = await db["doctors"].find_one({"_id": _oid(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")

    temp_pw = secrets.token_urlsafe(10)
    pw_hash = hashlib.sha256(temp_pw.encode()).hexdigest()
    await db["users"].update_one(
        {"email": doc.get("email")},
        {"$set": {"email": doc.get("email"), "role": "doctor", "passwordHash": pw_hash, "active": True, "updatedAt": datetime.utcnow().isoformat()},
         "$setOnInsert": {"createdAt": datetime.utcnow().isoformat()}},
        upsert=True,
    )

    app_base = os.getenv("APP_BASE_URL", "http://localhost:5173")
    dashboard_url = f"{app_base}/doctor-dashboard"
    send_email(
        to=doc.get("email"),
        subject="Your MediVision Doctor Credentials",
        text=(
            f"Hello {doc.get('name','Doctor')},\n\n"
            f"Here are your updated login details.\n"
            f"Temporary Password: {temp_pw}\n"
            f"Dashboard: {dashboard_url}\n\n"
            f"Please change your password after first login.\n\n— MediVision"
        ),
    )
    return {"ok": True}


@admin_router.post("/doctors/{id}/send")
async def send_doctor_credentials(id: str):
    """Send existing credentials (email + saved password) to the doctor.

    Note: This uses the password provided at creation time stored in doctors.passwordPlain.
    If it's missing (legacy records), instruct admin to set a new password.
    """
    db = get_db()
    doc = await db["doctors"].find_one({"_id": _oid(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    email = doc.get("email")
    name = doc.get("name", "Doctor")
    pw = doc.get("passwordPlain")
    if not pw:
        raise HTTPException(status_code=400, detail="No saved password for this doctor; please set a new one.")

    app_base = os.getenv("APP_BASE_URL", "http://localhost:5173")
    dashboard_url = f"{app_base}/doctor-dashboard"
    send_email(
        to=email,
        subject="Your MediVision Doctor Credentials",
        text=(
            f"Hello {name},\n\n"
            f"Your login details:\n"
            f"Email: {email}\n"
            f"Password: {pw}\n"
            f"Dashboard: {dashboard_url}\n\n"
            f"Please change your password after first login.\n\n— MediVision"
        ),
    )
    return {"ok": True}


# ===== Lab Techs =====


class CreateLabTechPayload(BaseModel):
    name: str
    email: str
    labId: Optional[str] = None


@admin_router.post("/labtechs")
async def add_labtech(payload: CreateLabTechPayload):
    db = get_db()
    doc = {
        "name": payload.name,
        "email": payload.email,
        "labId": payload.labId,
        "active": True,
        "createdAt": datetime.utcnow().isoformat(),
    }
    res = await db["labtechs"].insert_one(doc)
    return {"ok": True, "id": str(res.inserted_id)}


@admin_router.get("/labtechs")
async def list_labtechs():
    db = get_db()
    items = [
        {**t, "_id": str(t.get("_id"))} async for t in db["labtechs"].find({}).sort("name", 1)
    ]
    return {"items": items}


@admin_router.patch("/labtechs/{id}/toggle")
async def toggle_labtech(id: str):
    db = get_db()
    doc = await db["labtechs"].find_one({"_id": _oid(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Lab tech not found")
    new_active = not bool(doc.get("active", True))
    await db["labtechs"].update_one({"_id": _oid(id)}, {"$set": {"active": new_active}})
    return {"ok": True, "active": new_active}


# ===== Patients =====


@admin_router.get("/patients")
async def search_patients(q: Optional[str] = None, limit: int = 50):
    db = get_db()
    filt: Dict[str, Any] = {}
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    items = [
        {**p, "_id": str(p.get("_id"))} async for p in db["patients"].find(filt).limit(min(200, max(1, limit))).sort("name", 1)
    ]
    return {"items": items}


class UpdatePatientPayload(BaseModel):
    name: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@admin_router.patch("/patients/{id}")
async def update_patient(id: str, payload: UpdatePatientPayload):
    db = get_db()
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db["patients"].update_one({"_id": _oid(id)}, {"$set": updates})
    return {"ok": True}


# ===== Settings =====


@admin_router.get("/settings")
async def get_settings():
    db = get_db()
    doc = await db["settings"].find_one({"_id": "global"})
    if not doc:
        doc = {
            "_id": "global",
            "caseIdPrefix": _case_id_prefix(),
            "brandName": os.getenv("BRAND_NAME", "MediVision"),
            "brandLogoUrl": os.getenv("BRAND_LOGO_URL", ""),
            "notification": {"email": True, "sms": False},
        }
        await db["settings"].insert_one(doc)
    doc["_id"] = str(doc.get("_id"))
    return doc


class UpdateSettingsPayload(BaseModel):
    caseIdPrefix: Optional[str] = None
    brandName: Optional[str] = None
    brandLogoUrl: Optional[str] = None
    notification: Optional[Dict[str, bool]] = None


@admin_router.patch("/settings")
async def update_settings(payload: UpdateSettingsPayload):
    db = get_db()
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        return {"ok": True}
    await db["settings"].update_one({"_id": "global"}, {"$set": updates}, upsert=True)
    return {"ok": True}
