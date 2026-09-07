> **Public Documentation**
> **Last Updated**: 2026-09-06
> **Audience**: Everyone (no login required)

# API Overview

CodeSpectra provides a REST API for programmatic access to platform features. This document covers authentication, base URL, rate limits, and a quick example.

---

## Base URL

All API endpoints live on the same origin — there is no separate API host or version prefix:

```
https://codespectra.ai/api
```

Example endpoint: `GET https://codespectra.ai/api/problems`

---

## Authentication

The API uses **session authentication**. Your browser session cookie is sent automatically with API requests.

### Requirements
- You must be logged in to CodeSpectra
- API requests must include `credentials: 'include'` (for `fetch`) or equivalent
- Session cookies are automatically managed by your browser

### Note on API Tokens
Dedicated API key authentication is not yet available. All programmatic access currently requires an active browser session. Token-based access for scripts and integrations is on the roadmap.

---

## Rate Limiting

Rate limiting protects shared resources. There are two layers:

- **Global edge limit**: 240 requests per minute per client across `/api/*`
- **Stricter per-route limits** on sensitive endpoints (login, signup, AI generation, billing) — these return `429 Too Many Requests` with a `Retry-After` header telling you when to retry

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```

If you exceed a limit, back off and retry after the indicated delay.

---

## Response Format

All responses are JSON. Shapes vary by endpoint — there is no single envelope, so check each endpoint's fields:

**Example: List Problems** (`GET /api/problems?difficulty=easy&limit=2`)

```bash
curl "https://codespectra.ai/api/problems?difficulty=easy&limit=2" \
  -H "Accept: application/json" \
  --cookie "YOUR_SESSION_COOKIE"
```

```json
{
  "data": [
    {
      "id": "two-sum",
      "slug": "two-sum",
      "title": "Two Sum",
      "difficulty": "easy",
      "topics": ["arrays"]
    }
  ],
  "count": 1
}
```

Errors look like this:

```json
{
  "error": "Unauthorized"
}
```

Common status codes: `200` success · `400` bad request · `401` not logged in · `403` insufficient role · `404` not found · `429` rate limited.

---

## API Endpoints Overview

All paths below are relative to `https://codespectra.ai/api`. Most require login.

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Problems | `GET /problems` | List coding problems (`difficulty`, `topics`, `search`, `limit` filters) |
| Problems | `GET /problems/[slug]` | Get problem details |
| Submissions | `POST /submissions` | Submit a solution |
| Submissions | `GET /submissions?problem_slug=` | List your submissions |
| Scanner | `POST /analyze-code` | Trigger a code scan |
| Scanner | `GET /scanner/issues` | List scan findings |
| Quality Gates | `GET /quality-gates` | List quality gates |
| User | `GET /auth/me` | Get current user profile |
| User | `GET /user/stats` | Get user statistics |
| Leaderboard | `GET /leaderboard?scope=global` | Get top users |
| Code execution | `POST /execute-code` | Execute code in the sandbox |
| Health | `GET /health` | Service status (no login required) |

> **Note**: This table is a starting point, not an exhaustive reference. Endpoint availability can change as the platform evolves.

---

## Webhooks (Inbound Integrations)

CodeSpectra receives webhooks from integrated services (GitHub, Razorpay/Stripe billing, Postal email, Didit identity). These are configured in **Admin → Platform Settings → Integrations** — see the [Integrations Guide](/docs/user/integrations-guide).

Outbound webhooks (CodeSpectra calling your URL on events) are not yet available.

---

## MCP Server

CodeSpectra exposes a Model Context Protocol (MCP) server at `/api/mcp` for AI tool integration. Available tools:

| Tool | Description |
|---|---|
| `list_problems` | List problems with filters |
| `get_problem` | Get problem by slug |
| `run_code` | Execute code in sandbox |
| `get_user_xp` | Get user XP and level |
| `get_leaderboard` | Get top earners |
