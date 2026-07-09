---
title: Coding Standards
description: Language-specific coding standards and conventions for the CodeSpectra codebase
last_auto_updated: 2026-07-08
---

# Coding Standards

> **Auto-update:** This file is maintained by automated audit. When conventions change, update this document to match.

---

## TypeScript / React (Frontend)

### Configuration

- **`tsconfig.json`**: `strict: true` enabled — all strict checks are active
- **Target**: `ES6`
- **Module resolution**: `bundler`
- **JSX**: `react-jsx` (React 19.2.7)
- **Path alias**: `@/*` maps to project root

### TypeScript Rules

1. **`strict: true`** — No exceptions. All strict checks (noImplicitAny, strictNullChecks, etc.) are enforced.
2. **No `any`** — Use `unknown` instead of `any`. Cast with `as` only when necessary.
3. **Named exports** — Always use named exports for components and utilities. Avoid `export default`.
4. **Interfaces over types** — Use `interface` for object shapes, `type` for unions and utility types.
5. **Functional components** — Use `const Component: React.FC<Props> = (...) => { ... }` pattern.
6. **Readonly props** — Mark component props `readonly` where applicable.

### Naming Conventions

| Convention | Pattern | Example |
|-----------|---------|---------|
| Files | `kebab-case` | `ai-code-review-widget.tsx` |
| Components | `PascalCase` | `AiCodeReviewWidget` |
| Functions | `camelCase` | `fetchCategory()` |
| Variables | `camelCase` | `sessionId` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_CHAT_SYSTEM` |
| Types/Interfaces | `PascalCase` | `ChatHistoryMsg` |
| Boolean props | `is/has/should` prefix | `isActive`, `hasError` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleChange` |

### File Organization

```
lib/          — Shared utilities, database clients, API wrappers
  db/         — MongoDB collection repositories
  ai/         — AI backend client wrappers
components/   — React components (shadcn/ui + custom)
  ui/         — Atomic UI components (buttons, inputs, etc.)
  dashboard/  — Dashboard-specific components
  ai/         — AI feature components
  scanner/    — Scanner feature components
app/
  api/        — Next.js API route handlers
    ai/       — AI-specific API routes
  dashboard/  — Dashboard page routes
  (auth)/     — Auth-related pages
```

### API Route Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as InterfaceType
    // ... handler logic
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
}
```

### Error Handling

1. **Auth-first** — Check authentication at the top of every API route
2. **Catch JSON parse errors** — Return 400 for malformed request bodies
3. **Input validation** — Check required fields before processing
4. **Upstream errors** — Wrap external service calls in try/catch, return 502
5. **No silent failures** — Log errors with `console.error()` at minimum

---

## Python / FastAPI (Backend)

### Configuration

- **Python**: 3.11+
- **Framework**: FastAPI 0.110.1
- **Validation**: Pydantic v2
- **Async**: All endpoints are async
- **Linting**: flake8, mypy, isort, black

### Naming Conventions

| Convention | Pattern | Example |
|-----------|---------|---------|
| Files | `snake_case` | `ai_router.py` |
| Classes | `PascalCase` | `DirectAiClient` |
| Functions | `snake_case` | `_build_chat()` |
| Variables | `snake_case` | `system_message` |
| Constants | `UPPER_SNAKE_CASE` | `MODEL_REGISTRY` |
| Private helpers | `_` prefix | `_ensure_key()` |
| Pydantic models | `PascalCase` + `Req` suffix | `ChatStreamReq` |

### FastAPI Patterns

1. **Router per domain** — Use `APIRouter(prefix=..., tags=...)` for logical grouping
2. **Pydantic request models** — All request bodies use `BaseModel` subclasses
3. **Response models** — Use `dict[str, Any]` or Pydantic response models
4. **Streaming** — Use `StreamingResponse` with async generators for SSE
5. **Exception handling** — Raise `HTTPException` with descriptive `detail`

### Pydantic Validation

```python
from pydantic import BaseModel, Field

class ChatStreamReq(BaseModel):
    session_id: str
    system_message: Optional[str] = None
    history: list[ChatHistoryMsg] = Field(default_factory=list)
    user_message: str
    model_role: str = "reasoning"
```

### Error Handling

1. **`_ensure_key()`** — Guard pattern for required configuration
2. **`HTTPException`** — Standard error responses with 4xx/5xx codes
3. **LLM errors** — Caught at the endpoint level, wrapped as 500 responses
4. **No bare exceptions** — Use `except Exception as e: raise HTTPException(...)`
5. **BLE001 suppressed** — `# noqa: BLE001` on broad exception catches (existing pattern, prefer specific exceptions in new code)

---

## General Conventions

### Git Commit Messages

See `docs/Standards/03-Git-Strategy.md` for full details.

### Comments

- Avoid `# noqa: BLE001` in new code — catch specific exceptions instead
- No TODO comments without a tracking issue reference
- Docstrings only on public APIs (FastAPI endpoints, exported functions)
- Complex logic should explain WHY, not WHAT

### Imports

- TypeScript: Group by external → internal, sorted alphabetically
- Python: stdlib → third-party → local (per isort convention)

### Null Safety (TypeScript)

Always guard `.toLowerCase()`, `.toUpperCase()`, `.charAt()` on potentially null/undefined values with `|| ''`:

```typescript
// BAD — crashes if name is undefined
item.name.toLowerCase()

// GOOD — safe
(item.name || '').toLowerCase()
```

---

## References

- `frontend/tsconfig.json` — TypeScript configuration
- `frontend/package.json` — Dependencies and scripts
- `backend/requirements.txt` — Python dependencies
- `backend/ai_router.py` — FastAPI patterns reference
- `frontend/app/api/ai/chat/route.ts` — Next.js API route patterns
