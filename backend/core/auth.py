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

import hmac
import logging

import jwt as pyjwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

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


def secrets_match(provided: str | None, expected: str | None) -> bool:
    """Timing-safe comparison of a presented secret against the configured one.

    Empty values never match (an unset secret must not authenticate an empty
    header).
    """
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def _decode_session_token(token: str, secret: str) -> dict | None:
    """Verify an HS256 session JWT (PyJWT; algorithm pinned, exp required)."""
    if not token or not secret:
        return None
    try:
        payload = pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp"], "verify_exp": True},
        )
    except Exception:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("uid"), str) or not payload.get("uid"):
        return None
    return payload


def _uid_filter(uid: str) -> dict:
    """Same lookup as frontend lib/session.ts uidFilter (id | _id | firebase_uid)."""
    ors: list[dict] = [{"id": uid}, {"_id": uid}, {"firebase_uid": uid}]
    if len(uid) == 24 and ObjectId.is_valid(uid):
        ors.append({"_id": ObjectId(uid)})
    return {"$or": ors}


def account_block_reason(profile: dict | None) -> str | None:
    """Mirror of frontend lib/auth-account.ts accountBlockReason."""
    if profile is None:
        return "missing"
    st = str(profile.get("status") or "").lower().strip()
    if st in ("inactive", "suspended", "deleted", "disabled"):
        return "inactive"
    if profile.get("isActive") is False:
        return "inactive"
    if profile.get("deletedAt"):
        return "inactive"
    return None


def session_version_current(token_ver, profile: dict | None) -> bool:
    """Mirror of frontend isSessionVersionCurrent (missing version == 1)."""
    if profile is None:
        return False
    current = profile.get("session_version")
    current = current if isinstance(current, int) and not isinstance(current, bool) else 1
    ver = token_ver if isinstance(token_ver, int) and not isinstance(token_ver, bool) else 1
    return ver == current


async def _session_still_valid(payload: dict) -> dict | None:
    """Account exists + active, session version current, sid not signed out.

    Fails closed: any DB error refuses the token (same as verifySessionToken).
    Returns the user document on success.
    """
    try:
        db = await get_database()
        user = await db["user"].find_one(_uid_filter(payload["uid"]))
        if account_block_reason(user):
            return None
        if not session_version_current(payload.get("ver"), user):
            return None
        sid = payload.get("sid")
        if isinstance(sid, str) and sid:
            revoked = await db["revoked_sessions"].find_one({"sid": sid}, {"_id": 1})
            if revoked:
                return None
        return user
    except Exception as exc:  # noqa: BLE001
        logger.warning("[auth] session account check failed, refusing token: %s", type(exc).__name__)
        return None


async def _get_session_payload_from_request(request: Request) -> dict | None:
    """Extract, verify and re-check a session (signature, expiry, account, version, revocation).

    Bearer header first, then the session cookie. Returns the JWT payload with
    the user document under ``_user`` or None.
    """
    secret = await get_session_secret()
    if not secret:
        return None
    candidates: list[str] = []
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        candidates.append(auth_header[7:].strip())
    cookie_val = request.cookies.get(SESSION_COOKIE_NAME, "")
    if cookie_val:
        candidates.append(cookie_val)
    for token in candidates:
        payload = _decode_session_token(token, secret)
        if not payload:
            continue
        user = await _session_still_valid(payload)
        if user:
            payload["_user"] = user
            return payload
    return None


async def has_valid_internal_secret(request: Request) -> bool:
    presented = request.headers.get("x-internal-secret", "")
    return secrets_match(presented, await get_internal_backend_secret())


def _dev_bypass_allowed(backend_secret: str) -> bool:
    return not backend_secret and settings.ENVIRONMENT == "development"


async def require_internal_secret(request: Request) -> bool:
    """Service-to-service only: the caller must present INTERNAL_BACKEND_SECRET.

    Used on every /internal/* AI route — those spend platform API keys, so a
    user session is NOT enough (the browser never talks to the backend).
    Timing-safe compare. Local development with no secret configured is the
    only bypass.
    """
    backend_secret = await get_internal_backend_secret()
    if secrets_match(request.headers.get("x-internal-secret", ""), backend_secret):
        return True
    if _dev_bypass_allowed(backend_secret):
        return True
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal endpoint.")


async def require_auth(request: Request):
    """Authenticate the request via internal secret, bearer token, or session cookie.

    Fast path: the x-internal-secret header matches INTERNAL_BACKEND_SECRET.
    Fallback: a valid, current session (same checks as the frontend).

    Raises 401 if no valid authentication is found.
    """
    backend_secret = await get_internal_backend_secret()
    if secrets_match(request.headers.get("x-internal-secret", ""), backend_secret):
        return True

    if _dev_bypass_allowed(backend_secret):
        return True

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
    backend_secret = await get_internal_backend_secret()
    if secrets_match(request.headers.get("x-internal-secret", ""), backend_secret):
        return {"_is_internal": True, "_id": "__internal__", "role": "internal_service"}

    if _dev_bypass_allowed(backend_secret):
        return {"_is_internal": True, "_id": "__dev__", "role": "superadmin"}

    payload = await _get_session_payload_from_request(request)
    if not payload or not payload.get("_user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )
    return payload["_user"]
