> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# API Guide

CodeSpectra provides a REST API for programmatic access to platform features.

## Authentication

Currently, the API uses **session-based authentication**. Your browser session cookie is sent automatically with API requests.

### Requirements
- You must be logged in to CodeSpectra
- API requests must include `credentials: 'include'` (for `fetch`) or equivalent
- Session cookies are automatically managed by your browser

### Note on API Keys
Dedicated API key authentication is not yet available. All API access requires an active browser session.

## Rate Limits

- Rate limits are enforced per session
- Limits are designed to prevent abuse while allowing normal usage
- If you exceed the rate limit, the API returns a `429 Too Many Requests` response

## Making Requests

All API endpoints are prefixed with `/api/`. They accept and return JSON.

### Example: Fetch Your Profile

```bash
curl -X GET https://[your-domain]/api/auth/me \
  -H "Content-Type: application/json" \
  --cookie "[your-session-cookie]"
```

### Example: Run a Code Scan

```bash
curl -X POST https://[your-domain]/api/analyze-code \
  -H "Content-Type: application/json" \
  --cookie "[your-session-cookie]" \
  -d '{
    "code": "console.log(\"hello\")",
    "language": "javascript"
  }'
```

### Example: Fetch Problems

```bash
curl -X GET https://[your-domain]/api/problems?limit=10 \
  -H "Content-Type: application/json" \
  --cookie "[your-session-cookie]"
```

## Common Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/me` | GET | Current user profile |
| `/api/auth/session` | GET | Current session info |
| `/api/problems` | GET | List coding problems |
| `/api/problems/[id]` | GET | Single problem details |
| `/api/analyze-code` | POST | Submit code for analysis |
| `/api/submissions` | POST | Submit a problem solution |
| `/api/ai/chat` | POST | Chat with AI assistant |
| `/api/ai/hints` | POST | Get coding hints |
| `/api/ai/code-review` | POST | Request code review |
| `/api/notifications` | GET | List notifications |
| `/api/certifications` | GET | List certifications |
| `/api/user/stats` | GET | User statistics |
| `/api/user/activity` | GET | User activity feed |

## Response Format

Successful responses return JSON. Errors return an error object:

```json
{
  "error": "Description of what went wrong"
}
```

## Future

- Dedicated API key authentication is planned
- Rate limit headers will be added to responses
- Pagination will be standardized across list endpoints
