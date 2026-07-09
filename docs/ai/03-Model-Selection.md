---
title: Model Selection
description: Criteria and decision matrix for LLM model selection across CodeSpectra features
last_auto_updated: 2026-07-08
---

# Model Selection

> **Auto-update:** This file is maintained by automated audit. When model assignments change, update this document to match.

---

## Model Registry (FastAPI Backend)

Defined in `backend/ai_router.py:37-41`:

```python
MODEL_REGISTRY: dict[str, tuple[str, model]] = {
    "reasoning": ("anthropic", "claude-sonnet-4-5-20250929"),
    "fast":       ("gemini",    "gemini-3-flash-preview"),
    "vision":     ("gemini",    "gemini-3-flash-preview"),
}
```

### Role: `reasoning` → Claude Sonnet 4.5

| Attribute | Value |
|-----------|-------|
| Provider | Anthropic |
| Model ID | `claude-sonnet-4-5-20250929` |
| API Base | `https://api.anthropic.com/v1/messages` |
| API Key | `ANTHROPIC_API_KEY` (env) / `x-anthropic-api-key` header |

**Used by:**
- `/internal/ai/chat` — Conversational chat (default role)
- `/internal/ai/code-review` — Deep code analysis
- `/internal/ai/grade` — Rubric-based grading
- `/internal/ai/agent` — Multi-step agentic loop
- `/internal/ai/generate-problem` — Question generation

**Rationale:** Claude Sonnet 4.5 provides the strongest reasoning capability for tasks requiring nuanced judgment (code review, grading) and multi-step agentic behavior.

### Role: `fast` → Gemini 3 Flash

| Attribute | Value |
|-----------|-------|
| Provider | Google |
| Model ID | `gemini-3-flash-preview` |
| API Base | `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` |
| API Key | `GEMINI_API_KEY` (env) / `x-gemini-api-key` header → `x-goog-api-key` |

**Used by:**
- `/internal/ai/hints` — Smart progressive hints
- `/internal/ai/code-analysis` — Submission analysis
- `/internal/ai/skill-insights` — Skills analytics
- `/internal/ai/complete` — Non-streaming completions (default role)

**Rationale:** Gemini 3 Flash offers low latency and high throughput for simpler, high-volume tasks where raw reasoning depth is less critical.

### Role: `vision` → Gemini 3 Flash

| Attribute | Value |
|-----------|-------|
| Provider | Google |
| Model ID | `gemini-3-flash-preview` |

**Used by:**
- `/internal/ai/identity-verify` — Selfie vs. ID photo comparison

**Note:** While the `vision` role is in the registry, the code has a fallback path if the `ImageContent` class cannot be imported. Vision is only supported when using the Gemini provider path in `ai_client.py`.

---

## Vercel AI SDK (Direct OpenAI)

This is a **completely separate** AI integration that does not use the Emergent gateway or the FastAPI backend.

| Attribute | Value |
|-----------|-------|
| Provider | OpenAI (direct) |
| Model | `gpt-4-turbo` |
| SDK | `@ai-sdk/openai` v3.x + `ai` v6.x |
| API Key | `OPENAI_API_KEY` (set via environment) |

**Used by:**
- `frontend/lib/interview-service.ts` — Interview question generation
- `frontend/lib/interview-service.ts` — Answer quality analysis
- `frontend/lib/interview-service.ts` — Performance feedback generation

**Details:**
- Uses `generateObject()` from the `ai` SDK for structured output
- Validates output against Zod schemas (`FollowUpQuestionSchema`, `FeedbackSchema`)
- Called in loops for multi-dimension feedback (6 calls per interview)

---

## Selection Decision Matrix

| Feature | Model | Role | Primary Consideration |
|---------|-------|------|----------------------|
| Chat (conversational) | Claude Sonnet 4.5 | `reasoning` | Nuance, context handling |
| Code Review | Claude Sonnet 4.5 | `reasoning` | Deep analysis required |
| Grading | Claude Sonnet 4.5 | `reasoning` | Fairness, rubric adherence |
| Agent (multi-step) | Claude Sonnet 4.5 | `reasoning` | Complex multi-step reasoning |
| Generate Problem | Claude Sonnet 4.5 | `reasoning` | Creativity + structure |
| Hints | Gemini 3 Flash | `fast` | Low latency, high volume |
| Code Analysis | Gemini 3 Flash | `fast` | Speed over depth |
| Skill Insights | Gemini 3 Flash | `fast` | Batch processing |
| Complete (non-stream) | Gemini 3 Flash | `fast` | Generic fast completions |
| Identity Verify | Gemini 3 Flash | `vision` | Vision capability required |
| Interview Service | GPT-4 Turbo | (direct SDK) | Structured output via `generateObject` |

---

## Key Finding: Hardcoded Model Strings

Model identifiers are **hardcoded strings** in `MODEL_REGISTRY`:

```python
MODEL_REGISTRY: dict[str, tuple[str, str]] = {
    "reasoning": ("anthropic", "claude-sonnet-4-5-20250929"),
    "fast":       ("gemini",    "gemini-3-flash-preview"),
    "vision":     ("gemini",    "gemini-3-flash-preview"),
}
```

**Impact:**
- Changing a model requires modifying the source code and redeploying both the FastAPI service
- No runtime model configuration or feature flags
- No A/B testing capability for model selection
- No fallback model if the primary model is unavailable
- The Vercel AI SDK path (GPT-4 Turbo) is similarly hardcoded in `interview-service.ts`

---

## References

- `backend/ai_router.py:37-41` — Model registry definition
- `backend/ai_client.py:23-164` — Direct provider implementations (Anthropic + Gemini)
- `frontend/lib/interview-service.ts` — OpenAI GPT-4 Turbo via Vercel AI SDK
- `frontend/lib/ai-inventory.ts:255-283` — LLM model inventory (Claude, GPT-4o-mini, Gemini Nano Banana)
