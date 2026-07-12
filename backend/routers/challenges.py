"""Challenge routes — real CRUD via CRUDBase + MongoDB."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from services.features import ChallengesService

router = APIRouter(prefix="/internal/challenges", tags=["challenges"])
svc = ChallengesService()


@router.get("")
async def list_challenges() -> Dict[str, Any]:
    data = await svc.list(limit=500)
    total = await svc.count()
    return {"ok": True, "data": data, "total": total}


@router.get("/{challenge_id}")
async def get_challenge(challenge_id: str) -> Dict[str, Any]:
    doc = await svc.get(challenge_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return {"ok": True, "data": doc}


@router.post("")
async def create_challenge(body: Dict[str, Any]) -> Dict[str, Any]:
    _id = await svc.create(body)
    return {"ok": True, "id": _id}


@router.put("/{challenge_id}")
async def update_challenge(challenge_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    doc = await svc.update(challenge_id, body)
    if not doc:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return {"ok": True, "data": doc}


@router.delete("/{challenge_id}")
async def delete_challenge(challenge_id: str) -> Dict[str, Any]:
    ok = await svc.delete(challenge_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return {"ok": True}