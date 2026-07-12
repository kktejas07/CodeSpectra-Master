"""Hackathon routes — real CRUD + sub-resources via services."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from services.features import HackathonsService

router = APIRouter(prefix="/internal/hackathons", tags=["hackathons"])
svc = HackathonsService()


@router.get("")
async def list_hackathons() -> Dict[str, Any]:
    data = await svc.list(limit=500)
    return {"ok": True, "data": data, "total": await svc.count()}


@router.get("/{hackathon_id}")
async def get_hackathon(hackathon_id: str) -> Dict[str, Any]:
    doc = await svc.get(hackathon_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Hackathon not found")
    return {"ok": True, "data": doc}


@router.post("")
async def create_hackathon(body: Dict[str, Any]) -> Dict[str, Any]:
    _id = await svc.create(body)
    return {"ok": True, "id": _id}


@router.put("/{hackathon_id}")
async def update_hackathon(hackathon_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    doc = await svc.update(hackathon_id, body)
    if not doc:
        raise HTTPException(status_code=404, detail="Hackathon not found")
    return {"ok": True, "data": doc}


@router.delete("/{hackathon_id}")
async def delete_hackathon(hackathon_id: str) -> Dict[str, Any]:
    ok = await svc.delete(hackathon_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Hackathon not found")
    return {"ok": True}


@router.get("/{hackathon_id}/teams")
async def list_teams(hackathon_id: str) -> Dict[str, Any]:
    teams = await svc.list_teams(hackathon_id)
    return {"ok": True, "data": teams, "total": len(teams)}


@router.get("/{hackathon_id}/submissions")
async def list_submissions(hackathon_id: str) -> Dict[str, Any]:
    subs = await svc.list_submissions(hackathon_id)
    return {"ok": True, "data": subs, "total": len(subs)}