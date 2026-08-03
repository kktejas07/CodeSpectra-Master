"""Item schema for Hotspot domain plugin."""
from typing import ClassVar, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class Region(BaseModel):
    label: str
    points: List[Tuple[float, float]]  # normalized 0..1 polygon coordinates [(x, y)]


class HotspotItemPayload(ItemPayload):
    prompt: str
    image: MediaRef
    mode: Literal["single", "multi", "count"] = "single"
    regions: List[Region]
    distractor_penalty: bool = True
    max_clicks: Optional[int] = None
    rationale: str
    answer_keys: ClassVar[List[str]] = ["regions", "rationale"]
