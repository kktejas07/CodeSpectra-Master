"""
Authentication & authorization dependencies.

These mirror the checks that Next.js/Better Auth performs before proxying
to the FastAPI backend. The internal AI router trusts that auth has already
happened at the Next.js layer; however, calls to internal routers can also
arrive directly from the browser (in-cluster), so we validate an internal
shared-secret header as defense-in-depth.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from core.database import get_database
from core.config import settings


async def require_auth(request: Request):
    """
    Validate internal request secret header for direct browser-to-backend calls.

    In the current architecture, Next.js API routes validate the session cookie
    before calling internal backend routers. However, the internal router port
    (8001) is reachable from browsers in the cluster network (not just from
    Next.js), so we add a shared-secret check as defense-in-depth.

    Requests with a valid x-internal-secret header are allowed through.
    """
    secret = request.headers.get("x-internal-secret", "")
    if secret and secret == settings.INTERNAL_BACKEND_SECRET:
        return True

    if not settings.INTERNAL_BACKEND_SECRET:
        return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid internal request credentials",
    )


async def get_current_user(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Extract the authenticated user from the request context.

    Currently a stub; returns None.  Wire to Better Auth session check
    when direct FastAPI authentication is needed.
    """
    # TODO:  read session cookie / bearer token and look up user in MongoDB
    return None