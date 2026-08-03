"""Item schema for Rich Text domain plugin."""
from typing import ClassVar, List
from pydantic import BaseModel, Field
from backend.core.contracts.domain import ItemPayload


class RubricCriterionSpec(BaseModel):
    key: str
    label: str
    max_points: float = 5.0
    guidelines: str


class RichTextItemPayload(ItemPayload):
    prompt: str
    rubric_criteria: List[RubricCriterionSpec] = Field(default_factory=list)
    min_word_count: int = 50
    max_word_count: int = 1000
    rationale: str
    answer_keys: ClassVar[List[str]] = ["rationale"]
