"""
Thin proxy server: forwards every `/api/*` request to the Next.js dev
server running on localhost:3000.

NOW — also mounts all modular internal routers (AI, challenges, interviews,
analytics, hackathons, dashboard, certifications, achievements, scanner,
integrations).  Each router lives in its own module under `routers/`.

The CodeSpectra migration moved the entire app to Next.js, which serves
both pages and API routes from port 3000. The Kubernetes ingress in this
preview environment forwards `/api/*` to port 8001, so we proxy through
to keep that contract working transparently.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import Response

from core.dependencies import init_redis_client, _redis_client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

NEXT_ORIGIN = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")

app = FastAPI(title="CodeSpectra API")


@app.on_event("startup")
async def startup_event():
    """Initialize Redis client on startup."""
    global _redis_client
    try:
        _redis_client = await init_redis_client()
        if _redis_client:
            logging.info("Redis client initialized successfully from MongoDB configuration")
        else:
            logging.info("Redis client not configured (will use in-memory fallback)")
    except Exception as e:
        logging.warning(f"Failed to initialize Redis client: {e}")
        _redis_client = None


@app.on_event("shutdown")
async def shutdown_event():
    """Close Redis client on shutdown."""
    global _redis_client
    if _redis_client:
        try:
            await _redis_client.close()
            logging.info("Redis client closed")
        except Exception as e:
            logging.warning(f"Error closing Redis client: {e}")
        finally:
            _redis_client = None

# ── Mount internal routers (modular backend) ───────────────────
# Each router is self-contained in its own module.
# Former monolithic `ai_router.py` has been replaced by `routers/ai.py`.
from routers.ai import router as ai_rtr
from routers.challenges import router as challenges_rtr
from routers.interviews import router as interviews_rtr
from routers.analytics import router as analytics_rtr
from routers.hackathons import router as hackathons_rtr
from routers.dashboard import router as dashboard_rtr
from routers.certifications import router as certifications_rtr
from routers.features import (
    achievement_router,
    integration_router,
    scanner_router,
)
from routers.assessment_platform import router as assessment_platform_rtr
from routers.identity_verify import router as identity_verify_rtr
from routers.item_bank_router import router as item_bank_rtr
from routers.webhooks_router import router as webhooks_rtr
from routers.integrity_router import router as integrity_rtr

app.include_router(ai_rtr)
app.include_router(challenges_rtr)
app.include_router(interviews_rtr)
app.include_router(analytics_rtr)
app.include_router(hackathons_rtr)
app.include_router(dashboard_rtr)
app.include_router(certifications_rtr)
app.include_router(achievement_router)
app.include_router(scanner_router)
app.include_router(integration_router)
app.include_router(assessment_platform_rtr)
app.include_router(identity_verify_rtr)
app.include_router(item_bank_rtr)
app.include_router(webhooks_rtr)
app.include_router(integrity_rtr)

# ── Proxy to Next.js (for all /api/* requests NOT handled above) ──

# Shared async HTTP client (keep-alive pool)
_client = httpx.AsyncClient(timeout=30.0, follow_redirects=False)

# Hop-by-hop headers that must not be forwarded.
HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


async def _forward(request: Request, path: str) -> Response:
    upstream = f"{NEXT_ORIGIN}/{path}"
    if request.url.query:
        upstream = f"{upstream}?{request.url.query}"

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_HEADERS
    }
    # Set a sane forwarded-host so Better Auth + Next.js see the right origin.
    fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if fwd_host:
        headers["x-forwarded-host"] = fwd_host
        headers["host"] = "localhost:3000"

    body = await request.body()

    try:
        upstream_res = await _client.request(
            method=request.method,
            url=upstream,
            headers=headers,
            content=body,
        )
    except httpx.RequestError as e:
        logging.exception("Proxy upstream error")
        return Response(
            content=f'{{"error":"upstream unreachable","detail":"{type(e).__name__}"}}',
            media_type="application/json",
            status_code=502,
        )

    # Strip hop-by-hop response headers
    response_headers = {
        k: v
        for k, v in upstream_res.headers.items()
        if k.lower() not in HOP_HEADERS
    }

    return Response(
        content=upstream_res.content,
        status_code=upstream_res.status_code,
        headers=response_headers,
    )


@app.get("/api/__proxy_health")
async def health() -> dict[str, str]:
    return {"status": "ok", "upstream": NEXT_ORIGIN}


@app.get("/__proxy_health")
async def health_stripped() -> dict[str, str]:
    """Same as /api/__proxy_health but for ingresses that strip /api/."""
    return {"status": "ok", "upstream": NEXT_ORIGIN, "ingress": "strips_api_prefix"}


# Some Kubernetes/Cloudflare ingresses forward `/api/*` to backend port 8001
# WITHOUT the `/api` prefix (path-rewrite). Others keep it. We accept both:
#   • `/api/<path>`  → forward to Next.js as `/api/<path>`
#   • `/<path>`      → forward to Next.js as `/api/<path>` (re-add the prefix)
@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy_api(request: Request, path: str) -> Response:
    return await _forward(request, f"api/{path}")


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy_stripped(request: Request, path: str) -> Response:
    # Skip internal endpoints — they're meant for in-cluster Next.js calls only.
    if path.startswith("internal/"):
        return Response(
            content=b'{"detail":"Not Found"}',
            media_type="application/json",
            status_code=404,
        )
    return await _forward(request, f"api/{path}")