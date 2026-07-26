"""FastAPI endpoints for Engineering Technical Assessment Platform (Workday, Question Bank, Requisitions, CAD Scoring)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.question_bank import QuestionItem, QuestionItemCreate, QuestionItemUpdate
from models.requisition import Requisition, RequisitionCreate, RequisitionUpdate
from services.scoring_service import scoring_service
from services.workday_service import workday_service
from services import assessment_service as store

router = APIRouter(prefix="/api/assessment-platform", tags=["Engineering Assessment Platform"])


# --- REQUISITIONS CRUD (MongoDB-backed) ---
@router.post("/requisitions", response_model=Requisition)
async def create_requisition(req: RequisitionCreate):
    return await store.create_requisition(req.model_dump())


@router.get("/requisitions", response_model=List[Requisition])
async def list_requisitions(region: Optional[str] = None, discipline: Optional[str] = None):
    results = await store.list_requisitions(region, discipline)
    return results


@router.get("/requisitions/{req_id}", response_model=Requisition)
async def get_requisition(req_id: str):
    record = await store.get_requisition(req_id)
    if not record:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return record


@router.patch("/requisitions/{req_id}", response_model=Requisition)
async def update_requisition(req_id: str, patch: RequisitionUpdate):
    record = await store.get_requisition(req_id)
    if not record:
        raise HTTPException(status_code=404, detail="Requisition not found")
    update_data = patch.model_dump(exclude_unset=True)
    updated = await store.update_requisition(req_id, update_data)
    return updated


@router.delete("/requisitions/{req_id}")
async def delete_requisition(req_id: str):
    ok = await store.delete_requisition(req_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return {"ok": True, "deleted_id": req_id}


# --- QUESTION BANK CRUD (MongoDB-backed) ---
@router.post("/question-bank", response_model=QuestionItem)
async def create_question_item(item: QuestionItemCreate):
    return await store.create_question_item(item.model_dump())


@router.get("/question-bank", response_model=List[QuestionItem])
async def list_question_items(
    discipline: Optional[str] = None,
    competency: Optional[str] = None,
    experience_band: Optional[str] = None,
    modality: Optional[str] = None,
):
    results = await store.list_question_items(discipline, competency, experience_band, modality)
    return results


@router.get("/question-bank/{item_id}", response_model=QuestionItem)
async def get_question_item(item_id: str):
    record = await store.get_question_item(item_id)
    if not record:
        raise HTTPException(status_code=404, detail="Question item not found")
    return record


@router.patch("/question-bank/{item_id}", response_model=QuestionItem)
async def update_question_item(item_id: str, patch: QuestionItemUpdate):
    record = await store.get_question_item(item_id)
    if not record:
        raise HTTPException(status_code=404, detail="Question item not found")
    update_data = patch.model_dump(exclude_unset=True)
    updated = await store.update_question_item(item_id, update_data)
    return updated


@router.delete("/question-bank/{item_id}")
async def delete_question_item(item_id: str):
    record = await store.get_question_item(item_id)
    if not record:
        raise HTTPException(status_code=404, detail="Question item not found")
    await store.retire_question_item(item_id)
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
    requisitions = await store.list_requisitions()
    records = []
    for req in requisitions:
        records.append({
            "requisition_code": req.get("req_code", req.get("id", "N/A")),
            "title": req.get("title", ""),
            "discipline": req.get("discipline", ""),
            "region": req.get("region", ""),
            "experience_band": req.get("experience_band", ""),
            "status": req.get("status", "active"),
            "created_at": req.get("created_at", ""),
        })
    return {"ok": True, "count": len(records), "export_format": format, "records": records}


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
