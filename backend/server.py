"""
Thin proxy server: forwards every `/api/*` request to the Next.js dev
server running on localhost:3000.

The CodeSpectra migration moved the entire app to Next.js, which serves
both pages and API routes from port 3000. The Kubernetes ingress in this
preview environment forwards `/api/*` to port 8001, so we proxy through
to keep that contract working transparently.
"""
from fastapi import FastAPI, Request
from fastapi.responses import Response
from dotenv import load_dotenv
import os
import httpx
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

NEXT_ORIGIN = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000")

app = FastAPI(title="CodeSpectra API proxy")

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


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy_api(request: Request, path: str) -> Response:
    return await _forward(request, f"api/{path}")
