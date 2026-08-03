"""Item payload schema for CAD STEP domain plugin."""
from typing import ClassVar, List, Optional
from pydantic import BaseModel, Field
from backend.core.contracts.domain import ItemPayload


class CadConstraint(BaseModel):
    name: str
    target_value: float
    tolerance: float = 0.05
    unit: str = "mm"


class CadStepItemPayload(ItemPayload):
    prompt: str
    cad_brief: str
    constraints: List[CadConstraint] = Field(default_factory=list)
    reference_file_url: Optional[str] = None
    viva_required: bool = True
    region_standard: str = "ISO"
    unit_system: str = "metric"
    answer_keys: ClassVar[List[str]] = ["reference_file_url", "constraints"]
