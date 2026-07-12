"""Analytics routes — aggregation queries across collections."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from services.features import AnalyticsService

router = APIRouter(prefix="/internal/analytics", tags=["analytics"])
svc = AnalyticsService()


@router.get("/dashboard")
async def dashboard_stats() -> Dict[str, Any]:
    data = await svc.dashboard_stats()
    return {"ok": True, "data": data}


@router.get("/skills")
async def skill_analytics() -> Dict[str, Any]:
    data = await svc.skill_analytics()
    return {"ok": True, "data": data}


@router.get("/web-vitals")
async def web_vitals() -> Dict[str, Any]:
    data = await svc.web_vitals()
    return {"ok": True, "data": data}