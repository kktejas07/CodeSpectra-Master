"""Interview routes — real CRUD via CRUDBase + MongoDB."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from services.features import InterviewsService

router = APIRouter(prefix="/internal/interviews", tags=["interviews"])
svc = InterviewsService()


@router.get("")
async def list_interviews() -> Dict[str, Any]:
    data = await svc.list(limit=500)
    return {"ok": True, "data": data, "total": await svc.count()}


@router.get("/{interview_id}")
async def get_interview(interview_id: str) -> Dict[str, Any]:
    doc = await svc.get(interview_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Interview not found")
    return {"ok": True, "data": doc}


@router.post("")
async def create_interview(body: Dict[str, Any]) -> Dict[str, Any]:
    _id = await svc.create(body)
    return {"ok": True, "id": _id}


@router.put("/{interview_id}")
async def update_interview(interview_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    doc = await svc.update(interview_id, body)
    if not doc:
        raise HTTPException(status_code=404, detail="Interview not found")
    return {"ok": True, "data": doc}


@router.delete("/{interview_id}")
async def delete_interview(interview_id: str) -> Dict[str, Any]:
    ok = await svc.delete(interview_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Interview not found")
    return {"ok": True}