from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson import ObjectId

from medrax.utils.database import get_db
from medrax.utils.jwt import verify_jwt
# Avoid importing from api at module import time to prevent circular imports.
# We'll import needed symbols lazily inside functions.


cases_router = APIRouter(prefix="/api", tags=["cases"])


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def _auth_roles(authorization: Optional[str], roles=("doctor", "lab_tech", "admin")) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Forbidden")
    return payload


async def _grid_bucket() -> AsyncIOMotorGridFSBucket:
    db = get_db()
    return AsyncIOMotorGridFSBucket(db)


@cases_router.post("/cases/{caseId}/images")
async def attach_image_to_case(caseId: str, store: str = Form("fs"), modality: Optional[str] = Form(None), file: UploadFile = File(...), Authorization: Optional[str] = Header(None)):
    user = _auth_roles(Authorization)
    db = get_db()
    case = await db["cases"].find_one({"caseId": caseId})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Lazy import from api to avoid circular import at module load time
    from api import upload_dir, initialize_medrax, chat_interface, initialization_error

    # Save to disk
    timestamp = int(time.time())
    ext = Path(file.filename or "").suffix
    saved_filename = f"case_{caseId}_{timestamp}{ext}"
    file_path = upload_dir / saved_filename
    content = await file.read()
    file_path.write_bytes(content)

    # Try to detect modality if not provided and DICOM
    if not modality:
        try:
            if (file.filename or "").lower().endswith(".dcm"):
                import pydicom  # type: ignore
                ds = pydicom.dcmread(str(file_path), stop_before_pixels=True)
                mod = getattr(ds, "Modality", None)
                if isinstance(mod, str) and mod:
                    modality = mod
        except Exception:
            modality = None

    # Optional display processing via ChatInterface util
    await initialize_medrax()
    display_path = f"/uploads/{saved_filename}"
    if not initialization_error and chat_interface is not None:
        try:
            dp = chat_interface.handle_upload(str(file_path))
            if dp:
                display_path = dp
        except Exception:
            pass

    grid_id = None
    if store.lower() == "gridfs":
        bucket = await _grid_bucket()
        grid_id = await bucket.upload_from_stream(file.filename or saved_filename, content)

    entry = {
        "_id": str(ObjectId()),
        "original_path": str(file_path),
        "display_path": display_path,
        "gridfs_id": str(grid_id) if grid_id else None,
        "uploadedAt": datetime.utcnow().isoformat(),
        "uploadedBy": str(user.get("sub")),
        "modality": modality,
    }
    await db["cases"].update_one({"_id": case.get("_id")}, {"$push": {"images": entry}, "$set": {"updatedAt": datetime.utcnow().isoformat()}})
    return {"ok": True, "image": entry}


@cases_router.get("/images/{grid_id}")
async def get_image_from_db(grid_id: str, Authorization: Optional[str] = Header(None)):
    _auth_roles(Authorization, roles=("doctor", "lab_tech", "admin", "user"))
    try:
        bucket = await _grid_bucket()
        grid_out = await bucket.open_download_stream(ObjectId(grid_id))
        data = await grid_out.read()
        # No strict content-type detection here; serve as binary
        return Response(content=data, media_type="application/octet-stream")
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")
