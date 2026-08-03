"""Item schema for Ordering domain plugin."""
from typing import ClassVar, List
from pydantic import Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class OrderingItemPayload(ItemPayload):
    prompt: str
    items: List[str]  # items in arbitrary display order
    expected_order: List[str]  # correct sequence
    media: List[MediaRef] = Field(default_factory=list)
    rationale: str
    answer_keys: ClassVar[List[str]] = ["expected_order", "rationale"]
