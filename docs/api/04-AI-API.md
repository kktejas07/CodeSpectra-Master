> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# AI API

All AI endpoints require authentication via `getAPIUser()` (any authenticated user) unless otherwise noted.

## POST /api/ai/chat

SSE-streaming chat with "Ask CodeSpectra" assistant. Persists conversation in `ai_chat_messages`.

**Request Body:**
```json
{
  "session_id": "uuid",          // Optional — omit to create new session
  "message": "How do I fix this null pointer?",
  "context_mode": "current_scan", // "none" | "current_scan" | "rag"
  "current_scan_id": "uuid",     // Required if context_mode=current_scan
  "problem_slug": "two-sum"      // Optional problem context
}
```

**Response**: SSE stream (`text/event-stream`):
```
data: {"session_id": "uuid..."}
data: {"delta": "You can fix the null pointer by..."}
data: {"delta": " checking if the variable is null"}
data: [DONE]
```

**Behavior:**
- New session: Creates document in `ai_chat_sessions` with title = first 60 chars of message
- Existing session: Validates ownership (`user_id` match)
- Loads last 20 messages as conversation history
- Persists user message immediately, assistant message on stream end
- Context modes: `rag` loads last 5 scans; `current_scan` loads specific scan snippet

**Auth**: `getAPIUser()`

## GET /api/ai/chat

Fetch chat history.

| Query Param | Description |
|-------------|-------------|
| `session_id` | (Optional) Get messages for a session. Omit to list recent sessions. |

**Response (with session_id):**
```json
{
  "session": { "id": "uuid", "title": "...", "model_role": "reasoning" },
  "messages": [
    { "id": "uuid", "role": "user", "content": "...", "created_at": "..." }
  ]
}
```

**Response (without session_id) — recent sessions list:**
```json
{
  "sessions": [
    { "id": "uuid", "title": "...", "user_id": "uuid", "updated_at": "..." }
  ]
}
```

## POST /api/ai/code-review

AI-powered code review. Returns structured feedback.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "code": "function foo() { ... }",
  "language": "javascript",
  "scan_id": "uuid",
  "context": "Optional extra context"
}
```

**Response (200):**
```json
{
  "success": true,
  "fixes": [],
  "degraded": false,
  "review_id": "uuid"
}
```

The `result` (from LLM) is persisted to `ai_code_reviews` collection under the `result` field, which contains:
```json
{
  "summary": "string",
  "strengths": ["string"],
  "concerns": [{"severity": "critical|major|minor", "title": "string", "detail": "string", "line": 42}],
  "suggestions": ["string"],
  "overall_rating": 7
}
```

## POST /api/ai/code-analysis

Analyze a code submission for complexity and edge cases.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "code": "def solve(): ...",
  "language": "python",
  "problem_title": "Two Sum",
  "passed_tests": 3,
  "total_tests": 4
}
```

**Response (200):**
```json
{
  "time_complexity": "O(n)",
  "space_complexity": "O(n)",
  "efficiency_score": 85,
  "edge_cases_covered": ["empty input"],
  "missing_edge_cases": ["duplicate values"],
  "readability_score": 90,
  "summary": "Good solution with efficient hash map approach."
}
```

## POST /api/ai/grade

Grade a submission using an AI rubric.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "code": "def solve(): ...",
  "language": "python",
  "problem_title": "Two Sum",
  "problem_slug": "two-sum",
  "submission_id": "uuid",
  "rubric": { "correctness": 40, "efficiency": 20, "readability": 15, "edge_cases": 15, "style": 10 },
  "passed_tests": 3,
  "total_tests": 4
}
```

**Response (200):**
```json
{
  "scores": { "correctness": 35, "efficiency": 18, "readability": 12, "edge_cases": 10, "style": 9 },
  "feedback": { "correctness": "..." },
  "total": 84,
  "max": 100,
  "letter_grade": "B",
  "overall_feedback": "...",
  "grade_id": "uuid"
}
```

Result persisted to `ai_grades` collection.

## POST /api/ai/hints

Progressive smart hints for a coding problem.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "problem_slug": "two-sum",
  "hint_level": 1,
  "current_code": "def solve(): ...",
  "language": "python"
}
```

