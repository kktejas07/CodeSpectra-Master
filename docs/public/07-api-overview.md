> **Public Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Everyone (no login required)

# API Overview

CodeSpectra provides a REST API for programmatic access to platform features. This document covers authentication, base URL, rate limits, and a quick example.

For the complete API reference, including all endpoints, request schemas, and response types, visit the full API documentation at [docs.codespectra.ai/api](https://docs.codespectra.ai/api).

---

## Base URL

```
https://api.codespectra.ai/v1
```

---

## Authentication

The API uses Bearer token authentication. Include your API token in the `Authorization` header:

```
Authorization: Bearer cs_api_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Getting an API Token

1. Log in to your CodeSpectra account
2. Navigate to **Settings > API Tokens**
3. Click **Generate New Token**
4. Copy your token and store it securely — it will only be shown once

> **Security note**: Treat your API token like a password. Do not share it, commit it to source control, or expose it in client-side code.

---

## Rate Limiting

| Plan | Rate Limit |
|------|-----------|
| Free | 10 requests per minute |
| Pro | 60 requests per minute |
| Enterprise | 300 requests per minute |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1625738400
```

On rate limit exceeded, the API returns `429 Too Many Requests`.

---

## Response Format

All responses are JSON. Successful responses follow this structure:

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

Error responses:

```json
{
  "error": {
    "code": "not_found",
    "message": "The requested resource was not found",
    "details": null
  }
}
```

---

## Example: List Problems

Here's a simple example using cURL to list available coding problems:

**Request**

```bash
curl -H "Authorization: Bearer cs_api_live_YOUR_TOKEN" \
     -H "Accept: application/json" \
     "https://api.codespectra.ai/v1/problems?difficulty=easy&limit=5"
```

**Response**

```json
{
  "data": [
    {
      "id": "two-sum",
      "title": "Two Sum",
      "difficulty": "easy",
      "topics": ["arrays", "hash-table"],
      "acceptanceRate": 78.5
    },
    {
      "id": "palindrome-number",
      "title": "Palindrome Number",
      "difficulty": "easy",
      "topics": ["math"],
      "acceptanceRate": 82.1
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 5,
    "total": 42
  }
}
```

---

## API Endpoints Overview

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Problems | `GET /problems` | List coding problems |
| Problems | `GET /problems/:id` | Get problem details |
| Submissions | `POST /submissions` | Submit a solution |
| Submissions | `GET /submissions/:id` | Get submission result |
| Scans | `POST /scans` | Trigger a code scan |
| Scans | `GET /scans/:id` | Get scan results |
| Quality Gates | `GET /quality-gates` | List quality gates |
| Quality Gates | `POST /quality-gates/:id/evaluate` | Evaluate against a gate |
| User | `GET /user/profile` | Get current user profile |
| User | `GET /user/stats` | Get user statistics |
| Leaderboard | `GET /leaderboard` | Get top users |
| Runs | `POST /runs` | Execute arbitrary code |

---

## SDKs & Client Libraries

Official client libraries are available for popular languages:

| Language | Package |
|----------|---------|
| JavaScript/TypeScript | `npm install @codespectra/sdk` |
| Python | `pip install codespectra-sdk` |

---

## Webhooks

CodeSpectra can send webhook events to your endpoints for:

- `scan.completed` — A code scan has finished
- `review.completed` — An AI code review is ready
- `quality_gate.evaluated` — A quality gate check has completed
- `submission.graded` — A coding submission has been graded

Configure webhooks in your dashboard under **Settings > Webhooks**.

---

## MCP Server

CodeSpectra exposes a Model Context Protocol (MCP) server at `/api/mcp` for AI tool integration. Available tools:

| Tool | Description |
|------|-------------|
| `list_problems` | List problems with filters |
| `get_problem` | Get problem by slug |
| `run_code` | Execute code in sandbox |
| `get_user_xp` | Get user XP and level |
| `get_leaderboard` | Get top earners |

---

> **Full API Reference**: Visit [docs.codespectra.ai/api](https://docs.codespectra.ai/api) for complete endpoint documentation, request/response schemas, and interactive examples.
