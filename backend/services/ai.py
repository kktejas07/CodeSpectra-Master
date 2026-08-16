"""
AI / LLM service — extracted business logic from the monolithic `ai_router.py`.

Each public function corresponds to one route handler.  The service layer
handles LLM interactions, RAG enrichment, and response parsing — routes
stay thin (pure HTTP coordination).
"""
from __future__ import annotations

import asyncio
import json
import os
import pymongo
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from ai_client import (
    DirectAiClient as LlmChat,
    TextDelta,
    StreamDone,
    UserMessage,
)
from core.dependencies import (
    build_chat,
    build_fallback_chat,
    check_rate_limit,
    client_ip,
    parse_json_response,
)
from core.config import settings
from models.ai import (
    AgentReq,
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
from rag import generate_embedding

RAG_API_KEY = settings.GEMINI_API_KEY

# ── Constants ──────────────────────────────────────────────────

DEFAULT_CHAT_SYSTEM = (
    "You are 'Ask CodeSpectra', an expert AI coding assistant embedded in the "
    "CodeSpectra platform. You help developers with: code reviews, debugging, "
    "explaining algorithms, suggesting refactors, and walking through their "
    "scans and submissions. Be concise, practical, and ALWAYS use fenced code "
    "blocks for code. When context about the user's scans, submissions or the "
    "problem they are viewing is provided in the system message, ground your "
    "answer in that context."
)


# ── RAG ────────────────────────────────────────────────────────

async def handle_rag_embed(req: RagEmbedReq, request: Request) -> dict:
    """Generate an embedding vector for the given text using Gemini."""
    await check_rate_limit(f"rag-embed:{client_ip(request)}", 30, 60)
    vec = await generate_embedding(req.text[:8192], RAG_API_KEY)
    if vec is None:
        raise HTTPException(status_code=502, detail="Embedding generation failed")
    return {"embedding": vec, "dim": len(vec)}


# ── Chat / Streaming ───────────────────────────────────────────

async def handle_chat(
    request: Request, req: ChatStreamReq
) -> StreamingResponse:
    """SSE stream: chat with RAG context enrichment."""
    await check_rate_limit(f"chat:{client_ip(request)}", 30, 60)

    rag_context: str | None = None
    if req.rag_enabled and RAG_API_KEY:
        try:
            uri = (
                settings.MONGO_URL
                or settings.MONGODB_URI
                or os.environ.get("MONGODB_URI", "")
            )
            if uri:
                rag_context = await _search_rag(req.user_message, uri)
        except Exception:
            pass

    system = req.system_message or DEFAULT_CHAT_SYSTEM
    if rag_context:
        system += f"\n\nRelevant context from code scans and docs:\n{rag_context}"

    chat = build_chat(
        req.model_role,
        req.session_id,
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )

    if req.history:
        transcript = "\n\nPrior conversation transcript:\n" + "\n".join(
            f"{m.role.upper()}: {m.content}"
            for m in req.history[-12:]
        )
        chat = build_chat(
            req.model_role,
            req.session_id,
            system + transcript,
            request.headers,
            provider_override=req.provider_override,
            model_override=req.model_override,
            endpoint_override=req.endpoint_override,
        )

    async def event_stream() -> AsyncGenerator[bytes, None]:
        try:
            user_msg = UserMessage(text=req.user_message)
            usage = {}
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n".encode()
                elif isinstance(ev, StreamDone):
                    usage = ev.usage or {}
                    break
            if usage:
                yield f"data: {json.dumps({'usage': usage})}\n\n".encode()
            yield b"data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n".encode()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


async def _search_rag(query: str, uri: str) -> str | None:
    """RAG search — embedding generated and similarity search in async context using motor."""
    from rag import cosine_similarity, build_context
    from core.database import get_database

    query_emb = await generate_embedding(query, RAG_API_KEY)
    if not query_emb:
        return None

    try:
        # Get the database connection (singleton via get_database)
        db = await get_database()
        col = db.get_collection("embeddings")

        # Perform async query
        cands: list[dict] = []
        async for doc in col.find(
            {}, projection={"text": 1, "source": 1, "embedding": 1}
        ):
            vec = doc.get("embedding")
            if vec and len(vec) == 768:
                sim = cosine_similarity(query_emb, vec)
                if sim > 0.65:
                    cands.append(
                        {
                            "text": doc.get("text", ""),
                            "source": doc.get("source", ""),
                            "score": sim,
                        }
                    )
        cands.sort(key=lambda x: x["score"], reverse=True)
        ctx = build_context(cands[:5])
        return ctx if ctx else None
    except Exception:
        return None


# ── Completion (non-stream) ────────────────────────────────────

async def handle_complete(request: Request, req: CompleteReq) -> dict[str, Any]:
    """Single-turn LLM completion, returns full text / JSON."""
    await check_rate_limit(f"complete:{client_ip(request)}", 60, 60)
    chat = build_chat(
        req.model_role,
        req.session_id,
        req.system_message,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    try:
        async for ev in chat.stream_message(UserMessage(text=req.user_message)):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:
        if req.provider_override:
            chat = build_fallback_chat(
                req.model_role, req.system_message, request.headers
            )
            buf.clear()
            try:
                async for ev in chat.stream_message(
                    UserMessage(text=req.user_message)
                ):
                    if isinstance(ev, TextDelta):
                        buf.append(ev.content)
                    elif isinstance(ev, StreamDone):
                        break
            except Exception as e2:
                raise HTTPException(
                    status_code=500,
                    detail="AI service temporarily unavailable. Please try again.",
                )
        else:
            raise HTTPException(status_code=500, detail="AI service temporarily unavailable. Please try again.")

    raw = "".join(buf).strip()
    if req.response_format == "json":
        parsed = parse_json_response(raw)
        return {"ok": True, "raw": raw, "json": parsed}
    return {"ok": True, "text": raw}


# ── Smart Hints ────────────────────────────────────────────────

async def handle_hints(request: Request, req: HintsReq) -> dict[str, Any]:
    """Progressive coding hints."""
    await check_rate_limit(f"hints:{client_ip(request)}", 120, 60)
    level_brief = {
        1: "a SHORT non-spoiler nudge focused on the right data structure or insight — no algorithm name, no code, max 2 sentences.",
        2: "the high-level APPROACH — what algorithm/pattern fits, time/space complexity. No code yet.",
        3: "PSEUDO-CODE only. No real implementation. ~10 lines.",
        4: "a complete working solution in the requested language with brief inline comments.",
    }.get(req.hint_level, "a SHORT nudge.")

    system = (
        "You are a coding interview coach. Produce progressive hints for a coding "
        "problem WITHOUT spoiling the solution before the requested hint level."
    )
    user = (
        f"Problem title: {req.problem_title}\n\n"
        f"Problem statement:\n{req.problem_statement}\n\n"
        f"Language: {req.language}\n"
        f"Candidate's current code:\n```\n{(req.current_code or '<empty>')[:4000]}\n```\n\n"
        f"Return ONLY: {level_brief}"
    )
    chat = build_chat(
        "fast",
        f"hints:{req.problem_title}:{req.hint_level}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return {"hint_level": req.hint_level, "hint": "".join(buf).strip()}


# ── Code Review ────────────────────────────────────────────────

async def handle_code_review(request: Request, req: CodeReviewReq) -> dict[str, Any]:
    """Deep AI code review."""
    await check_rate_limit(f"code-review:{client_ip(request)}", 30, 60)
    system = (
        "You are a senior staff engineer doing a strict but constructive code review. "
        "Return JSON ONLY with keys: summary (string), strengths (string[]), "
        "concerns (array of {severity:'critical'|'major'|'minor', title, detail, "
        "line?:number}), suggestions (string[]), overall_rating (1-10)."
    )
    user = (
        f"Language: {req.language}\n"
        f"Context: {req.context or 'n/a'}\n\n"
        f"Code:\n```{req.language}\n{req.code[:12000]}\n```\n\n"
        "Return ONLY a single JSON object — no prose, no markdown fences."
    )
    chat = build_chat(
        "reasoning",
        f"review:{abs(hash(req.code)) % 10**8}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    raw = "".join(buf).strip()
    parsed = parse_json_response(raw) or {
        "summary": raw,
        "strengths": [],
        "concerns": [],
        "suggestions": [],
        "overall_rating": 7,
    }
    return parsed


# ── Code Analysis ──────────────────────────────────────────────

async def handle_code_analysis(
    request: Request, req: CodeAnalysisReq
) -> dict[str, Any]:
    """Automated code analysis (time complexity, efficiency, edge cases)."""
    await check_rate_limit(f"code-analysis:{client_ip(request)}", 60, 60)
    system = (
        "You are an automated code analyzer. Given a candidate's submission, "
        "return JSON ONLY with keys: time_complexity (string like 'O(n log n)'), "
        "space_complexity (string), efficiency_score (0-100), edge_cases_covered "
        "(string[]), missing_edge_cases (string[]), readability_score (0-100), "
        "summary (string)."
    )
    pt = req.passed_tests if req.passed_tests is not None else "n/a"
    tt = req.total_tests if req.total_tests is not None else "n/a"
    user = (
        f"Problem: {req.problem_title or 'unknown'}\n"
        f"Language: {req.language}\n"
        f"Tests passed: {pt}/{tt}\n\n"
        f"Code:\n```{req.language}\n{req.code[:8000]}\n```\n\n"
        "Return ONLY one JSON object."
    )
    chat = build_chat(
        "fast",
        f"analysis:{abs(hash(req.code)) % 10**8}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}
    return parsed


# ── Grading ────────────────────────────────────────────────────

async def handle_grade(request: Request, req: GradeReq) -> dict[str, Any]:
    """Grade a submission using a rubric."""
    await check_rate_limit(f"grade:{client_ip(request)}", 60, 60)
    rubric_text = "\n".join(f"- {k} (max {v})" for k, v in req.rubric.items())
    system = (
        "You are an automated technical grader. Score the submission strictly using "
        "the provided rubric. Return JSON ONLY: { scores: { <criterion>: number }, "
        "feedback: { <criterion>: string }, total: number, max: number, letter_grade: "
        "string ('A'..'F'), overall_feedback: string }"
    )
    user = (
        f"Problem: {req.problem_title or 'unknown'}\n"
        f"Language: {req.language}\n"
        f"Tests passed: {req.passed_tests}/{req.total_tests}\n\n"
        f"Rubric (criterion, max points):\n{rubric_text}\n\n"
        f"Code:\n```{req.language}\n{req.code[:8000]}\n```\n\n"
        "Return ONLY one JSON object."
    )
    chat = build_chat(
        "reasoning",
        f"grade:{abs(hash(req.code)) % 10**8}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}
    return parsed


# ── Problem Generation ─────────────────────────────────────────

async def handle_generate_problem(
    request: Request, req: GenerateProblemReq
) -> dict[str, Any]:
    """Generate a coding interview problem using AI."""
    await check_rate_limit(f"generate-problem:{client_ip(request)}", 20, 60)
    topics_s = ", ".join(req.topics) if req.topics else "any data-structures / algorithms"
    system = (
        "You create production-quality coding interview problems. Return JSON ONLY "
        "matching this exact shape: { slug, title, difficulty:'easy'|'medium'|'hard', "
        "topics:string[], statement_md:string, input_format:string, output_format:string, "
        "constraints:string, example_explanation:string, time_limit_ms:number, "
        "starter_code:{python:string,javascript:string,cpp:string,java:string}, "
        "test_cases:[{stdin:string, expected_stdout:string, is_sample:boolean}] }. "
        "Include at least 6 test cases, 2 marked is_sample:true. starter_code MUST be "
        "skeleton functions, not solutions."
    )
    user = (
        f"Generate a UNIQUE coding interview problem suitable for: {req.role}.\n"
        f"Difficulty: {req.difficulty}\n"
        f"Topics: {topics_s}\n"
        f"Preferred language for starter code: {req.language_hint}\n"
        "Avoid common LeetCode-named problems. Be creative.\n"
        "Return ONLY one JSON object."
    )
    chat = build_chat(
        "reasoning",
        f"qgen:{req.role}:{req.difficulty}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}

    # Normalize so a title/slug are ALWAYS readable — never `gen-<ts>`.
    # Some models drop the `title`/`slug` keys when the response is
    # truncated or lightly malformed; derive from the statement or topics
    # instead of the frontend's gen-<timestamp> fallback (ponytail: single
    # guard here covers every caller of this endpoint).
    if isinstance(parsed, dict):
        title = str(parsed.get("title") or "").strip()
        slug = str(parsed.get("slug") or "").strip()
        if not title:
            title = str(parsed.get("statement_md") or "").strip().splitlines()[0][:80] if parsed.get("statement_md") else ""
        if not title:
            topics = parsed.get("topics") if isinstance(parsed.get("topics"), list) else []
            joined = ", ".join(str(t) for t in topics)
            title = f"{joined} Challenge".strip() if joined else f"{req.difficulty or 'medium'} coding challenge"
        if not slug:
            slug = title.lower().replace(" ", "-").replace("[^a-z0-9-]", "")
        parsed["title"] = title
        parsed["slug"] = slug
    return parsed


# ── Skill Insights ─────────────────────────────────────────────

async def handle_skill_insights(
    request: Request, req: SkillInsightsReq
) -> dict[str, Any]:
    """Analyze developer submissions and return skill insights."""
    await check_rate_limit(f"skill-insights:{client_ip(request)}", 30, 60)
    system = (
        "You are a skills coach analyzing a developer's coding submissions. "
        "Return JSON ONLY: { strengths:string[], weak_topics:string[], "
        "recommended_problems:string[], speed_assessment:string, accuracy_assessment:string, "
        "growth_plan:string[] }"
    )
    user = (
        f"Developer: {req.user_name or 'anonymous'}\n"
        f"Submissions ({len(req.submissions_summary)} total):\n"
        f"{json.dumps(req.submissions_summary[:80], indent=2)}\n\n"
        "Return ONLY one JSON object."
    )
    chat = build_chat(
        "fast",
        f"insights:{req.user_name or 'anon'}",
        system,
        request.headers,
        provider_override=req.provider_override,
        model_override=req.model_override,
        endpoint_override=req.endpoint_override,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}
    return parsed


# ── Identity Verification ──────────────────────────────────────

async def handle_identity_verify(
    request: Request, req: IdentityVerifyReq
) -> dict[str, Any]:
    """Compare selfie vs ID photo using Gemini vision."""
    await check_rate_limit(f"identity-verify:{client_ip(request)}", 10, 60)

    from ai_client import ImageContent

    system = (
        "You are an identity verification assistant. Compare the SELFIE and ID PHOTO "
        "and respond with JSON ONLY: { match: boolean, confidence: number(0-100), "
        "reasoning: string, warnings: string[] }. Be conservative: only return "
        "match=true with confidence>=70."
    )

    # Identity verification must always use a vision-capable model
    # from MODEL_REGISTRY — never accept overrides (ponytail: identity
    # verification integrity must not depend on user/admin model preferences).
    chat = build_chat("vision", "identity-verify", system, request.headers)

    try:
        user_msg = UserMessage(
            text=f"Candidate: {req.candidate_name or 'n/a'}. Compare these two images.",
            image_contents=[
                ImageContent(image_base64=_strip_data_url(req.selfie_data_url)),
                ImageContent(image_base64=_strip_data_url(req.id_photo_data_url)),
            ],
        )
        buf: list[str] = []
        async for ev in chat.stream_message(user_msg):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        parsed = parse_json_response("".join(buf)) or {}
        # Guard: parsed must be a dict
        if isinstance(parsed, dict) and parsed:
            return parsed
        return {
            "match": False,
            "confidence": 0,
            "reasoning": "API returned non-dict response",
            "warnings": ["Vision comparison failed — unexpected response format."],
        }
    except Exception as e:
        return {
            "match": False,
            "confidence": 0,
            "reasoning": f"vision-unavailable: {e}",
            "warnings": ["Vision comparison failed — manual review required."],
        }


def _strip_data_url(data_url: str) -> str:
    if data_url.startswith("data:"):
        comma = data_url.find(",")
        return data_url[comma + 1:] if comma > 0 else data_url
    return data_url


# ── Agentic Fix ────────────────────────────────────────────────

async def handle_agent(request: Request, req: AgentReq) -> dict[str, Any]:
    """Multi-step agentic fix loop."""
    await check_rate_limit(f"agent:{client_ip(request)}", 10, 60)
    system = (
        "You are an autonomous code-fixing agent. You will be called multiple times "
        "in a loop. Each call: 1) READ the goal + current code 2) IDENTIFY the single "
        "highest-impact change 3) APPLY it and return JSON ONLY: { thought: string, "
        "next_code: string, done: boolean, summary: string }. When you are satisfied "
        "set done:true."
    )
    code = req.code
    steps: list[dict[str, Any]] = []
    final_summary = ""

    for step in range(max(1, min(req.max_steps, 5))):
        user = (
            f"GOAL: {req.goal}\n\nLANGUAGE: {req.language}\n\nCURRENT CODE:\n"
            f"```\n{code[:8000]}\n```\n\n"
            f"Step {step + 1}/{req.max_steps}. Return ONLY one JSON object."
        )
        chat = build_chat(
            "reasoning",
            f"agent:{abs(hash(req.code)) % 10**8}:{step}",
            system,
            request.headers,
            provider_override=req.provider_override,
            model_override=req.model_override,
            endpoint_override=req.endpoint_override,
        )
        buf: list[str] = []
        async for ev in chat.stream_message(UserMessage(text=user)):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        parsed = parse_json_response("".join(buf)) or {}
        steps.append(
            {
                "step": step + 1,
                "thought": parsed.get("thought", ""),
                "summary": parsed.get("summary", ""),
            }
        )
        nxt = parsed.get("next_code")
        if isinstance(nxt, str) and nxt.strip():
            code = nxt
        final_summary = parsed.get("summary") or final_summary
        if parsed.get("done") is True:
            break
        await asyncio.sleep(0.05)

    return {"final_code": code, "steps": steps, "summary": final_summary}