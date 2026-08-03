"""Item schema for Video Response domain plugin."""
from typing import ClassVar, List, Literal
from pydantic import Field
from backend.core.contracts.domain import Criterion, ItemPayload


class VideoResponsePayload(ItemPayload):
    prompt: str
    prep_seconds: int = 30
    max_duration_seconds: int = 120
    retakes_allowed: int = 1
    rubric: Literal["cefr", "custom"] = "cefr"
    custom_criteria: List[Criterion] = Field(default_factory=list)
    transcript_required: bool = True
    text_alternative_allowed: bool = True  # accessibility, guardrail 9
    rationale: str
    answer_keys: ClassVar[List[str]] = ["rationale"]
