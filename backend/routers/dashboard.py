"""Dashboard and settings routes — real CRUD via DashboardService."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from services.features import DashboardService

router = APIRouter(prefix="/internal/dashboard", tags=["dashboard"])
svc = DashboardService()


@router.get("/stats")
async def dashboard_stats() -> Dict[str, Any]:
    data = await svc.stats()
    return {"ok": True, "data": data}


@router.get("/activity")
async def recent_activity() -> Dict[str, Any]:
    data = await svc.activity()
    return {"ok": True, "data": data}


@router.get("/settings")
async def get_settings() -> Dict[str, Any]:
    data = await svc.list(limit=100)
    return {"ok": True, "data": data}


@router.put("/settings")
async def update_settings(body: Dict[str, Any]) -> Dict[str, Any]:
    upserted = await svc.create(body)
    return {"ok": True, "id": upserted}