"""Item schema for Table Fill domain plugin."""
from typing import Any, ClassVar, Dict, List, Literal
from pydantic import BaseModel, Field
from backend.core.contracts.domain import ItemPayload


class ColumnSpec(BaseModel):
    key: str
    label: str
    data_type: Literal["text", "numeric"] = "numeric"
    tolerance: float = 0.01
    tolerance_mode: Literal["abs", "rel", "pct"] = "abs"


class TableFillItemPayload(ItemPayload):
    prompt: str
    columns: List[ColumnSpec]
    expected_rows: List[Dict[str, Any]]
    rationale: str
    answer_keys: ClassVar[List[str]] = ["expected_rows", "rationale"]
