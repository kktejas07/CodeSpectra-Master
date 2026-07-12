"""
AI / LLM route handlers — thin HTTP controllers.

Mounted at `/internal/ai/*` on the FastAPI backend, matching the original
prefix from `ai_router.py`.  Each handler delegates to the AI service layer.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from models.ai import (
    AgentReq,
    ChatHistoryMsg,
    ChatStreamReq,
    CodeAnalysisReq,
    CodeReviewReq,
    CompleteReq,
    GenerateProblemReq,
    GradeReq,
    HintsReq,
    IdentityVerifyReq,
    RagEmbedReq,
    SkillInsightsReq,
)
from services.ai import (
    handle_agent,
    handle_chat,
    handle_code_analysis,
    handle_code_review,
    handle_complete,
    handle_generate_problem,
    handle_grade,
    handle_hints,
    handle_identity_verify,
    handle_rag_embed,
    handle_skill_insights,
)

router = APIRouter(prefix="/internal/ai", tags=["internal-ai"])


@router.post("/rag/embed")
async def rag_embed(req: RagEmbedReq, request: Request) -> dict:
    """Generate an embedding vector for the given text using Gemini."""
    return await handle_rag_embed(req, request)


@router.post("/chat")
async def chat_stream(request: Request, req: ChatStreamReq) -> StreamingResponse:
    """SSE stream — conversational chat with RAG context."""
    return await handle_chat(request, req)


@router.post("/complete")
async def complete(request: Request, req: CompleteReq) -> dict[str, Any]:
    """Single-turn LLM completion (non-streaming)."""
    return await handle_complete(request, req)


@router.post("/hints")
async def smart_hints(request: Request, req: HintsReq) -> dict[str, Any]:
    """Progressive coding hints."""
    return await handle_hints(request, req)


@router.post("/code-review")
async def code_review(request: Request, req: CodeReviewReq) -> dict[str, Any]:
    """Deep AI code review."""
    return await handle_code_review(request, req)


@router.post("/code-analysis")
async def code_analysis(request: Request, req: CodeAnalysisReq) -> dict[str, Any]:
    """Automated code analysis (time complexity, efficiency, etc.)."""
    return await handle_code_analysis(request, req)


@router.post("/grade")
async def grade(request: Request, req: GradeReq) -> dict[str, Any]:
    """Grade a submission by rubric."""
    return await handle_grade(request, req)


@router.post("/generate-problem")
async def generate_problem(request: Request, req: GenerateProblemReq) -> dict[str, Any]:
    """Generate a coding interview problem."""
    return await handle_generate_problem(request, req)


@router.post("/skill-insights")
async def skill_insights(request: Request, req: SkillInsightsReq) -> dict[str, Any]:
    """Analyze developer submissions and return skill insights."""
    return await handle_skill_insights(request, req)


@router.post("/identity-verify")
async def identity_verify(request: Request, req: IdentityVerifyReq) -> dict[str, Any]:
    """Compare selfie vs ID photo using Gemini vision."""
    return await handle_identity_verify(request, req)


@router.post("/agent")
async def agentic_fix(request: Request, req: AgentReq) -> dict[str, Any]:
    """Multi-step agentic code-fix loop."""
    return await handle_agent(request, req)