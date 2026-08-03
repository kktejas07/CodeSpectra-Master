"""Item schema for Matching domain plugin."""
from typing import ClassVar, Dict, List
from pydantic import Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class MatchingItemPayload(ItemPayload):
    prompt: str
    left_items: List[str]
    right_items: List[str]
    expected_matches: Dict[str, str]  # { left_item: right_item }
    media: List[MediaRef] = Field(default_factory=list)
    rationale: str
    answer_keys: ClassVar[List[str]] = ["expected_matches", "rationale"]
