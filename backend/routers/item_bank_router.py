"""FastAPI router for item bank authoring — live endpoint: cad-step generation."""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from core.database import get_database

router = APIRouter(prefix="/api/item-bank", tags=["Item Bank & Authoring"])

# Dedicated collection for authored items (sibling convention: docs keyed by
# "id"). Kept separate from the
# frontend-owned `question_bank` collection so authoring drafts can never
# corrupt live bank reads.
COLL_ITEM_BANK = "item_bank_items"


class GenerateCadItemReq(BaseModel):
    title: str = "CAD Part Modeling Challenge"
    prompt: str
    region_standard: str = "ISO"
    unit_system: str = "metric"
    viva_required: bool = True
    points: float = 100.0


@router.post("/cad-step/generate")
async def generate_cad_step_item(req: GenerateCadItemReq):
    """Generate a cad_step item payload from text prompt and stage as draft item."""
    from backend.domains.cad_step.generator import generate_cad_step_payload_from_prompt

    payload = generate_cad_step_payload_from_prompt(
        prompt=req.prompt,
        region_standard=req.region_standard,
        unit_system=req.unit_system,
        viva_required=req.viva_required,
    )

    item = {
        "id": f"item-cad-{abs(hash(req.prompt)) % 10**6}",
        "domain_key": "cad_step",
        "title": req.title,
        "status": "draft",
        "points": req.points,
        "skill_tags": ["mech.gdt.feature_control_frame"],
        "payload": payload,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Persist the staged draft (upsert by id so regenerating the same prompt
    # updates rather than duplicates). "Save to item bank" must actually save.
    # Persistence failure must not torch a good generation — report honestly.
    persisted = True
    persist_error: Optional[str] = None
    try:
        db = await get_database()
        await db[COLL_ITEM_BANK].update_one(
            {"id": item["id"]}, {"$set": item}, upsert=True
        )
    except Exception as exc:  # noqa: BLE001 — surfacing, not swallowing
        logging.exception("item_bank: failed to persist cad draft %s", item["id"])
        persisted = False
        persist_error = str(exc)[:200]

    return {
        "ok": True,
        "item": item,
        "persisted": persisted,
        **({"persist_error": persist_error} if persist_error else {}),
    }

