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

_secret_cache = {"secret": None, "loaded_at": 0.0}
_SECRET_CACHE_TTL = 60  # seconds — matches the frontend's 60s permission cache


async def _platform_secrets() -> dict:
    """Read the `platform_settings` secrets record, tolerating Mongo hiccups.

    This is the single source of truth for runtime secrets; env vars take
    precedence for the per-process values (see resolvers below). Cached for
    _SECRET_CACHE_TTL to avoid a DB hit on every auth check.
    """
    import time

    now = time.time()
    if _secret_cache["secret"] is not None and now - _secret_cache["loaded_at"] < _SECRET_CACHE_TTL:
        return _secret_cache["secret"]
    try:
        from core.database import get_collection

        secrets_col = await get_collection("platform_settings")
        doc = await secrets_col.find_one({"key": "secrets"})
        value = dict(doc.get("value") or {}) if doc else {}
    except Exception:
        value = {}
    _secret_cache["secret"] = value
    _secret_cache["loaded_at"] = now
    return value


async def get_internal_backend_secret() -> str:
    """Resolve the internal service secret: Mongo first, then env.

    Fixes a recurring prod outage: building/rolling the backend image with Dokploy
    re-applies Dokploy's stored env, which can drop ad-hoc `--env-add` values from
    the service spec. Falling back to the Mongo copy means the backend keeps
    trusting frontend-to-backend calls even when the env var is missing.
    """
    try:
        secrets = await _platform_secrets()
        stored = str(secrets.get("internal_backend_secret", "") or "").strip()
        if len(stored) >= 32 and "•" not in stored:
            return stored
    except Exception:
        pass
    return (settings.INTERNAL_BACKEND_SECRET or "").strip()


async def get_session_secret() -> str:
    """Resolve the JWT signing secret: Mongo first, then env.

    Mirrors the frontend (`lib/session.ts`): if a rebuild drops SESSION_SECRET from
    the service env, we fall back to the secret persisted in `platform_settings`.
    Keeps existing sessions valid because the value is identical across pods.
    """
    try:
        secrets = await _platform_secrets()
        stored = str(secrets.get("session_secret", "") or "").strip()
        if len(stored) >= 32 and "•" not in stored:
            return stored
    except Exception:
        pass
    return (settings.SESSION_SECRET or "").strip()


async def _get_session_payload_from_request(request: Request) -> dict | None:
    """Extract and verify a session payload from the request.

    Checks Authorization header first, then session cookie.
    Returns the JWT payload dict (containing at minimum 'uid') or None.
    """
    # 1. Try Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        secret = await get_session_secret()
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
            secret = await get_session_secret()
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
    backend_secret = await get_internal_backend_secret()
    if secret and backend_secret and secret == backend_secret:
        return True

    # Only allow bypass if INTERNAL_BACKEND_SECRET is explicitly empty AND env is dev
    if not backend_secret and settings.ENVIRONMENT == "development":
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
    backend_secret = await get_internal_backend_secret()
    if secret and backend_secret and secret == backend_secret:
        return {"_is_internal": True, "_id": "__internal__", "role": "internal_service"}

    # Only allow bypass in dev
    if not backend_secret and settings.ENVIRONMENT == "development":
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
