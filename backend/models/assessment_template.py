"""Assessment Template & Composite Scoring data models."""
from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ModalityWeight(BaseModel):
    modality: str = Field(..., description="'cad', 'qna', 'code', 'english', 'psychometric', 'written'")
    weight_percentage: float = Field(..., description="Weighting in composite score e.g. 40.0")


class AssessmentTemplateBase(BaseModel):
    name: str = Field(..., description="Template name, e.g. Mechanical Design 2-3 Yr Assessment")
    requisition_id: Optional[str] = Field(None, description="Associated job requisition ID")
    discipline: str = Field(..., description="Discipline")
    experience_band: str = Field(..., description="Target band: '0-1 yr', '2-3 yr', '4-6 yr'")
    duration_minutes: int = Field(90, description="Ceiling duration for complete assessment")
    modality_weights: List[ModalityWeight] = Field(
        default_factory=lambda: [
            ModalityWeight(modality="cad", weight_percentage=40.0),
            ModalityWeight(modality="qna", weight_percentage=25.0),
            ModalityWeight(modality="written", weight_percentage=15.0),
            ModalityWeight(modality="psychometric", weight_percentage=10.0),
            ModalityWeight(modality="english", weight_percentage=10.0),
        ]
    )
    easy_count: int = Field(3, description="Number of easy items")
    medium_count: int = Field(5, description="Number of medium items")
    hard_count: int = Field(2, description="Number of hard items")
    proctoring_level: str = Field("ai_flagged", description="'none', 'focus_only', 'ai_flagged', 'strict_lockdown'")


class AssessmentTemplateCreate(AssessmentTemplateBase):
    pass


class AssessmentTemplate(AssessmentTemplateBase):
    id: str
    created_at: str
    updated_at: str
