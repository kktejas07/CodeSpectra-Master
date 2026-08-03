"""Integrity pipeline router: Snapshot Replay & Cohort Similarity Check (Section 9 of Spec)."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/integrity", tags=["Integrity & Proctored Telemetry"])

# In-memory store for candidate workspace snapshots & integrity signals
_SNAPSHOT_STORE: Dict[str, List[Dict[str, Any]]] = {}
_INTEGRITY_SIGNALS: Dict[str, List[Dict[str, Any]]] = {}


class WorkspaceSnapshotPayload(BaseModel):
    attempt_id: str
    item_position: int
    content: str
    trigger: str = "autosave"  # 'autosave' | 'run' | 'submit' | 'paste'
    client_timestamp: Optional[str] = None


@router.post("/snapshots")
async def record_workspace_snapshot(payload: WorkspaceSnapshotPayload):
    """Record candidate workspace snapshot for timeline scrubbing & paste jump detection (Section 9.1)."""
    attempt_id = payload.attempt_id
    if attempt_id not in _SNAPSHOT_STORE:
        _SNAPSHOT_STORE[attempt_id] = []

    history = _SNAPSHOT_STORE[attempt_id]
    prev_len = len(history[-1]["content"]) if history else 0
    curr_len = len(payload.content)
    diff_len = curr_len - prev_len

    # Detect sudden large paste jump (>50 characters in one autosave/tick)
    is_paste_burst = diff_len > 50 and payload.trigger in ["autosave", "paste"]

    snapshot_entry = {
        "snapshot_id": f"snap-{len(history)+1}",
        "item_position": payload.item_position,
        "content": payload.content,
        "content_length": curr_len,
        "char_delta": diff_len,
        "trigger": payload.trigger,
        "is_paste_burst": is_paste_burst,
        "recorded_at": payload.client_timestamp or datetime.now(timezone.utc).isoformat(),
    }
    history.append(snapshot_entry)

    if is_paste_burst:
        if attempt_id not in _INTEGRITY_SIGNALS:
            _INTEGRITY_SIGNALS[attempt_id] = []
        _INTEGRITY_SIGNALS[attempt_id].append({
            "kind": "paste_burst",
            "severity": min(1.0, diff_len / 500.0),
            "at": snapshot_entry["recorded_at"],
            "detail": {"char_delta": diff_len, "position": payload.item_position},
        })

    return {"ok": True, "snapshot_id": snapshot_entry["snapshot_id"], "is_paste_burst": is_paste_burst}


@router.get("/attempts/{attempt_id}/timeline")
async def get_attempt_timeline(attempt_id: str):
    """Retrieve candidate workspace snapshot timeline scrub history for reviewer (Section 9.1)."""
    snapshots = _SNAPSHOT_STORE.get(attempt_id, [])
    signals = _INTEGRITY_SIGNALS.get(attempt_id, [])
    return {
        "ok": True,
        "attempt_id": attempt_id,
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
        "integrity_signals": signals,
    }


class SimilarityCheckPayload(BaseModel):
    item_id: str
    target_attempt_id: str
    target_submission: str
    cohort_submissions: List[Dict[str, str]]  # [{'attempt_id': '...', 'submission': '...'}]


@router.post("/similarity-check")
async def check_cohort_similarity(payload: SimilarityCheckPayload):
    """Run similarity check across cohort submissions for an item (Section 9.2)."""
    from difflib import SequenceMatcher

    matched_attempts = []
    target_code = payload.target_submission.strip()

    for item in payload.cohort_submissions:
        other_attempt_id = item["attempt_id"]
        if other_attempt_id == payload.target_attempt_id:
            continue
        other_code = item["submission"].strip()
        similarity_ratio = SequenceMatcher(None, target_code, other_code).ratio()

        if similarity_ratio >= 0.75:  # High similarity threshold
            matched_attempts.append({
                "attempt_id": other_attempt_id,
                "similarity_ratio": round(similarity_ratio, 3),
            })

    # Log similarity signal if matched
    if matched_attempts:
        if payload.target_attempt_id not in _INTEGRITY_SIGNALS:
            _INTEGRITY_SIGNALS[payload.target_attempt_id] = []
        _INTEGRITY_SIGNALS[payload.target_attempt_id].append({
            "kind": "similarity",
            "severity": max(m["similarity_ratio"] for m in matched_attempts),
            "at": datetime.now(timezone.utc).isoformat(),
            "detail": {"matched_attempts": matched_attempts},
        })

    return {
        "ok": True,
        "item_id": payload.item_id,
        "target_attempt_id": payload.target_attempt_id,
        "similarity_detected": len(matched_attempts) > 0,
        "matches": matched_attempts,
    }
