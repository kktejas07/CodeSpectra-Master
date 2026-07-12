"""Certification routes — real CRUD via CertificationsService."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from services.features import CertificationsService

router = APIRouter(prefix="/internal/certifications", tags=["certifications"])
svc = CertificationsService()


@router.get("")
async def list_certifications() -> Dict[str, Any]:
    data = await svc.list(limit=500)
    return {"ok": True, "data": data, "total": await svc.count()}


@router.get("/{cert_id}")
async def get_certification(cert_id: str) -> Dict[str, Any]:
    doc = await svc.get(cert_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Certification not found")
    return {"ok": True, "data": doc}


@router.post("")
async def start_certification(body: Dict[str, Any]) -> Dict[str, Any]:
    _id = await svc.create(body)
    return {"ok": True, "id": _id}


@router.post("/{cert_id}/submit")
async def submit_certification(cert_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    try:
        result = await svc.submit(cert_id, body)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))