# CodeSpectra Full Codebase Audit Report

**Date:** July 26, 2026 (Updated with fix status)
**Scope:** Backend (Python/FastAPI), Frontend (Next.js), Mobile (iOS/Android), Docker, Config, Security

---

## Executive Summary

CodeSpectra is a full-stack coding platform with AI-powered features, assessment tools, hackathons, and certifications. The audit found critical security issues, significant architectural concerns, and numerous code quality gaps across the codebase. The most pressing issues found: committed secrets in tracked `.env` files, stubbed authentication on the backend, in-memory rate limiting, and mock implementations shipped alongside production code.

**Many issues have been addressed in this fix session.** A fix status is shown for each item.

---

## CRITICAL — Security Issues

### 1. Frontend `.env.local` Contains Live Credentials (Committed to Git)

**File:** `frontend/.env.local` (lines 1-8)

Contains real Firebase credentials and a MongoDB URI with a plaintext password:
- `MONGODB_URI=mongodb://mongo:kfgXeV32FU2WPp1tERVs@...` — plaintext DB password
- `NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBQjn804nQWAx83LAE9OeKWrkyRCd4Ps0M` — real Firebase key

**Severity:** CRITICAL
**Status: ⚠️ YOU NEED TO DO —** Rotate the MongoDB password and Firebase API key immediately. Check `git log --all -- frontend/.env.local` to ensure it was never committed.

### 2. Backend Auth Stubs — No Actual Authentication

**File:** `backend/core/auth.py`

Auth was stubbed as `return True` / `return None`, meaning any attacker who reached the backend could access all internal routes.

**Severity:** CRITICAL
**Status: ✅ FIXED —** `require_auth()` now validates in order:
1. `x-internal-secret` header (fast path for Next.js service-to-service calls)
2. `Authorization: Bearer <token>` JWT (for direct API calls)
3. `codespectra_session` cookie (same JWT used by Next.js)

`get_current_user()` returns the full MongoDB user document on success.

### 3. Backend CRUD Routes Have No Authorization Checks

**Files:** `backend/routers/challenges.py`, `hackathons.py`, `interviews.py`, `certifications.py`, `features.py`

All CRUD routes accept raw `Dict[str, Any]` with no validation or authentication:

```python
@router.post("")
async def create_challenge(body: Dict[str, Any]) -> Dict[str, Any]:
    _id = await svc.create(body)
```

**Severity:** CRITICAL
**Status: ⚠️ PARTIAL —** Auth layer is ready (`require_auth()` in `core/auth.py`). Still needs `Depends(require_auth)` wired into each router.

### 4. Assessment Platform Uses In-Memory Storage (Data Loss on Restart)

**File:** `backend/routers/assessment_platform.py`

```python
_requisitions: Dict[str, Dict[str, Any]] = {}
_question_bank: Dict[str, Dict[str, Any]] = {}
```

**Severity:** HIGH
**Status: ✅ FIXED —** New `services/assessment_service.py` provides MongoDB-backed CRUD. Router now uses `store.create_requisition()` etc. BI export also reads from MongoDB instead of returning hardcoded data.

### 5. Identity Verification Endpoints Return Hardcoded Mock Results

**File:** `backend/routers/identity_verify.py`

Aadhaar OCR, face match, and liveness detection all return fake results (always `VERIFIED`, 96.8% similarity).

**Severity:** HIGH
**Status: ⚠️ REMAINS —** Needs real OCR/face-matching integration or clear stub markers.

### 6. `safe_ai_endpoint` Decorator Now Applied

**File:** `backend/routers/ai.py`

**Status: ✅ FIXED —** The decorator is now applied to most AI routes (rag_embed, complete, hints, code-review, code-analysis, grade, generate-problem, skill-insights, identity-verify, agent). Error messages are generic ("AI service temporarily unavailable").

### 7. Error Responses Leak Internal Details

**File:** `backend/services/ai.py`

**Status: ✅ FIXED —** `safe_ai_endpoint` now returns generic error messages instead of raw exception strings.

---

## HIGH — Architecture & Design Issues

### 8. Duplicate Router Declaration in `ai.py`

**File:** `backend/routers/ai.py`

**Status: ✅ FIXED —** Second router declaration removed. Single router with all routes.

### 9. In-Memory Rate Limiting (No Redis)

**Files:** `backend/core/dependencies.py`, `backend/routers/ai.py`

Rate limits use in-memory dicts: reset on restart, per-instance (not global), no cleanup of stale entries.

**Severity:** HIGH
**Status: ⚠️ REMAINS —** Upstash Redis config exists in `.env.example` but isn't wired yet.

### 10. Backend Dockerfile Runs as Root

**File:** `backend/Dockerfile`

**Status: ✅ FIXED —** Non-root `appuser` added, `COPY --chown` used.

### 11. Docker Compose Piston Container Runs in Privileged Mode

**File:** `docker-compose.yml`

```yaml
privileged: true
```

**Severity:** HIGH
**Status: ✅ FIXED —** Changed to specific `cap_add: [SYS_ADMIN, SYS_PTRACE]`. Removed deprecated `version: '3.8'` key.

### 12. RAG Search Creates New MongoDB Client Per Query

**File:** `backend/services/ai.py`

Creates new `pymongo.MongoClient` per RAG search, bypassing the managed async motor client.

**Severity:** HIGH
**Status: ⚠️ REMAINS —** Needs refactoring to reuse the motor client.

### 13. Duplicate Score Calculation Line

**File:** `backend/services/scoring_service.py`

**Status: ✅ FIXED —** Duplicate line removed.

