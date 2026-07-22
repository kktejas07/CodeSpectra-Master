"""Question Bank & Competency Tagging data models for Engineering & Manufacturing assessments."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CADConstraint(BaseModel):
    name: str = Field(..., description="Constraint name, e.g. Outer Diameter")
    target_value: float = Field(..., description="Target value in mm or kg")
    tolerance: float = Field(0.05, description="Allowed tolerance +/- percentage or unit")
    unit: str = Field("mm", description="Unit e.g. mm, kg, deg")


class QuestionItemBase(BaseModel):
    title: str = Field(..., description="Item title")
    discipline: str = Field(..., description="Discipline e.g. Mechanical Design, Manufacturing, CAD")
    competency: str = Field(..., description="Competency tag e.g. GD&T, FEA, Tolerance Analysis, Mass Properties")
    experience_band: str = Field(..., description="Experience band: '0-1 yr', '2-3 yr', '4-6 yr'")
    difficulty: str = Field("medium", description="'easy' (weight 3), 'medium' (weight 4), 'hard' (weight 5)")
    difficulty_points: int = Field(4, description="Point weighting for difficulty (easy:3, medium:4, hard:5)")
    modality: str = Field(..., description="Modality: 'cad', 'qna', 'written', 'code', 'english', 'psychometric'")
    expected_duration_mins: int = Field(15, description="Estimated duration in minutes")
    prompt: str = Field(..., description="Question or task prompt")
    
    # CAD-specific fields
    cad_brief: Optional[str] = Field(None, description="Detailed CAD design task brief")
    cad_constraints: List[CADConstraint] = Field(default_factory=list, description="CAD quantitative checks")
    cad_reference_file_url: Optional[str] = Field(None, description="Reference model or starter file URL")
    
    # Written & QnA fields
    rubric_guidelines: Optional[str] = Field(None, description="SME evaluation rubric with anchor examples")
    mcq_options: Optional[List[str]] = Field(None, description="Options for objective Q&A")
    correct_option_index: Optional[int] = Field(None, description="Correct option index for objective Q&A")


class QuestionItemCreate(QuestionItemBase):
    pass


class QuestionItemUpdate(BaseModel):
    title: Optional[str] = None
    discipline: Optional[str] = None
    competency: Optional[str] = None
    experience_band: Optional[str] = None
    difficulty: Optional[str] = None
    difficulty_points: Optional[int] = None
    modality: Optional[str] = None
    expected_duration_mins: Optional[int] = None
    prompt: Optional[str] = None
    cad_brief: Optional[str] = None
    cad_constraints: Optional[List[CADConstraint]] = None
    cad_reference_file_url: Optional[str] = None
    rubric_guidelines: Optional[str] = None
    mcq_options: Optional[List[str]] = None
    correct_option_index: Optional[int] = None
    is_active: Optional[bool] = None


class QuestionItem(QuestionItemBase):
    id: str
    version: int = Field(1, description="Item version number")
    is_active: bool = Field(True, description="Active status in item bank")
    created_at: str
    updated_at: str
