"""Item schema for Numeric Response domain plugin."""
from typing import ClassVar, List, Literal, Optional, Tuple
from pydantic import Field
from backend.core.contracts.domain import ItemPayload
from backend.domains._common.media import MediaRef


class NumericResponsePayload(ItemPayload):
    prompt: str
    media: List[MediaRef] = Field(default_factory=list)
    unit: str  # required, e.g. "mm", "kN", "Cpk"
    expected_value: float
    tolerance_mode: Literal["abs", "rel", "pct"] = "abs"
    tolerance: float = 0.01
    accept_range: Optional[Tuple[float, float]] = None  # overrides tolerance if set
    sig_figs: Optional[int] = None
    show_unit_hint: bool = True
    rationale: str  # reviewer-facing, required
    answer_keys: ClassVar[List[str]] = ["expected_value", "accept_range", "rationale"]
