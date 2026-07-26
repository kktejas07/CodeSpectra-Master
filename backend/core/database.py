"""
Async MongoDB connection manager (motor).

Consolidates the inline `pymongo.MongoClient` call from `ai_router.py`
into a single reusable connection managed via FastAPI's dependency injection.
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.server_api import ServerApi

from core.config import settings


_client: AsyncIOMotorClient | None = None


async def get_client() -> AsyncIOMotorClient:
    """Return the singleton async MongoDB client, creating it if needed."""
    global _client
    if _client is None:
        uri = settings.MONGO_URL
        if not uri:
            raise RuntimeError(
                "MONGODB_URI not configured — set it in .env or environment"
            )
        _client = AsyncIOMotorClient(
            uri,
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=8000,
        )
        # Ping to confirm connectivity
        await _client.admin.command("ping")
    return _client


async def get_database() -> AsyncIOMotorDatabase:
    """Return the application database instance."""
    client = await get_client()
    return client[settings.MONGODB_DB_NAME]


async def get_collection(name: str):
    """Shortcut to get a named collection from the app database (async)."""
    db = await get_database()
    return db.get_collection(name)


async def close_client() -> None:
    """Close the MongoDB connection (call on app shutdown)."""
    global _client
    if _client:
        _client.close()
        _client = None