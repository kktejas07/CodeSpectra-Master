"""Shared model fragments — pagination, error envelopes, etc."""
from __future__ import annotations

from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class SuccessResponse(BaseModel):
    ok: bool = True
    data: Any = None


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    total: int
    page: int = 1
    page_size: int = 20


class IdResponse(BaseModel):
    id: str