| Level | Description |
|-------|-------------|
| 1 | Non-spoiler nudge (data structure insight) |
| 2 | High-level approach + complexity |
| 3 | Pseudo-code |
| 4 | Full working solution |

**Response (200):**
```json
{
  "hint_level": 1,
  "hint": "Consider what data structure gives you O(1) lookups..."
}
```

## POST /api/ai/generate-problem

AI generates a new coding problem (admin only).

**Auth**: `requireAdmin()` (superadmin or tenant_admin)

**Request Body:**
```json
{
  "role": "Software Engineer",
  "difficulty": "medium",
  "topics": ["arrays", "hash maps"],
  "language_hint": "python",
  "publish": true
}
```

With `publish: true`, the generated problem is automatically inserted into the `problems` collection.

**Response (200):**
```json
{
  "problem": {
    "slug": "unique-problem-slug",
    "title": "Problem Title",
    "difficulty": "medium",
    "topics": ["Arrays", "Hash Maps"],
    "statement_md": "...",
    "test_cases": [...],
    "starter_code": { "python": "...", "javascript": "...", "cpp": "...", "java": "..." }
  },
  "published_problem_id": "uuid" // null if not published
}
```

Unpublished results stored in `ai_generated_problems` collection.

## POST /api/ai/agent

Multi-step agentic code fix loop.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "goal": "Fix the null pointer exception in the getUser function",
  "code": "function getUser(id) { ... }",
  "language": "javascript",
  "max_steps": 3
}
```

**Response (200):**
```json
{
  "final_code": "function getUser(id) { ... fixed ... }",
  "steps": [
    { "step": 1, "thought": "The issue is...", "summary": "Added null check" },
    { "step": 2, "thought": "...", "summary": "..." }
  ],
  "summary": "Fixed null pointer by adding guard clause"
}
```

## POST /api/ai/codebase-chat

Chat about a specific codebase (related to GitHub scans).

**Auth**: `getAPIUser()`

## POST /api/ai/fixes/apply-batch

Apply multiple suggested fixes in batch.

## POST /api/ai/fixes/[id]/apply

Apply a single suggested fix.

## POST /api/ai/fixes/[id]/unapply

Revert a previously applied fix.

## Internal AI Endpoints (not exposed externally)

These endpoints are called by Next.js API routes internally via `POST http://localhost:8001/internal/ai/*`:

| Endpoint | Called By | Provider | Model |
|----------|-----------|----------|-------|
| `/internal/ai/chat` | `/api/ai/chat` | Anthropic | Claude Sonnet 4.5 |
| `/internal/ai/complete` | (internal only) | Gemini | Gemini 3 Flash |
| `/internal/ai/hints` | `/api/ai/hints` | Gemini | Gemini 3 Flash |
| `/internal/ai/code-review` | `/api/ai/code-review` | Anthropic | Claude Sonnet 4.5 |
| `/internal/ai/code-analysis` | `/api/ai/code-analysis` | Gemini | Gemini 3 Flash |
| `/internal/ai/grade` | `/api/ai/grade` | Anthropic | Claude Sonnet 4.5 |
| `/internal/ai/generate-problem` | `/api/ai/generate-problem` | Anthropic | Claude Sonnet 4.5 |
| `/internal/ai/skill-insights` | `/api/analytics/skills` | Gemini | Gemini 3 Flash |
| `/internal/ai/identity-verify` | `/api/identity/verify` | Gemini | Gemini 3 Flash (Vision) |
| `/internal/ai/agent` | `/api/ai/agent` | Anthropic | Claude Sonnet 4.5 |

## Model Registry (`backend/ai_router.py`)

| Model Role | Provider | Model ID |
|------------|----------|----------|
| `reasoning` | anthropic | `claude-sonnet-4-5-20250929` |
| `fast` | gemini | `gemini-3-flash-preview` |
| `vision` | gemini | `gemini-3-flash-preview` |

All calls resolve provider keys from `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` env vars or `x-anthropic-api-key` / `x-gemini-api-key` request headers (configurable in Settings → Integrations → AI Providers).
