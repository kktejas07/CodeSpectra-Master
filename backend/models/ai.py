"""AI / LLM request & response Pydantic models.

Extracted from class definitions in the monolithic `ai_router.py`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── RAG ─────────────────────────────────────────────────────────

class RagEmbedReq(BaseModel):
    text: str


# ── Chat History ────────────────────────────────────────────────

class ChatHistoryMsg(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatStreamReq(BaseModel):
    session_id: str
    system_message: Optional[str] = None
    history: List[ChatHistoryMsg] = Field(default_factory=list)
    user_message: str
    model_role: str = "reasoning"
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None
    rag_enabled: bool = True


# ── Completion ─────────────────────────────────────────────────

class CompleteReq(BaseModel):
    session_id: str = "default"
    system_message: str
    user_message: str
    model_role: str = "fast"
    response_format: str = "text"
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Smart Hints ────────────────────────────────────────────────

class HintsReq(BaseModel):
    problem_title: str
    problem_statement: str
    language: str = "python"
    current_code: Optional[str] = None
    hint_level: int = 1
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Code Review ────────────────────────────────────────────────

class CodeReviewReq(BaseModel):
    code: str
    language: str = "javascript"
    context: Optional[str] = None
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Code Analysis ──────────────────────────────────────────────

class CodeAnalysisReq(BaseModel):
    code: str
    language: str = "python"
    problem_title: Optional[str] = None
    passed_tests: Optional[int] = None
    total_tests: Optional[int] = None
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Grading ────────────────────────────────────────────────────

class GradeReq(BaseModel):
    code: str
    language: str = "python"
    problem_title: Optional[str] = None
    rubric: Dict[str, int]
    passed_tests: Optional[int] = None
    total_tests: Optional[int] = None
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Problem Generation ─────────────────────────────────────────

class GenerateProblemReq(BaseModel):
    role: str = "Software Engineer"
    difficulty: str = "medium"
    topics: List[str] = Field(default_factory=list)
    language_hint: str = "python"
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None


# ── Skill Insights ─────────────────────────────────────────────

class SkillInsightsReq(BaseModel):
    user_name: Optional[str] = None
    submissions_summary: List[Dict[str, Any]]


# ── Identity Verification ──────────────────────────────────────

class IdentityVerifyReq(BaseModel):
    selfie_data_url: str
    id_photo_data_url: str
    candidate_name: Optional[str] = None


# ── Agent ──────────────────────────────────────────────────────

class AgentReq(BaseModel):
    goal: str
    code: str
    language: str = "python"
    max_steps: int = 3
    model_role: Optional[str] = None
    provider_override: Optional[str] = None
    model_override: Optional[str] = None
    endpoint_override: Optional[str] = None