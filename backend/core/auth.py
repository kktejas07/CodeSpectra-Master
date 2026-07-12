"""
Authentication & authorization dependencies.

These mirror the checks that Next.js/Better Auth performs before proxying
to the Python backend. The internal AI router trusts that auth has already
happened at the Next.js layer; these stubs are here for future use when
routes are served directly from FastAPI.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from core.database import get_database


async def require_auth(request: Request):
    """
    Placeholder: verify that the request carries a valid session/token.

    In the current architecture, Next.js / Better Auth authenticates the user
    before proxying to the FastAPI backend, so the internal router endpoints
    intentionally trust the caller.  This stub exists for routes that need
    their own auth (e.g., future admin-only endpoints served directly).

    ponytail: The current architecture trusts the caller because the Kubernetes
    ingress only exposes the proxy (server.py), not the internal router
    directly. If we ever expose FastAPI routes directly, wire in JWT/Session
    validation here.
    """
    # Future: validate bearer token or session cookie
    return True


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