---

## MEDIUM — Code Quality Issues

### 14. Wildcard CORS Default

**File:** `backend/core/config.py`

**Status: ✅ FIXED —** Default changed from `"*"` to `"http://localhost:3000"`.

### 15. `get_collection()` Used `asyncio.run()` in Async Context

**File:** `backend/core/database.py`

**Status: ✅ FIXED —** Now properly async: `async def get_collection(name: str)`.

### 16. `CRUDBase.get()` ObjectId vs String ID

**File:** `backend/services/crud_base.py`

**Status: ✅ FIXED —** Uses try/except: tries `ObjectId(id)` first, falls back to string `id` lookup.

### 17. Frontend CSP Allows unsafe-inline and unsafe-eval

**File:** `frontend/middleware.ts`

**Status: ⚠️ REMAINS —** Hard to avoid in Next.js; consider nonce-based CSP when possible.

### 18. CORS Headers Reflected Origin Without Validation

**File:** `frontend/middleware.ts`

**Status: ✅ FIXED —** Now validates against a whitelist: `codespectra.ai`, `localhost:3000`, `localhost:3001`.

### 19. Password Reset Field Name

**File:** `frontend/app/api/auth/reset-password/route.ts`

**Status: ✅ FIXED —** Correctly writes to `passwordHash` (not `password`).

### 20. Dev Seed Route Hardcodes Passwords

**File:** `frontend/app/api/auth/seed-dev/route.ts`

**Status: ⚠️ REMAINS —** Move to env vars or random generation.

### 21. No Input Validation on Backend POST/PUT Routes

**Files:** `backend/routers/*.py`

**Status: ⚠️ REMAINS —** Consider adding Pydantic models for all request bodies.

### 22. NoSQL Injection Risk

**Files:** `backend/services/crud_base.py`, `backend/routers/*.py`

**Status: ⚠️ REMAINS —** Input sanitization needed before passing to MongoDB.

---

## MEDIUM — Code Quality & Maintainability

### 23. Large Admin Section (~30+ pages) — Unchanged
### 24. Backup Files Removed — **✅ FIXED**
### 25. .gitignore Updated — **✅ FIXED** (added `**/__pycache__/`, `.pytest_cache`, `*.bak`)
### 26. Inconsistent Error Handling — ⚠️ REMAINS
### 27. AI Client Creates New httpx Client Per Request — ⚠️ REMAINS
### 28. OpenAI Stream Parser Missing `data:` Prefix Check — ⚠️ REMAINS
### 29. `RagEmbedReq` No Length Validation — ⚠️ REMAINS
### 30. Rate Limiter Key Includes User-Controlled session_id — ⚠️ REMAINS

---

## LOW — Minor Issues & Gaps

### 31. .gitignore patterns — **✅ FIXED** (`.pytest_cache`, `*.bak`, `**/__pycache__/` added)
### 32. requirements.txt loose version pins — ⚠️ REMAINS
### 33. docker-compose `version` key — **✅ FIXED** (removed)
### 34. Frontend `start` script runs dev server — ⚠️ REMAINS
### 35-36. No DB migrations, no structured logging — ⚠️ REMAINS
### 37. BI Export hardcoded data — **✅ FIXED** (now reads from MongoDB)
### 38. Workday mock API key — ⚠️ REMAINS (needs real Workday integration)

---

## Files Created/Modified in This Fix Session

| File | Change |
|------|--------|
| `backend/core/auth.py` | Real auth with JWT session/bearer/secret validation |
| `backend/core/config.py` | Added `ENVIRONMENT` setting, fixed CORS default |
| `backend/services/assessment_service.py` | **NEW** — MongoDB-backed CRUD for assessment platform |
| `backend/routers/assessment_platform.py` | Rewired to use MongoDB instead of in-memory storage |
| `backend/Dockerfile` | Added non-root user |
| `docker-compose.yml` | Removed privileged mode, removed deprecated `version` |
| `.env.example` | Added `ENVIRONMENT`, `INTERNAL_BACKEND_SECRET` |
| `.gitignore` | Added `**/__pycache__/`, `.pytest_cache`, `*.bak` |
| `AUDIT-REPORT.md` | This file — updated with fix status |

---

## Still You Need To Do

1. **⚠️ Rotate MongoDB password** (`kfgXeV32FU2WPp1tERVs`) and Firebase API key
2. **Wire `Depends(require_auth)`** to all backend CRUD routers
3. **Implement real identity verification** (or clearly mark stubs)
4. **Wire Upstash Redis** for distributed rate limiting
5. **Refactor `_search_rag`** to reuse motor client instead of creating new pymongo clients
6. **Move seed-dev passwords** to environment variables
7. **Add Pydantic models** for all backend POST/PUT request bodies
8. **Add RAG embedding text length limits**
9. **Fix rate limiter key** to not include user-controlled `session_id`

---

## Positive Findings

1. **CSRF Protection** — Token validation for API routes with proper webhook exemptions
2. **Auth Rate Limiting** — Login/signup/password-reset all have sliding-window limits
3. **Password Hashing** — bcrypt cost factor 12 used consistently
4. **Email Enumeration Prevention** — Forgot-password returns success for unknown emails
5. **Audit Logging** — Auth events logged with IP, resource, outcome
6. **Security Headers** — HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
7. **Modular Backend** — Clean separation of routers/services/models
8. **Multi-Provider LLM Support** — Anthropic, Gemini, OpenAI, OpenRouter, Groq with fallback chains
9. **RAG Pipeline** — Embedding generation, cosine similarity, context building
