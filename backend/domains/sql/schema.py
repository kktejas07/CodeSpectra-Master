"""Item payload schema for SQL domain plugin."""
from typing import ClassVar, List
from pydantic import Field
from backend.core.contracts.domain import ItemPayload


class SqlItemPayload(ItemPayload):
    prompt: str
    seed_sql: str  # DDL + INSERTs, run before candidate query
    expected_sql: str  # reference solution, never sent to client
    ordered: bool = False  # does row order matter
    forbid: List[str] = Field(default_factory=list)  # e.g. ["CREATE", "DROP", "ALTER"]
    efficiency_check: bool = False  # compare EXPLAIN cost vs reference
    answer_keys: ClassVar[List[str]] = ["expected_sql", "seed_sql"]
