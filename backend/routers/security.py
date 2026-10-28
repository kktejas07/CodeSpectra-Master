"""
ClamAV scan endpoint — accepts upload bytes from the Next.js layer and scans
them before anything is persisted. Mounted at `/internal/security/*`.

The Next.js `/api/upload` route posts the raw file bytes here (base64), and the
backend blocks the upload with a 400 if ClamAV flags a virus.

`/scan-stream` takes the raw bytes as the request body (application/octet-stream,
chunked) and relays them to clamd as they arrive — used for large direct
uploads (lib/storage/scan.ts streams the S3 object here), so any size up to
SCAN_STREAM_MAX_BYTES is scanned with bounded memory.
"""
from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from core.auth import require_auth, require_internal_secret
from services.security_scanner import scan_file_for_viruses, scan_stream_for_viruses

router = APIRouter(
    prefix="/internal/security",
    tags=["security-upload-scan"],
    dependencies=[Depends(require_internal_secret)],
)


class ScanReq(BaseModel):
    """Base64-encoded file bytes to scan. Bounded at 6MB so a single request
    can never overload clamd (the upload route already caps images at 5MB)."""
    # 6 MB of raw bytes is ~8 MB of base64 (4/3 expansion).
    file_base64: str = Field(min_length=1, max_length=8 * 1024 * 1024)
    filename: str = Field(default="")


class ScanResp(BaseModel):
    clean: bool
    scanned_bytes: int


@router.post("/scan", response_model=ScanResp)
async def scan_upload(
    request: Request,
    body: ScanReq,
    auth=Depends(require_auth),
):
    # ponytail: decode failures and scanner-offline both surface as 4xx/502 to
    # the uploader; we never swallow a FOUND into a generic 500.
    try:
        file_bytes = base64.b64decode(body.file_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Malformed base64 payload.")

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty file.")

    scan_file_for_viruses(file_bytes)

    return {"clean": True, "scanned_bytes": len(file_bytes)}

@router.post("/scan-stream", response_model=ScanResp)
async def scan_upload_stream(
    request: Request,
    auth=Depends(require_auth),
):
    """Raw-body streaming scan. 400 infected, 413 too large, 502 scanner offline."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit():
        from services import security_scanner as sc
        if int(declared) > sc.SCAN_STREAM_MAX_BYTES:
            raise HTTPException(status_code=413, detail="File is larger than the scanner accepts.")
    scanned = await scan_stream_for_viruses(request.stream())
    return {"clean": True, "scanned_bytes": scanned}
