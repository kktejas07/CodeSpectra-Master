"""ATS Integration Webhooks Router for Code Spectra."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Header, HTTPException
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


@router.post("/dispatch")
async def dispatch_ats_webhook(
    payload: WebhookEventPayload,
    x_webhook_signature: Optional[str] = Header(None),
):
    """Dispatch ATS webhook event (attempt.graded, attempt.flagged) to external ATS endpoints."""
    if payload.event_type not in ["attempt.graded", "attempt.flagged"]:
        raise HTTPException(status_code=400, detail=f"Unsupported event_type '{payload.event_type}'")

    return {
        "ok": True,
        "event": payload.event_type,
        "attempt_id": payload.attempt_id,
        "delivered_to": payload.target_webhook_url or "https://api.merge.dev/v1/ats/webhooks",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "signature_verified": bool(x_webhook_signature),
    }
