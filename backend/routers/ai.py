"""
AI / LLM route handlers — thin HTTP controllers.

Mounted at `/internal/ai/*` on the FastAPI backend, matching the original
prefix from `ai_router.py`.  Each handler delegates to the AI service layer.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from core.dependencies import check_rate_limit

# Sliding window rate limiter for AI backend routes (60 requests / minute per client IP)
AI_MAX_REQUESTS_PER_MINUTE = 60
AI_RATE_WINDOW_SECONDS = 60.0


async def rate_limit_ai_requests(request: Request) -> None:
    client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "unknown")
    client_ip = client_ip.split(",")[0].strip()
    # Delegate to the shared Redis+in-memory rate limiter (same key prefix as
    # the previous inline implementation, so existing counters carry over).
    await check_rate_limit(
        f"ai_rate_limit:{client_ip}",
        AI_MAX_REQUESTS_PER_MINUTE,
        int(AI_RATE_WINDOW_SECONDS),
    )


router = APIRouter(
    prefix="/internal/ai",
    tags=["internal-ai"],
    dependencies=[Depends(rate_limit_ai_requests)],
)

from models.ai import (
    AgentReq,
    ChatHistoryMsg,
    ChatStreamReq,
    CodeAnalysisReq,
    CodeReviewReq,
    CompleteReq,
    GenerateCourseReq,
    GenerateProblemReq,
    GradeReq,
    HintsReq,
    IdentityVerifyReq,
    RagEmbedReq,
    SkillInsightsReq,
    TextToCadReq,
)
from services.ai import (
    handle_agent,
    handle_chat,
    handle_code_analysis,
    handle_code_review,
    handle_complete,
    handle_generate_course,
    handle_generate_problem,
    handle_grade,
    handle_hints,
    handle_identity_verify,
    handle_rag_embed,
    handle_skill_insights,
    handle_text_to_cad,
)

import functools
import traceback


def safe_ai_endpoint(fn):
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except Exception:
            traceback.print_exc()
            return JSONResponse(
                content={"error": "AI service temporarily unavailable.", "type": type(fn).__name__},
                status_code=500,
            )
    return wrapper


@router.post("/rag/embed")
@safe_ai_endpoint
async def rag_embed(req: RagEmbedReq, request: Request) -> dict:
    """Generate an embedding vector for the given text using Gemini."""
    return await handle_rag_embed(req, request)


@router.post("/chat")
async def chat_stream(request: Request, req: ChatStreamReq) -> StreamingResponse:
    """SSE stream — conversational chat with RAG context."""
    return await handle_chat(request, req)


@router.post("/complete")
@safe_ai_endpoint
async def complete(request: Request, req: CompleteReq) -> dict[str, Any]:
    """Single-turn LLM completion (non-streaming)."""
    return await handle_complete(request, req)


@router.post("/hints")
@safe_ai_endpoint
async def smart_hints(request: Request, req: HintsReq) -> dict[str, Any]:
    """Progressive coding hints."""
    return await handle_hints(request, req)


@router.post("/code-review")
@safe_ai_endpoint
async def code_review(request: Request, req: CodeReviewReq) -> dict[str, Any]:
    """Deep AI code review."""
    return await handle_code_review(request, req)


@router.post("/code-analysis")
@safe_ai_endpoint
async def code_analysis(request: Request, req: CodeAnalysisReq) -> dict[str, Any]:
    """Automated code analysis (time complexity, efficiency, etc.)."""
    return await handle_code_analysis(request, req)


@router.post("/grade")
@safe_ai_endpoint
async def grade(request: Request, req: GradeReq) -> dict[str, Any]:
    """Grade a submission by rubric."""
    return await handle_grade(request, req)


@router.post("/generate-problem")
@safe_ai_endpoint
async def generate_problem(request: Request, req: GenerateProblemReq) -> dict[str, Any]:
    """Generate a coding interview problem."""
    return await handle_generate_problem(request, req)


@router.post("/skill-insights")
@safe_ai_endpoint
async def skill_insights(request: Request, req: SkillInsightsReq) -> dict[str, Any]:
    """Analyze developer submissions and return skill insights."""
    return await handle_skill_insights(request, req)


@router.post("/identity-verify")
@safe_ai_endpoint
async def identity_verify(request: Request, req: IdentityVerifyReq) -> dict[str, Any]:
    """Compare selfie vs ID photo using Gemini vision."""
    return await handle_identity_verify(request, req)


@router.post("/agent")
@safe_ai_endpoint
async def agentic_fix(request: Request, req: AgentReq) -> dict[str, Any]:
    """Multi-step agentic code-fix loop."""
    return await handle_agent(request, req)


@router.post("/generate-course")
@safe_ai_endpoint
async def generate_course(request: Request, req: GenerateCourseReq) -> dict[str, Any]:
    """Generate a complete learning course with modules, lessons, and assessments."""
    return await handle_generate_course(request, req)


@router.post("/cad/generate-text-to-cad")
@safe_ai_endpoint
async def generate_text_to_cad(request: Request, req: TextToCadReq) -> dict[str, Any]:
    """Synthesize CAD brief, geometric constraints, parametric code, and item payload from text prompt."""
    return await handle_text_to_cad(request, req)

