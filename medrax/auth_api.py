from __future__ import annotations

import os
import hashlib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

from medrax.utils.database import get_db
from medrax.utils.jwt import create_jwt, verify_jwt


auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


def _hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


class LoginPayload(BaseModel):
    email: str
    password: str


class SignupPayload(BaseModel):
    name: str
    email: str
    password: str
    organization: Optional[str] = None


@auth_router.post("/login")
async def login(payload: LoginPayload):
    db = get_db()
    user = await db["users"].find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account inactive")
    if user.get("passwordHash") != _hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt({
        "sub": str(user.get("_id")),
        "email": user.get("email"),
        "role": user.get("role", "user"),
        "name": user.get("name", user.get("email")),
    }, _jwt_secret(), exp_seconds=60 * 60 * 8)

    return {
        "ok": True,
        "token": token,
        "user": {
            "id": str(user.get("_id")),
            "email": user.get("email"),
            "role": user.get("role", "user"),
            "name": user.get("name") or user.get("email"),
        },
    }


@auth_router.post("/signup")
async def signup(payload: SignupPayload):
    db = get_db()
    # basic validation
    if not payload.email or not payload.password or not payload.name:
        raise HTTPException(status_code=400, detail="Missing required fields")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")

    existing = await db["users"].find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    doc = {
        "email": payload.email,
        "name": payload.name,
        "role": "user",  # general user
        "passwordHash": _hash_password(payload.password),
        "active": True,
        "organization": payload.organization,
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
    }
    res = await db["users"].insert_one(doc)
    return {"ok": True, "id": str(res.inserted_id)}


# Alias for your earlier test command
@auth_router.post("/debug_login")
async def debug_login(payload: LoginPayload):
    return await login(payload)


class SeedPayload(BaseModel):
    email: str = "admin@medivision.local"
    password: str = "admin123"
    name: Optional[str] = "Admin User"


@auth_router.post("/debug_seed_admin")
async def debug_seed_admin(payload: SeedPayload):
    db = get_db()
    pw_hash = _hash_password(payload.password)
    await db["users"].update_one(
        {"email": payload.email},
        {"$set": {
            "email": payload.email,
            "name": payload.name,
            "role": "admin",
            "passwordHash": pw_hash,
            "active": True,
            "updatedAt": datetime.utcnow().isoformat(),
        }, "$setOnInsert": {"createdAt": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


class DebugSetPasswordPayload(BaseModel):
    email: str
    password: str
    role: Optional[str] = "doctor"
    name: Optional[str] = None


@auth_router.post("/debug_set_password")
async def debug_set_password(payload: DebugSetPasswordPayload):
    """Development helper: set or reset a user's password directly.

    Creates the user if missing with the given role.
    """
    db = get_db()
    pw_hash = _hash_password(payload.password)
    await db["users"].update_one(
        {"email": payload.email},
        {"$set": {
            "email": payload.email,
            "name": payload.name or payload.email,
            "role": payload.role or "doctor",
            "passwordHash": pw_hash,
            "active": True,
            "updatedAt": datetime.utcnow().isoformat(),
        }, "$setOnInsert": {"createdAt": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


def _auth_from_header(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = verify_jwt(token, _jwt_secret())
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


@auth_router.get("/me")
async def me(Authorization: Optional[str] = Header(None)):
    payload = _auth_from_header(Authorization)
    return {"ok": True, "user": payload}


class ChangePasswordPayload(BaseModel):
    oldPassword: str
    newPassword: str


@auth_router.post("/change_password")
async def change_password(payload: ChangePasswordPayload, Authorization: Optional[str] = Header(None)):
    auth = _auth_from_header(Authorization)
    db = get_db()
    user = await db["users"].find_one({"email": auth.get("email")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("passwordHash") != _hash_password(payload.oldPassword):
        raise HTTPException(status_code=401, detail="Old password incorrect")
    await db["users"].update_one(
        {"_id": user.get("_id")},
        {"$set": {"passwordHash": _hash_password(payload.newPassword), "updatedAt": datetime.utcnow().isoformat()}},
    )
    return {"ok": True}
