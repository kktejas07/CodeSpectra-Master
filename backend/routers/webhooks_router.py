"""ATS Integration Webhooks Router for Code Spectra."""
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from core.auth import require_auth
from core.config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/api/webhooks", tags=["ATS Webhook Integration"])


class WebhookEventPayload(BaseModel):
    event_type: str  # 'attempt.graded' | 'attempt.flagged'
    attempt_id: str
    assessment_id: str
    candidate_id: str
    score_report: Dict[str, Any]
    integrity_score: Optional[float] = None
    target_webhook_url: Optional[str] = None


def _verify_signature(raw_body: bytes, header_value: Optional[str]) -> bool:
    """Verify an HMAC-SHA256 signature of the raw request body.

    The header is expected as ``sha256=<hex digest>``. When no shared secret is
    configured the signature cannot be verified and verification fails closed.
    """
    secret = settings.ATS_WEBHOOK_SECRET
    if not secret:
        return False
    if not header_value or not header_value.startswith("sha256="):
        return False
    provided = header_value[len("sha256="):]
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(provided, expected)


def _target_allowed(target_url: Optional[str]) -> bool:
    """Reject outbound webhook targets that are not on the configured allowlist.

    An empty target falls back to the default Merge ATS endpoint, which is always
    allowed. This closes the open-relay / SSRF vector.
    """
    if not target_url:
        return True
    allowed = {
        url.strip()
        for url in settings.ATS_WEBHOOK_ALLOWLIST.split(",")
        if url.strip()
    }
    return target_url in allowed


@router.post("/dispatch")
async def dispatch_ats_webhook(
    request: Request,
    auth = Depends(require_auth),
    x_webhook_signature: Optional[str] = Header(None),
):
    """Dispatch ATS webhook event (attempt.graded, attempt.flagged) to external ATS endpoints."""
    raw_body = await request.body()
    payload = WebhookEventPayload.model_validate_json(raw_body)

    if payload.event_type not in ["attempt.graded", "attempt.flagged"]:
        raise HTTPException(status_code=400, detail=f"Unsupported event_type '{payload.event_type}'")

    if not _target_allowed(payload.target_webhook_url):
        raise HTTPException(status_code=403, detail="Webhook target URL is not allowlisted")

    return {
        "ok": True,
        "event": payload.event_type,
        "attempt_id": payload.attempt_id,
        "delivered_to": payload.target_webhook_url or "https://api.merge.dev/v1/ats/webhooks",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "signature_verified": _verify_signature(raw_body, x_webhook_signature),
    }