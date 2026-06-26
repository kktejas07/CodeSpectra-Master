"""
Internal AI router used by Next.js API routes (server-side only).

Mounted at `/internal/ai/*` on the FastAPI backend. Next.js routes call these
endpoints from inside the cluster (`http://localhost:8001/internal/ai/*`) after
they have authenticated the request with Better Auth.

These endpoints intentionally trust the caller — they are not exposed through
the Kubernetes ingress and the proxy in `server.py` only forwards `/api/*`.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    TextDelta,
    StreamDone,
)

router = APIRouter(prefix="/internal/ai", tags=["internal-ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# ---------- model registry ----------
# Map logical "role" names to (provider, model). Two main models used:
# - "reasoning": Claude Sonnet 4.5 — chatbot, code review, grading, agents
# - "fast":      Gemini 3 Flash    — hints, question generation, analysis
MODEL_REGISTRY: dict[str, tuple[str, str]] = {
    "reasoning": ("anthropic", "claude-sonnet-4-5-20250929"),
    "fast": ("gemini", "gemini-3-flash-preview"),
    "vision": ("gemini", "gemini-3-flash-preview"),
}


def _ensure_key() -> None:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")


def _build_chat(model_role: str, session_id: str, system_message: str) -> LlmChat:
    _ensure_key()
    provider, model = MODEL_REGISTRY.get(model_role, MODEL_REGISTRY["fast"])
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(provider, model)


# =============== /chat (SSE stream) ===============

class ChatHistoryMsg(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatStreamReq(BaseModel):
    session_id: str
    system_message: Optional[str] = None
    history: list[ChatHistoryMsg] = Field(default_factory=list)
    user_message: str
    model_role: str = "reasoning"  # 'reasoning' | 'fast'


DEFAULT_CHAT_SYSTEM = (
    "You are 'Ask CodeSpectra', an expert AI coding assistant embedded in the "
    "CodeSpectra platform. You help developers with: code reviews, debugging, "
    "explaining algorithms, suggesting refactors, and walking through their "
    "scans and submissions. Be concise, practical, and ALWAYS use fenced code "
    "blocks for code. When context about the user's scans, submissions or the "
    "problem they are viewing is provided in the system message, ground your "
    "answer in that context."
)


@router.post("/chat")
async def chat_stream(req: ChatStreamReq) -> StreamingResponse:
    """SSE stream that emits {"delta":"..."} JSON events ending with [DONE]."""
    system = req.system_message or DEFAULT_CHAT_SYSTEM
    chat = _build_chat(req.model_role, req.session_id, system)

    # Replay history so the model has context across turns.
    # emergentintegrations keeps session state internally per session_id,
    # but to be deterministic across stateless servers we prepend history
    # into the system message as a transcript when provided.
    if req.history:
        transcript = "\n\nPrior conversation transcript:\n" + "\n".join(
            f"{m.role.upper()}: {m.content}" for m in req.history[-12:]
        )
        chat = _build_chat(req.model_role, req.session_id, system + transcript)

    async def event_stream() -> AsyncGenerator[bytes, None]:
        try:
            user_msg = UserMessage(text=req.user_message)
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n".encode()
                elif isinstance(ev, StreamDone):
                    break
            yield b"data: [DONE]\n\n"
        except Exception as e:  # noqa: BLE001
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


# =============== /complete (non-stream JSON) ===============

class CompleteReq(BaseModel):
    session_id: str = "default"
    system_message: str
    user_message: str
    model_role: str = "fast"
    response_format: str = "text"  # 'text' | 'json'


@router.post("/complete")
async def complete(req: CompleteReq) -> dict[str, Any]:
    chat = _build_chat(req.model_role, req.session_id, req.system_message)
    buf: list[str] = []
    try:
        async for ev in chat.stream_message(UserMessage(text=req.user_message)):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    raw = "".join(buf).strip()
    if req.response_format == "json":
        parsed = _parse_json_response(raw)
        return {"ok": True, "raw": raw, "json": parsed}
    return {"ok": True, "text": raw}


def _parse_json_response(raw: str) -> Any:
    """Best-effort JSON extraction (handles ```json fences)."""
    s = raw.strip()
    if s.startswith("```"):
        # strip fences
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip("`").strip()
    # Find first { or [
    for i, ch in enumerate(s):
        if ch in "{[":
            try:
                return json.loads(s[i:])
            except Exception:  # noqa: BLE001
                # Try trimming trailing junk
                for j in range(len(s), i, -1):
                    try:
                        return json.loads(s[i:j])
                    except Exception:  # noqa: BLE001
                        continue
                break
    try:
        return json.loads(s)
    except Exception:  # noqa: BLE001
        return None


# =============== /hints (smart progressive hints) ===============

class HintsReq(BaseModel):
    problem_title: str
    problem_statement: str
    language: str = "python"
    current_code: Optional[str] = None
    hint_level: int = 1  # 1=nudge, 2=approach, 3=pseudo-code, 4=solution


@router.post("/hints")
async def smart_hints(req: HintsReq) -> dict[str, Any]:
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
    chat = _build_chat("fast", f"hints:{req.problem_title}:{req.hint_level}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return {"hint_level": req.hint_level, "hint": "".join(buf).strip()}


# =============== /code-review (deep AI review of code) ===============

class CodeReviewReq(BaseModel):
    code: str
    language: str = "javascript"
    context: Optional[str] = None  # e.g., scan issues summary


@router.post("/code-review")
async def code_review(req: CodeReviewReq) -> dict[str, Any]:
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
    chat = _build_chat("reasoning", f"review:{abs(hash(req.code))%10**8}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    raw = "".join(buf).strip()
    parsed = _parse_json_response(raw) or {"summary": raw, "concerns": [], "strengths": [], "suggestions": [], "overall_rating": 7}
    return parsed


# =============== /code-analysis (auto on submission) ===============

class CodeAnalysisReq(BaseModel):
    code: str
    language: str = "python"
    problem_title: Optional[str] = None
    passed_tests: Optional[int] = None
    total_tests: Optional[int] = None


@router.post("/code-analysis")
async def code_analysis(req: CodeAnalysisReq) -> dict[str, Any]:
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
    chat = _build_chat("fast", f"analysis:{abs(hash(req.code))%10**8}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = _parse_json_response("".join(buf)) or {}
    return parsed


# =============== /grade (smart grading by rubric) ===============

class GradeReq(BaseModel):
    code: str
    language: str = "python"
    problem_title: Optional[str] = None
    rubric: dict[str, int]  # criterion -> max points (e.g., {"correctness":40, ...})
    passed_tests: Optional[int] = None
    total_tests: Optional[int] = None


@router.post("/grade")
async def grade(req: GradeReq) -> dict[str, Any]:
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
    chat = _build_chat("reasoning", f"grade:{abs(hash(req.code))%10**8}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = _parse_json_response("".join(buf)) or {}
    return parsed


# =============== /generate-problem (admin Question Generator) ===============

class GenerateProblemReq(BaseModel):
    role: str = "Software Engineer"
    difficulty: str = "medium"  # easy | medium | hard
    topics: list[str] = Field(default_factory=list)
    language_hint: str = "python"


@router.post("/generate-problem")
async def generate_problem(req: GenerateProblemReq) -> dict[str, Any]:
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
    chat = _build_chat("reasoning", f"qgen:{req.role}:{req.difficulty}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = _parse_json_response("".join(buf)) or {}
    return parsed


# =============== /skill-insights (Skill Analytics) ===============

class SkillInsightsReq(BaseModel):
    user_name: Optional[str] = None
    submissions_summary: list[dict[str, Any]]  # [{problem, difficulty, passed, total, time_ms, language, topics}]


@router.post("/skill-insights")
async def skill_insights(req: SkillInsightsReq) -> dict[str, Any]:
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
    chat = _build_chat("fast", f"insights:{req.user_name or 'anon'}", system)
    buf: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    parsed = _parse_json_response("".join(buf)) or {}
    return parsed


# =============== /identity-verify (compare selfie vs id photo) ===============

class IdentityVerifyReq(BaseModel):
    selfie_data_url: str  # data:image/png;base64,...
    id_photo_data_url: str
    candidate_name: Optional[str] = None


@router.post("/identity-verify")
async def identity_verify(req: IdentityVerifyReq) -> dict[str, Any]:
    """
    Use Gemini vision to compare a live selfie against a government ID photo.
    Returns a confidence score (0-100) and a decision.
    """
    # Note: emergentintegrations supports image input via UserMessage(text=, image_url=)
    # If that fails on some providers we fall back to a textual challenge prompt.
    try:
        from emergentintegrations.llm.chat import ImageContent  # type: ignore
        has_image = True
    except Exception:  # noqa: BLE001
        has_image = False

    system = (
        "You are an identity verification assistant. Compare the SELFIE and ID PHOTO "
        "and respond with JSON ONLY: { match: boolean, confidence: number(0-100), "
        "reasoning: string, warnings: string[] }. Be conservative: only return "
        "match=true with confidence>=70."
    )

    chat = _build_chat("vision", "identity-verify", system)

    if has_image:
        try:
            user_msg = UserMessage(
                text=f"Candidate: {req.candidate_name or 'n/a'}. Compare these two images.",
                image_contents=[
                    ImageContent(image_base64=_strip_data_url(req.selfie_data_url)),
                    ImageContent(image_base64=_strip_data_url(req.id_photo_data_url)),
                ],
            )  # type: ignore[call-arg]
            buf: list[str] = []
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    buf.append(ev.content)
                elif isinstance(ev, StreamDone):
                    break
            parsed = _parse_json_response("".join(buf)) or {}
            if parsed:
                return parsed
        except Exception as e:  # noqa: BLE001
            return {
                "match": False,
                "confidence": 0,
                "reasoning": f"vision-unavailable: {e}",
                "warnings": ["Vision comparison failed — manual review required."],
            }

    return {
        "match": False,
        "confidence": 0,
        "reasoning": "Vision comparison unsupported in this environment.",
        "warnings": ["Manual review required."],
    }


def _strip_data_url(data_url: str) -> str:
    if data_url.startswith("data:"):
        comma = data_url.find(",")
        return data_url[comma + 1 :] if comma > 0 else data_url
    return data_url


# =============== /agent (multi-step agentic loop) ===============

class AgentReq(BaseModel):
    goal: str
    code: str
    language: str = "python"
    max_steps: int = 3


@router.post("/agent")
async def agentic_fix(req: AgentReq) -> dict[str, Any]:
    """
    Simple agentic loop: analyze → fix → re-analyze → return final code + step log.
    """
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
        chat = _build_chat("reasoning", f"agent:{abs(hash(req.code))%10**8}:{step}", system)
        buf: list[str] = []
        async for ev in chat.stream_message(UserMessage(text=user)):
            if isinstance(ev, TextDelta):
                buf.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        parsed = _parse_json_response("".join(buf)) or {}
        steps.append({"step": step + 1, "thought": parsed.get("thought", ""), "summary": parsed.get("summary", "")})
        nxt = parsed.get("next_code")
        if isinstance(nxt, str) and nxt.strip():
            code = nxt
        final_summary = parsed.get("summary") or final_summary
        if parsed.get("done") is True:
            break
        await asyncio.sleep(0.05)
    return {"final_code": code, "steps": steps, "summary": final_summary}
