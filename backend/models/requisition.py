"""Workday & Engineering Job Requisition data models."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class RequisitionBase(BaseModel):
    title: str = Field(..., description="Job title, e.g. Mechanical Design Engineer II")
    req_code: str = Field(..., description="Requisition code, e.g. REQ-2026-089")
    discipline: str = Field(..., description="Discipline e.g. Mechanical Design, Manufacturing, Software")
    region: str = Field(..., description="Target region, e.g. NA-EAST, APAC, EMEA")
    experience_band: str = Field(..., description="Band: '0-1 yr', '2-3 yr', '4-6 yr'")
    workday_id: Optional[str] = Field(None, description="Workday Recruiting requisition ID")
    sme_emails: List[str] = Field(default_factory=list, description="Assigned SME reviewer emails")
    hiring_manager_email: Optional[str] = Field(None, description="Hiring manager email")
    pass_threshold: float = Field(70.0, description="Shortlist composite score threshold (percentage)")
    shortlist_rule: str = Field("composite", description="Rule: 'rank', 'threshold', or 'composite'")


class RequisitionCreate(RequisitionBase):
    pass


class RequisitionUpdate(BaseModel):
    title: Optional[str] = None
    discipline: Optional[str] = None
    region: Optional[str] = None
    experience_band: Optional[str] = None
    workday_id: Optional[str] = None
    sme_emails: Optional[List[str]] = None
    hiring_manager_email: Optional[str] = None
    pass_threshold: Optional[float] = None
    shortlist_rule: Optional[str] = None
    status: Optional[str] = None


class Requisition(RequisitionBase):
    id: str
    status: str = Field("active", description="Status: 'draft', 'active', 'closed'")
    created_at: str
    updated_at: str
