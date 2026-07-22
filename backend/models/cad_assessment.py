"""Pydantic schemas for CAD & Engineering Assessment Module (Addendum FR-41 to FR-92).

Supports Tasks T1-T9, Delivery Modes A-D, and 4-Layer Automated Scoring Engine.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CADTaskType(str, Enum):
    PART_MODELLING = "T1_PART_MODELLING"
    ASSEMBLY_AND_MATE = "T2_ASSEMBLY_AND_MATE"
    GDT_AND_DRAWING = "T3_GDT_AND_DRAWING"
    DFM_CRITIQUE = "T4_DFM_CRITIQUE"
    MODEL_REPAIR = "T5_MODEL_REPAIR"
    ENGINEERING_CHANGE_ORDER = "T6_ENGINEERING_CHANGE_ORDER"
    CALCULATION_AND_SIZING = "T7_CALCULATION_AND_SIZING"
    FEA_INTERPRETATION = "T8_FEA_INTERPRETATION"
    DESIGN_RATIONALE_VIVA = "T9_DESIGN_RATIONALE_VIVA"


class CADDeliveryMode(str, Enum):
    MODE_A_CLOUD_CAD = "MODE_A_CLOUD_CAD"
    MODE_B_OWN_LICENSED_CAD = "MODE_B_OWN_LICENSED_CAD"
    MODE_C_VIRTUAL_DESKTOP = "MODE_C_VIRTUAL_DESKTOP"
    MODE_D_HYBRID = "MODE_D_HYBRID"


class Layer1GeometricScore(BaseModel):
    bounding_box_valid: bool = True
    volume_mm3: float = 0.0
    mass_kg: float = 0.0
    center_of_mass: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    moments_of_inertia: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    surface_area_mm2: float = 0.0
    hausdorff_distance_mm: float = 0.0
    min_wall_thickness_mm: float = 0.0
    score: float = 100.0


class Layer2ModellingQualityScore(BaseModel):
    feature_count: int = 0
    tree_depth: int = 0
    fully_defined_sketches_pct: float = 100.0
    dangling_references: int = 0
    rebuild_errors: int = 0
    rebuild_warnings: int = 0
    rebuild_time_ms: int = 0
    score: float = 100.0


class Layer3DrawingGDTScore(BaseModel):
    views_complete: bool = True
    datum_scheme_valid: bool = True
    feature_control_frames_valid: bool = True
    tolerance_appropriateness_score: float = 100.0
    drawing_standard: str = "ISO_1101"  # "ISO_1101" or "ASME_Y14_5"
    unit_system: str = "metric"  # "metric" or "imperial"
    score: float = 100.0


class Layer4SmeReview(BaseModel):
    reviewer_id: Optional[str] = None
    design_intent_rating: float = 100.0
    manufacturability_rating: float = 100.0
    viva_rationale_score: float = 100.0
    ai_narrative_draft: Optional[str] = None
    reviewer_notes: Optional[str] = None
    score: float = 100.0


class CADSubmissionPayload(BaseModel):
    candidate_id: str
    assessment_id: str
    task_type: CADTaskType = CADTaskType.PART_MODELLING
    delivery_mode: CADDeliveryMode = CADDeliveryMode.MODE_B_OWN_LICENSED_CAD
    native_file_name: Optional[str] = None
    step_ap242_file_name: Optional[str] = None
    viva_rationale_text: Optional[str] = None
    drawing_standard: str = "ISO_1101"
    unit_system: str = "metric"
    constraints: List[Dict[str, Any]] = Field(default_factory=list)
    seeded_defects: List[Dict[str, Any]] = Field(default_factory=list)


class CADAssessmentResult(BaseModel):
    submission_id: str
    candidate_id: str
    task_type: CADTaskType
    delivery_mode: CADDeliveryMode
    layer1_geometric: Layer1GeometricScore
    layer2_modelling_quality: Layer2ModellingQualityScore
    layer3_drawing_gdt: Layer3DrawingGDTScore
    layer4_sme_review: Layer4SmeReview
    composite_score: float
    integrity_verified: bool = True
    created_at: str
