"""Item schema for Multi-Select domain plugin."""
from typing import ClassVar, List
from pydantic import Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class MultiSelectItemPayload(ItemPayload):
    prompt: str
    options: List[str]
    correct_indices: List[int]
    media: List[MediaRef] = Field(default_factory=list)
    rationale: str
    answer_keys: ClassVar[List[str]] = ["correct_indices", "rationale"]
