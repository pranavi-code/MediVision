from __future__ import annotations

"""
MongoDB database utilities for the MedRAX API.

This keeps a single global Motor client and exposes:
 - connect_to_mongo(): initialize client/db from env
 - close_mongo_connection(): close the client on shutdown
 - get_db(): retrieve active DB handle (raises if not connected)
 - ensure_indexes(): create minimal indexes for Admin MVP

Safe-by-default: if MONGODB_URI is missing, connect_to_mongo will raise.
Callers should catch and log to avoid crashing unrelated features.
"""

from os import getenv
from typing import Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv()

_MONGO_URI = getenv("MONGODB_URI")
_DB_NAME = getenv("MONGODB_DB", "medivision")

client: Optional[AsyncIOMotorClient] = None
db: Optional[AsyncIOMotorDatabase] = None


async def connect_to_mongo():
    """Initialize the global Mongo client and DB handle.

    Raises:
        RuntimeError: if MONGODB_URI is not configured
    """
    global client, db
    if client is not None and db is not None:
        return

    if not _MONGO_URI:
        raise RuntimeError("MONGODB_URI not set. Add it to your .env or environment.")

    client = AsyncIOMotorClient(_MONGO_URI)
    db = client[_DB_NAME]


async def close_mongo_connection():
    """Close the global Mongo client (noop if not connected)."""
    global client, db
    if client is not None:
        client.close()
    client = None
    db = None


def get_db() -> AsyncIOMotorDatabase:
    """Return the active database handle or raise if not initialized."""
    if db is None:
        raise RuntimeError("DB not initialized. Call connect_to_mongo() on startup.")
    return db


async def ensure_indexes():
    """Create minimal indexes used by the Admin MVP.

    Idempotent: safe to call on every startup.
    """
    database = get_db()
    # Unique, human-readable case identifier
    await database["cases"].create_index("caseId", unique=True)
    # Users unique by email (covers admins/doctors/lab techs if stored together)
    await database["users"].create_index([("email", 1)], unique=True)
    # Separate collections for convenience
    await database["doctors"].create_index([("email", 1)], unique=True)
    await database["labtechs"].create_index([("email", 1)], unique=True)
