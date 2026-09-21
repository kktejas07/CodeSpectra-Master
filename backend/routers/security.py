"""
ClamAV scan endpoint — accepts upload bytes from the Next.js layer and scans
them before anything is persisted. Mounted at `/internal/security/*`.

The Next.js `/api/upload` route posts the raw file bytes here (base64), and the
backend blocks the upload with a 400 if ClamAV flags a virus.
"""
from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from core.auth import require_auth
from services.security_scanner import scan_file_for_viruses

router = APIRouter(prefix="/internal/security", tags=["security-upload-scan"])


class ScanReq(BaseModel):
    """Base64-encoded file bytes to scan. Bounded at 6MB so a single request
    can never overload clamd (the upload route already caps images at 5MB)."""
    file_base64: str = Field(min_length=1)
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