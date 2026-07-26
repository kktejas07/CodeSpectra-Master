"""
Authentication & authorization dependencies.

Provides two auth paths:
  1. Service-to-service (internal secret header) for calls from Next.js
  2. Session cookie / Bearer token for direct client-to-backend calls

For internal routes, the pattern is:
    async def my_route(..., auth = Depends(require_auth)):  # passes on secret OR session
    async def my_route(..., user = Depends(get_current_user)):  # extracts user dict

Both check the internal secret FIRST (fast path), then fall back to session validation.
"""
from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from jose import jwt as jose_jwt

from core.database import get_database
from core.config import settings

SESSION_COOKIE_NAME = "codespectra_session"
logger = logging.getLogger(__name__)


async def _get_session_payload_from_request(request: Request) -> dict | None:
    """Extract and verify a session payload from the request.

    Checks Authorization header first, then session cookie.
    Returns the JWT payload dict (containing at minimum 'uid') or None.
    """
    # 1. Try Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        secret = settings.SESSION_SECRET
        if secret:
            try:
                payload = jose_jwt.decode(
                    token, secret, algorithms=["HS256"], options={"verify_exp": True}
                )
                if payload and payload.get("uid"):
                    return payload
            except Exception:
                pass

    # 2. Try session cookie
    cookie = request.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith(f"{SESSION_COOKIE_NAME}="):
            session_cookie = part[len(SESSION_COOKIE_NAME) + 1:]
            secret = settings.SESSION_SECRET
            if secret:
                try:
                    payload = jose_jwt.decode(
                        session_cookie,
                        secret,
                        algorithms=["HS256"],
                        options={"verify_exp": True},
                    )
                    if payload and payload.get("uid"):
                        return payload
                except Exception:
                    pass

    return None


async def require_auth(request: Request):
    """Authenticate the request via internal secret, bearer token, or session cookie.

    Fast path: the x-internal-secret header matches INTERNAL_BACKEND_SECRET.
    Fallback: a valid JWT session cookie or bearer token.

    Raises 401 if no valid authentication is found.
    """
    # Fast path: internal shared secret (service-to-service calls from Next.js)
    secret = request.headers.get("x-internal-secret", "")
    if secret and settings.INTERNAL_BACKEND_SECRET and secret == settings.INTERNAL_BACKEND_SECRET:
        return True

    # Only allow bypass if INTERNAL_BACKEND_SECRET is explicitly empty AND env is dev
    if not settings.INTERNAL_BACKEND_SECRET and settings.ENVIRONMENT == "development":
        return True

    # Full path: validate session cookie or bearer token
    payload = await _get_session_payload_from_request(request)
    if payload:
        return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please sign in.",
    )


async def get_current_user(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Authenticate and return the current user document from MongoDB.

    Returns the full user document on success.
    Raises 401 if authentication fails.
    """
    uid: str | None = None

    # Fast path: internal secret — return a minimal user stub
    secret = request.headers.get("x-internal-secret", "")
    if secret and settings.INTERNAL_BACKEND_SECRET and secret == settings.INTERNAL_BACKEND_SECRET:
        return {"_is_internal": True, "_id": "__internal__", "role": "internal_service"}

    # Only allow bypass in dev
    if not settings.INTERNAL_BACKEND_SECRET and settings.ENVIRONMENT == "development":
        return {"_is_internal": True, "_id": "__dev__", "role": "superadmin"}

    # Extract session payload
    payload = await _get_session_payload_from_request(request)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    uid = payload.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session: no user identifier found.",
        )

    # Look up user in MongoDB (try both id and _id)
    user = await db["user"].find_one({"id": uid})
    if not user:
        user = await db["user"].find_one({"_id": uid})

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or session invalid.",
        )

    return user
