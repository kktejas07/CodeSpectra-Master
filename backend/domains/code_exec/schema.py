"""Item payload schema for code_exec domain."""
from typing import ClassVar, List, Optional
from pydantic import Field
from backend.core.contracts.domain import ItemPayload


class CodeExecTestCase(ItemPayload):
    stdin: str
    expected_stdout: str
    is_sample: bool = False


class CodeExecItemPayload(ItemPayload):
    prompt: str
    language: str
    starter_code: Optional[str] = None
    test_cases: List[CodeExecTestCase] = Field(default_factory=list)
    time_limit_ms: int = 2000
    answer_keys: ClassVar[List[str]] = ["test_cases"]
