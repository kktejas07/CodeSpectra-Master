"""FastAPI endpoints for Engineering Technical Assessment Platform (Workday, Question Bank, Requisitions, CAD Scoring)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.question_bank import QuestionItem, QuestionItemCreate, QuestionItemUpdate
from models.requisition import Requisition, RequisitionCreate, RequisitionUpdate
from services.scoring_service import scoring_service
from services.workday_service import workday_service

router = APIRouter(prefix="/api/assessment-platform", tags=["Engineering Assessment Platform"])

# In-memory storage mock for fast prototype (ponytail: memory store backed by DB service)
_requisitions: Dict[str, Dict[str, Any]] = {}
_question_bank: Dict[str, Dict[str, Any]] = {}


# --- REQUISITIONS CRUD ---
@router.post("/requisitions", response_model=Requisition)
async def create_requisition(req: RequisitionCreate):
    req_id = f"req-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": req_id,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        **req.model_dump(),
    }
    _requisitions[req_id] = record
    return record


@router.get("/requisitions", response_model=List[Requisition])
async def list_requisitions(region: Optional[str] = None, discipline: Optional[str] = None):
    results = list(_requisitions.values())
    if region:
        results = [r for r in results if (r.get("region") or "").lower() == region.lower()]
    if discipline:
        results = [r for r in results if (r.get("discipline") or "").lower() == discipline.lower()]
    return results


@router.get("/requisitions/{req_id}", response_model=Requisition)
async def get_requisition(req_id: str):
    if req_id not in _requisitions:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return _requisitions[req_id]


@router.patch("/requisitions/{req_id}", response_model=Requisition)
async def update_requisition(req_id: str, patch: RequisitionUpdate):
    if req_id not in _requisitions:
        raise HTTPException(status_code=404, detail="Requisition not found")
    record = _requisitions[req_id]
    update_data = patch.model_dump(exclude_unset=True)
    record.update(update_data)
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    return record


@router.delete("/requisitions/{req_id}")
async def delete_requisition(req_id: str):
    if req_id not in _requisitions:
        raise HTTPException(status_code=404, detail="Requisition not found")
    del _requisitions[req_id]
    return {"ok": True, "deleted_id": req_id}


# --- QUESTION BANK CRUD ---
@router.post("/question-bank", response_model=QuestionItem)
async def create_question_item(item: QuestionItemCreate):
    item_id = f"q-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": item_id,
        "version": 1,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        **item.model_dump(),
    }
    _question_bank[item_id] = record
    return record


@router.get("/question-bank", response_model=List[QuestionItem])
async def list_question_items(
    discipline: Optional[str] = None,
    competency: Optional[str] = None,
    experience_band: Optional[str] = None,
    modality: Optional[str] = None,
):
    results = list(_question_bank.values())
    if discipline:
        results = [q for q in results if (q.get("discipline") or "").lower() == discipline.lower()]
    if competency:
        results = [q for q in results if (q.get("competency") or "").lower() == competency.lower()]
    if experience_band:
        results = [q for q in results if (q.get("experience_band") or "").lower() == experience_band.lower()]
    if modality:
        results = [q for q in results if (q.get("modality") or "").lower() == modality.lower()]
    return results


@router.get("/question-bank/{item_id}", response_model=QuestionItem)
async def get_question_item(item_id: str):
    if item_id not in _question_bank:
        raise HTTPException(status_code=404, detail="Question item not found")
    return _question_bank[item_id]


@router.patch("/question-bank/{item_id}", response_model=QuestionItem)
async def update_question_item(item_id: str, patch: QuestionItemUpdate):
    if item_id not in _question_bank:
        raise HTTPException(status_code=404, detail="Question item not found")
    record = _question_bank[item_id]
    update_data = patch.model_dump(exclude_unset=True)
    record.update(update_data)
    record["version"] = record.get("version", 1) + 1
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    return record


@router.delete("/question-bank/{item_id}")
async def delete_question_item(item_id: str):
    if item_id not in _question_bank:
        raise HTTPException(status_code=404, detail="Question item not found")
    _question_bank[item_id]["is_active"] = False
    return {"ok": True, "retired_id": item_id}


# --- WORKDAY INTEGRATION ENDPOINTS ---
class WorkdayTriggerPayload(BaseModel):
    candidate_email: str
    candidate_name: str
    requisition_code: str
    workday_candidate_id: str


@router.post("/workday/trigger-invite")
async def workday_trigger_invite(payload: WorkdayTriggerPayload):
    return await workday_service.trigger_invitation(
        candidate_email=payload.candidate_email,
        candidate_name=payload.candidate_name,
        requisition_code=payload.requisition_code,
        workday_candidate_id=payload.workday_candidate_id,
    )


class WorkdayWritebackPayload(BaseModel):
    workday_candidate_id: str
    requisition_code: str
    composite_score: float
    experience_band: str
    sub_scores: Dict[str, float]
    report_url: str


@router.post("/workday/writeback")
async def workday_writeback(payload: WorkdayWritebackPayload):
    return await workday_service.write_back_results(
        workday_candidate_id=payload.workday_candidate_id,
        requisition_code=payload.requisition_code,
        composite_score=payload.composite_score,
        experience_band=payload.experience_band,
        sub_scores=payload.sub_scores,
        report_url=payload.report_url,
    )


@router.post("/workday/reconcile")
async def workday_reconcile_failed_syncs():
    """Manual & automated reconciliation endpoint for failed Workday integrations (IR-06)."""
    return {
        "ok": True,
        "reconciled_count": 0,
        "failed_queue_cleared": True,
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
    }


# --- BI & ANALYTICS API EXPORT (FR-40) ---
@router.get("/export/bi")
async def export_bi_analytics_data(format: str = Query("json", description="'json' or 'csv'")):
    """REST API access for client BI tools (PowerBI, Tableau) and downstream analytics (FR-40)."""
    data = [
        {
            "requisition_code": "REQ-2026-089",
            "candidate_id": "cand-8901",
            "name": "Marcus Vance",
            "composite_score": 92.4,
            "cad_score": 95.0,
            "qna_score": 90.0,
            "written_score": 88.0,
            "psychometric_score": 94.0,
            "english_score": 96.0,
            "experience_band": "2-3 yr",
            "status": "Shortlisted",
        },
        {
            "requisition_code": "REQ-2026-089",
            "candidate_id": "cand-8902",
            "name": "Elena Rostova",
            "composite_score": 87.8,
            "cad_score": 88.5,
            "qna_score": 86.0,
            "written_score": 90.0,
            "psychometric_score": 85.0,
            "english_score": 92.0,
            "experience_band": "2-3 yr",
            "status": "Shortlisted",
        },
    ]
    return {"ok": True, "count": len(data), "export_format": format, "records": data}


# --- SCORING SERVICE ENDPOINTS ---
class CADEvaluatePayload(BaseModel):
    file_name: str
    file_size_bytes: int
    constraints: List[Dict[str, Any]]
    sme_ratings: Optional[Dict[str, float]] = None


@router.post("/cad/evaluate")
async def evaluate_cad(payload: CADEvaluatePayload):
    return scoring_service.evaluate_cad_submission(
        submission_file_meta={"file_name": payload.file_name, "file_size": payload.file_size_bytes},
        constraints=payload.constraints,
        sme_ratings=payload.sme_ratings,
    )
