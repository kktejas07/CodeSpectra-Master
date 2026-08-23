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
import re
from datetime import datetime, timezone
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
    GenerateCourseReq,
    GenerateProblemReq,
    GradeReq,
    HintsReq,
    IdentityVerifyReq,
    RagEmbedReq,
    SkillInsightsReq,
    TextToCadReq,
)
from backend.domains.cad_step.generator import generate_cad_step_payload_from_prompt
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
    # ponytail: public 60/min stays; internal worker (12 lessons × failover) would 429 itself
    from core.auth import get_internal_backend_secret
    secret = request.headers.get("x-internal-secret", "")
    backend_secret = await get_internal_backend_secret()
    if not (secret and backend_secret and secret == backend_secret):
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
    if "API Error" in raw or "Insufficient credits" in raw:
        raise HTTPException(status_code=402, detail=raw[:500])
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
        "matching this exact shape:\n"
        "{\n"
        "  \"slug\": \"string\",\n"
        "  \"title\": \"string - clear, specific, no numbering\",\n"
        "  \"difficulty\": \"easy|medium|hard\",\n"
        "  \"topics\": [\"string\"],\n"
        "  \"statement_md\": \"string - markdown with: Problem Statement, Examples, Constraints, Notes\",\n"
        "  \"input_format\": \"string\",\n"
        "  \"output_format\": \"string\",\n"
        "  \"constraints\": \"string\",\n"
        "  \"example_explanation\": \"string\",\n"
        "  \"time_limit_ms\": number,\n"
        "  \"starter_code\": {\"python\": \"string\", \"javascript\": \"string\", \"cpp\": \"string\", \"java\": \"string\", \"go\": \"string\"},\n"
        "  \"test_cases\": [\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": true},\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": true},\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": false},\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": false},\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": false},\n"
        "    {\"stdin\": \"string\", \"expected_stdout\": \"string\", \"is_sample\": false}\n"
        "  ],\n"
        "  \"solution_code\": \"string - complete working solution in primary language\",\n"
        "  \"explanation\": \"string - markdown: approach, time/space complexity, key insights\",\n"
        "  \"tags\": [\"string\"]\n"
        "}\n"
        "REQUIREMENTS:\n"
        "1. Minimum 6 test cases (2 sample visible to candidate, 4 hidden)\n"
        "2. starter_code MUST be skeleton functions with type hints, NOT solutions\n"
        "3. solution_code MUST pass all test_cases\n"
        "3. statement_md MUST follow: Problem Statement → Examples → Constraints → Notes\n"
        "4. explanation MUST include: approach, time complexity, space complexity, edge cases\n"
        "5. tags for categorization (e.g., \"two-pointers\", \"sliding-window\", \"dynamic-programming\")\n"
        "6. NO duplicate problems - generate unique problems"
    )
    user = (
        f"Generate a UNIQUE coding interview problem suitable for: {req.role}.\n"
        f"Difficulty: {req.difficulty}\n"
        f"Topics: {topics_s}\n"
        f"Preferred language for starter code: {req.language_hint}\n"
        "Avoid common LeetCode-named problems. Be creative and practical.\n"
        "Return ONLY one JSON object with ALL fields specified above."
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

    # Normalize so all required fields are ALWAYS present.
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

        # Ensure starter_code has all languages
        if not isinstance(parsed.get("starter_code"), dict):
            parsed["starter_code"] = {}
        for lang in ["python", "javascript", "cpp", "java", "go"]:
            if not parsed["starter_code"].get(lang):
                parsed["starter_code"][lang] = generate_skeleton_code(lang, parsed.get("title", ""))

        # Ensure test_cases exist with proper structure
        if not isinstance(parsed.get("test_cases"), list) or len(parsed["test_cases"]) < 6:
            parsed["test_cases"] = generate_default_test_cases(parsed.get("test_cases", []))

        # Ensure other fields exist
        if not parsed.get("explanation"):
            parsed["explanation"] = generate_default_explanation(parsed)
        if not parsed.get("solution_code"):
            parsed["solution_code"] = ""
        if not parsed.get("tags"):
            parsed["tags"] = parsed.get("topics", [])
        if not parsed.get("input_format"):
            parsed["input_format"] = "Standard input format"
        if not parsed.get("output_format"):
            parsed["output_format"] = "Standard output format"
        if not parsed.get("constraints"):
            parsed["constraints"] = "Standard constraints apply"
        if not parsed.get("example_explanation"):
            parsed["example_explanation"] = ""
        if not parsed.get("time_limit_ms"):
            parsed["time_limit_ms"] = 2000
    return parsed


# ── Helper Functions for Problem Generation Normalization ─────────

def generate_skeleton_code(lang: str, title: str) -> str:
    """Generate basic skeleton code for a problem."""
    templates = {
        "python": "def solve():\n    # TODO: Implement solution\n    pass\n\nif __name__ == \"__main__\":\n    solve()",
        "javascript": "function solve() {\n    // TODO: Implement solution\n}\n\nsolve();",
        "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // TODO: Implement solution\n    return 0;\n}",
        "java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // TODO: Implement solution\n    }\n}",
        "go": "package main\n\nimport (\n    \"fmt\"\n)\n\nfunc main() {\n    // TODO: Implement solution\n}",
    }
    return templates.get(lang, templates["python"])


def generate_default_test_cases(existing: list) -> list:
    """Generate default test cases structure."""
    # Keep existing valid ones
    valid = [tc for tc in existing if isinstance(tc, dict) and "stdin" in tc and "expected_stdout" in tc]
    # Add placeholders to reach 6
    while len(valid) < 6:
        idx = len(valid) + 1
        valid.append({
            "stdin": f"# Test case {idx} input\n",
            "expected_stdout": f"# Test case {idx} expected output\n",
            "is_sample": idx <= 2,
        })
    return valid[:6]


def generate_default_explanation(parsed: dict) -> str:
    """Generate a default explanation based on problem metadata."""
    difficulty = parsed.get("difficulty", "medium")
    topics = parsed.get("topics", [])
    topic_str = ", ".join(topics) if topics else "general algorithms"
    return f"""## Approach

This problem tests **{topic_str}** at **{difficulty}** difficulty level.

### Time Complexity
O(n) - Linear pass through the input (adjust based on actual solution)

### Space Complexity
O(1) - Constant extra space (adjust based on actual solution)

### Key Insights
- Identify the core algorithmic pattern required
- Consider edge cases: empty input, single element, large inputs
- Optimize for the given constraints

### Edge Cases to Consider
- Minimum/maximum input sizes
- Invalid or malformed inputs
- Boundary conditions
"""


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


# ── Course Factory ─────────────────────────────────────────────

def slugify(text: str) -> str:
    """Slugify a title for stable section/lesson ids (safe for URLs)."""
    text = (text or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "untitled"


async def _enrich_lessons(modules: List[dict], limit: int = 3) -> None:
    """Attach provider-share video candidates to every lesson in place.

    Each lesson gains a `resources` array of `{ title, url, embed_url,
    provider, license, playback_type, status }` records from the Content
    Provider Layer. Kept async for concurrent provider calls; mutates the
    modules passed in so callers (and the frontend preview) see resources.
    """
    from services.content_providers import search_videos

    async def enrich(lesson: dict) -> None:
        if not lesson.get("title"):
            lesson["resources"] = []
            return
        query = lesson["title"]
        try:
            vids = await search_videos(query, limit=limit)
        except Exception:
            vids = []
        lesson["resources"] = [
            {
                "title": v.title,
                "url": v.source_url,
                "embed_url": v.embed_url,
                "provider": v.provider,
                "license": v.license,
                "playback_type": v.playback_type,
                "status": v.status,
                "thumbnail": v.thumbnail,
                "duration": v.duration,
                "author": v.author,
                "language": v.language,
            }
            for v in vids
        ]

    tasks = [
        enrich(lesson)
        for mod in modules
        for lesson in (mod.get("lessons") or [])
    ]
    if tasks:
        await asyncio.gather(*tasks)


async def handle_generate_course(
    request: Request, req: GenerateCourseReq
) -> dict[str, Any]:
    """Generate a complete learning course with modules, lessons, and assessments.

    Uses the LLM to build a curriculum blueprint (modules -> lessons) for the
    requested technology/level, then enriches every lesson with externally
    embeddable video candidates from the Content Provider Layer. Returns the
    course blueprint (ready for human approval / auto-publish).
    """
    await check_rate_limit(f"generate-course:{client_ip(request)}", 20, 60)

    system = (
        "You are a senior curriculum designer for a technical training platform. "
        "Create a structured learning course for a student. "
        "Return JSON ONLY matching this exact shape:\n"
        "{\n"
        "  \"title\": \"string\",\n"
        "  \"description\": \"string\",\n"
        "  \"level\": \"Beginner|Intermediate|Advanced|Expert\",\n"
        "  \"estimated_hours\": number,\n"
        "  \"modules\": [\n"
        "    {\n"
        "      \"title\": \"string\",\n"
        "      \"description\": \"string\",\n"
        "      \"lessons\": [{\"title\": \"string\", \"type\": \"video|reading|exercise|project\", \"estimated_minutes\": number}]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Requirements:\n"
        "1. Match the student's level; each module builds on the previous one.\n"
        "2. Keep lesson titles specific and self-contained (they are used to search for videos).\n"
        "3. Include a final project module when projects are requested.\n"
        "4. Aim for the requested total duration (hours) split across lessons.\n"
        "Return ONLY one JSON object."
    )
    user = (
        f"Technology: {req.technology}\n"
        f"Level: {req.level}\n"
        f"Goal: {req.goal or f'Master {req.technology}'}\n"
        f"Target duration: {req.duration_hours or 20} hours\n"
        f"Include projects: {req.include_projects}\n"
        f"Include assessments: {req.include_assessments}\n\n"
        "Return ONLY one JSON object."
    )

    chat = build_chat(
        "reasoning",
        f"course:{req.technology.lower()}:{req.level.lower()}",
        system,
        request.headers,
    )
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = parse_json_response("".join(buf)) or {}

    if not parsed.get("modules"):
        parsed = _fallback_course(req)

    await _enrich_lessons(parsed.get("modules") or [])

    # Persist so the learning/[id] page and certificate flow can read it.
    try:
        await _persist_generated_course(parsed, req)
    except Exception:
        pass  # ponytail: persistence failure must not fail course generation

    return parsed


def _modules_to_sections(modules: List[dict]) -> List[dict]:
    """Convert AI blueprint `modules` into the learning-page `sections` shape."""
    sections: List[dict] = []
    for i, mod in enumerate(modules or []):
        lessons = []
        for j, lesson in enumerate(mod.get("lessons") or []):
            lessons.append(
                {
                    "id": f"{slugify(mod.get('title', f'module-{i}'))}-{j + 1}",
                    "slug": slugify(lesson.get("title") or f"lesson-{j + 1}"),
                    "title": lesson.get("title", ""),
                    "description": lesson.get("description", ""),
                    "type": lesson.get("type", "lesson"),
                    "estimated_minutes": lesson.get("estimated_minutes", 20),
                    "resources": lesson.get("resources", []),
                }
            )
        sections.append(
            {
                "title": mod.get("title", f"Module {i + 1}"),
                "slug": slugify(mod.get("title", f"module-{i + 1}")),
                "description": mod.get("description", ""),
                "lessons": lessons,
            }
        )
    return sections


async def _persist_generated_course(course: dict, req: GenerateCourseReq) -> str:
    """Upsert a generated course blueprint into `learning_courses`.

    Stores the frontend `sections` shape plus the raw blueprint `modules`
    so both the learning page and the admin preview work. Returns the course id.
    """
    from core.database import get_database

    db = await get_database()
    col = db["learning_courses"]
    course_id = (course.get("id") or "").strip() or f"ai-{req.technology.lower()}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    doc = {
        "id": course_id,
        "title": course.get("title", f"{req.technology} Course"),
        "description": course.get("description", ""),
        "level": course.get("level", req.level),
        "type": "video",
        "instructor": "CodeSpectra AI",
        "duration": f"{course.get('estimated_hours', '')} hours",
        "rating": 4.5,
        "tags": [req.technology, req.level],
        "source": "AI Generated",
        "license": "mixed (external embeds + CodeSpectra assessments)",
        "status": "pending_review",
        "sections": _modules_to_sections(course.get("modules") or []),
        "modules": course.get("modules", []),
        "generated_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    await col.replace_one({"id": course_id}, doc, upsert=True)
    course["id"] = course_id
    return course_id


def _fallback_course(req: GenerateCourseReq) -> Dict[str, Any]:
    """Deterministic course blueprint used when the LLM call fails.

    Keeps the frontend preview usable and the /generate-course contract stable.
    """
    tech = req.technology
    level = req.level
    count = max(2, min(6, (req.duration_hours or 20) // 5))
    steps = [
        ("Introduction", "Overview and environment setup"),
        ("Core Concepts", "Fundamentals and syntax"),
        ("Practice", "Hands-on exercises"),
        ("Advanced Topics", "Patterns, performance, and best practices"),
        ("Final Project", "Build a complete application"),
    ][:count]
    modules = [
        {
            "title": f"{tech}: {label}",
            "description": desc,
            "lessons": [
                {
                    "title": f"{tech} {topic}",
                    "type": "lesson",
                    "estimated_minutes": 30,
                }
                for topic in ([label] * 3)
            ],
        }
        for label, desc in steps
    ]
    return {
        "title": f"{tech} — {level} Course",
        "description": (
            f"A {level.lower()} learning path for {tech}, generated by the "
            "CodeSpectra AI Course Factory."
        ),
        "level": level,
        "estimated_hours": req.duration_hours or 20,
        "modules": modules,
        "assessments": True if req.include_assessments else False,
        "certificate": True if req.include_certificate else False,
    }


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


# ── Text-to-CAD Synthesis ───────────────────────────────────────

async def handle_text_to_cad(request: Request, req: TextToCadReq) -> dict[str, Any]:
    """Synthesize CAD brief, geometric constraints, parametric code, and item payload from text prompt."""
    await check_rate_limit(f"text-to-cad:{client_ip(request)}", 20, 60)
    
    system = (
        "You are an expert mechanical engineering CAD designer and AI authoring tool. "
        "Given a user prompt for a 3D mechanical part, generate JSON ONLY with these fields:\n"
        "- cad_brief: Detailed technical drafting brief with GD&T requirements\n"
        "- constraints: array of objects with { name: string, target_value: float, tolerance: float, unit: string }\n"
        "- parametric_code: executable build123d/CadQuery Python script\n"
    )
    
    user_prompt = (
        f"Prompt: {req.prompt}\n"
        f"Standard: {req.region_standard}\n"
        f"Unit System: {req.unit_system}\n"
        f"Return ONLY valid JSON."
    )
    
    ai_parsed = None
    try:
        chat = build_chat(
            req.model_role or "reasoning",
            f"text-to-cad:{abs(hash(req.prompt)) % 10**8}",
            system,
            request.headers,
            provider_override=req.provider_override,
            model_override=req.model_override,
            endpoint_override=req.endpoint_override,
        )
        buf: list[str] = []
        async for ev in chat.stream_message(UserMessage(text=user_prompt)):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        ai_parsed = parse_json_response("".join(buf))
    except Exception:
        ai_parsed = None

    item_payload = generate_cad_step_payload_from_prompt(
        prompt=req.prompt,
        region_standard=req.region_standard,
        unit_system=req.unit_system,
        viva_required=req.viva_required,
        ai_generated_data=ai_parsed,
    )
    
    return {
        "ok": True,
        "domain_key": "cad_step",
        "prompt": req.prompt,
        "item_payload": item_payload,
    }