"""Achievements, scanner, and integration routes — real CRUD."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from services.features import AchievementsService, IntegrationsService, ScannerService

achievement_router = APIRouter(prefix="/internal/achievements", tags=["achievements"])
scanner_router = APIRouter(prefix="/internal/scanner", tags=["scanner"])
integration_router = APIRouter(prefix="/internal/integrations", tags=["integrations"])

ach_svc = AchievementsService()
scan_svc = ScannerService()
int_svc = IntegrationsService()


@achievement_router.get("")
async def list_achievements() -> Dict[str, Any]:
    data = await ach_svc.list(limit=500)
    return {"ok": True, "data": data, "total": await ach_svc.count()}


@scanner_router.get("/scans")
async def list_scans() -> Dict[str, Any]:
    data = await scan_svc.list_scans()
    return {"ok": True, "data": data}


@scanner_router.get("/issues")
async def list_issues() -> Dict[str, Any]:
    data = await scan_svc.list_issues()
    return {"ok": True, "data": data}


@integration_router.get("")
async def list_integrations() -> Dict[str, Any]:
    data = await int_svc.list(limit=500)
    return {"ok": True, "data": data}


@integration_router.post("/github/scan")
async def trigger_github_scan(body: Dict[str, Any]) -> Dict[str, Any]:
    repo = body.get("repo_url", "")
    return await int_svc.trigger_github_scan(repo)