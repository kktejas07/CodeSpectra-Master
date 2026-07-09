> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Auto-Update Rule**: Regenerate when codebase architecture or schema changes.

# Sequence Diagrams — Request Lifecycle & Error Handling

## 1. Request Lifecycle (Browser → Backend → Database)

```mermaid
sequenceDiagram
    participant B as Browser
    participant M as Middleware
    participant N as Next.js Pages
    participant A as Next.js API Routes
    participant F as FastAPI Proxy
    participant AI as FastAPI AI Router
    participant P as Piston Engine
    participant DB as MongoDB Atlas

    Note over B,DB: Standard Page Request
    B->>M: GET /dashboard/problems
    M->>M: Check session cookie
    M->>DB: Find user by session
    DB-->>M: User role
    M->>M: RBAC check (canAccessPage)
    alt Unauthenticated
        M-->>B: Redirect /auth/login
    else Unauthorized role
        M-->>B: Redirect /dashboard
    else Authorized
        M-->>N: Allow page render
        N->>DB: Fetch problem list
        DB-->>N: Problems data
        N-->>B: SSG/SSR page HTML
    end

    Note over B,DB: API Call (via Kubernetes ingress)
    B->>F: POST /api/submissions
    F->>F: Forward to upstream
    F->>N: POST /api/submissions (internal port 3000)
    N->>N: requireAuth() → session verify
    N->>P: POST /execute (Piston API port 2000)
    P-->>N: Execution result
    N->>DB: Insert submission doc
    N->>N: Award XP (idempotent)
    DB-->>N: Confirm write
    N-->>F: JSON response
    F-->>B: JSON response

    Note over B,DB: AI Request (internal cluster only)
    N->>AI: POST /internal/ai/chat (localhost:8001)
    AI->>AI: Build LLM client (Anthropic/Gemini)
    AI-->>N: SSE stream with text deltas
    N-->>B: Forward SSE events
```

## 2. Error Handling Across Layers

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js API
    participant F as FastAPI Proxy
    participant AI as AI Router
    participant P as Piston Engine
    participant DB as MongoDB

    Note over B,DB: Error Scenario 1: Piston unreachable
    N->>P: POST /execute
    P-->>N: Network error / 502
    N->>N: Check isLocallySupported(language)
    alt Local fallback available
        N->>N: localExecuteOnce() (Python, JS, TS, Bash)
        N-->>B: Execution result from local
    else No local fallback
        N-->>B: 502 { error: "Piston unreachable" }
    end

    Note over B,DB: Error Scenario 2: MongoDB connection failure
    N->>DB: findOne/find query
    DB-->>N: Connection timeout (6s)
    N->>N: Retry with fallback URI
    alt Fallback succeeds
        N->>DB: Re-query on fallback
        DB-->>N: Results
        N-->>B: Success
    else Fallback also fails
        N-->>B: 500 { error: "Database unavailable" }
    end

    Note over B,DB: Error Scenario 3: AI LLM error
    N->>AI: POST /internal/ai/{endpoint}
    AI->>AI: LLM API call
    alt HTTP error
        AI-->>N: 500 { detail: "LLM error: ..." }
    else Stream error
        AI-->>N: data: { "error": "..." }
    end
    N-->>B: 500 / error event

    Note over B,DB: Error Scenario 4: Auth failure chain
    N->>N: getAPIUser()
    N->>N: Try Firebase session cookie
    alt Firebase Admin available
        N->>N: verifySessionCookie()
        alt Success
            N->>N: Return user
        else Failure
            N->>N: Fallback to Jose verifySessionToken()
        end
    else Firebase Admin unavailable (no creds)
        N->>N: Fallback to Jose verifySessionToken()
    end
    alt Both fail
        N->>N: Try Bearer token from Authorization header
        alt Bearer valid
            N->>N: Return user via Firebase verifyIdToken
        else Bearer invalid
            N-->>B: 401 Unauthorized
        end
    end
```

### Error Handling Strategy Summary

| Layer | Error Type | Handling | Fallback |
|-------|-----------|----------|----------|
| **Piston** | Network failure | `isLocallySupported()` check | Local executor (Python, JS, TS, Bash) |
| **Piston** | HTTP 401/403/429 | Rate-limit / quota error | Local executor if available |
| **Piston** | Unknown language | `resolveLanguageVersion()` returns null | Local executor or error |
| **MongoDB** | Primary URI timeout | `connect()` catches Error | `MONGODB_URI_FALLBACK` |
| **MongoDB** | Query failure | Per-function try/catch | Retry or 500 response |
| **AI** | LLM API error | `chat.stream_message()` exception | SSE `data: { "error": "..." }` |
| **AI** | JSON parse failure | `_parse_json_response()` | Best-effort extraction + fallback defaults |
| **Auth** | Firebase Admin unavailable | Silent null return | Jose session token verification |
| **Auth** | Bearer token invalid | Try/catch in `verifyIdToken` | Return 401 |
| **Proxy** | Upstream unreachable | `httpx.RequestError` catch | 502 `{"error":"upstream unreachable"}` |
