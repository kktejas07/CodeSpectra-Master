"""Item schema for MCQ domain plugin."""
from typing import ClassVar, List, Optional
from pydantic import Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class McqItemPayload(ItemPayload):
    prompt: str
    options: List[str]
    correct_option_index: int
    media: List[MediaRef] = Field(default_factory=list)
    rationale: str
    answer_keys: ClassVar[List[str]] = ["correct_option_index", "rationale"]
