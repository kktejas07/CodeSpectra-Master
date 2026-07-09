# Authentication Flow — CodeSpectra

> **Last Updated:** 2026-07-08  
> **Auth Libraries:** Better Auth (primary), Firebase (legacy), Jose (session tokens)

---

## 1. Email/Password Authentication

Uses Better Auth on the backend with bcrypt password hashing + JWT session cookie.

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant N as Next.js (Frontend)
    participant BA as Better Auth Lib
    participant M as MongoDB
    participant F as Firebase Admin (fallback)

    U->>N: POST /api/auth/signup (email, password, name)
    N->>BA: signUpEmail()
    BA->>M: Create user doc (bcrypt hash)
    M-->>BA: User created
    BA-->>N: Session token
    N->>N: Set codespectra_session cookie (httpOnly, secure, sameSite=lax)
    N-->>U: 200 + Set-Cookie header

    U->>N: POST /api/auth/login (email, password)
    N->>BA: signInEmail()
    BA->>M: Verify credentials (bcrypt compare)
    M-->>BA: Valid
    BA-->>N: Session token (JWT, HS256, 7d expiry)
    N->>N: signSessionToken(payload) via jose
    N-->>U: 200 + Set-Cookie: codespectra_session

    U->>N: GET /dashboard/*
    N->>N: Middleware checks session cookie
    N->>BA: getSession() from cookie
    BA-->>N: User + role
    N->>N: RBAC check via canAccessPage()
    N-->>U: Page or redirect
```

**Cookie properties** (`frontend/lib/session.ts:35-41`):
- `httpOnly: true`
- `secure: true` (production only)
- `sameSite: 'lax'`
- `path: '/'`
- `maxAge: 7 days`

---

## 2. Google OAuth

Uses Firebase `signInWithPopup` (client-side) then syncs session cookie (server-side).

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant FC as Firebase Client SDK
    participant GA as Google Accounts
    participant N as Next.js API
    participant FA as Firebase Admin SDK
    participant M as MongoDB

    U->>FC: Click "Sign in with Google"
    FC->>GA: signInWithPopup(googleProvider)
    GA-->>FC: ID token
    FC-->>U: idToken
    U->>N: POST /api/auth/callback (idToken)
    N->>FA: verifyIdToken(idToken)
    FA-->>N: decodedToken { uid, email }
    N->>M: Upsert user profile
    M-->>N: OK
    N->>FA: createSessionCookie(idToken, { expiresIn })
    FA-->>N: sessionCookie string
    N->>N: Set codespectra_session cookie
    N-->>U: 302 Redirect to /dashboard
```

---

## 3. GitHub OAuth

Firebase `signInWithPopup` for auth + custom GitHub API integration for repository access.

```mermaid
sequenceDiagram
    participant U as User/Browser
    participant FC as Firebase Client SDK
    participant GA as GitHub Auth
    participant N as Next.js API
    participant FA as Firebase Admin SDK
    participant M as MongoDB (account collection)

    U->>FC: Click "Sign in with GitHub"
    FC->>GA: signInWithPopup(githubProvider)
    GA-->>FC: GitHub access token + ID token
    FC-->>U: idToken
    U->>N: POST /api/auth/callback (idToken)
    N->>FA: verifyIdToken(idToken)
    FA-->>N: decodedToken
    N->>M: Store OAuth tokens in `account` collection
    Note over N,M: Token stored unencrypted by default<br/>(encrypt at rest via GITHUB_TOKEN_ENCRYPTION_KEY)
    N->>FA: createSessionCookie()
    FA-->>N: sessionCookie
    N->>N: Set codespectra_session cookie
    N-->>U: 302 Redirect to /dashboard

    U->>N: GET /api/github/* (needs access token)
    N->>N: requireAuth() via route-auth.ts
    N->>M: db.account.findOne({ userId, providerId:'github' })
    M-->>N: account doc (accessToken)
    N->>N: decryptGitHubTokenIfNeeded(stored)
    N-->>U: GitHub API response
```

---

## Auth Inconsistencies Found in Audit

| # | Issue | Location | Details |
|---|-------|----------|---------|
| A1 | **Session token fallback secret** | `frontend/lib/session.ts:6` | Hardcoded dev secret `'fallback-dev-secret-do-not-use-in-production-32chars'` used when `SESSION_SECRET` env var is unset. |
| A2 | **Three independent auth providers** | `lib/route-auth.ts`, `lib/firebase-admin.ts`, `lib/session.ts` | Auth chain: Firebase Admin SDK → Jose session verification → cookie. If Firebase Admin is unconfigured, it silently falls through to Jose-only verification. |
| A3 | **Stub auth-service.ts still importable** | `frontend/lib/auth-service.ts` | All functions return `{ success: false, error: "Supabase auth-service was removed..." }`. Orphaned imports in dashboard pages continue to compile. |
| A4 | **Firebase client config from API** | `frontend/lib/firebase.ts:44` | `/api/firebase-config` returns client-side Firebase config. If this endpoint is unauthenticated, it leaks project metadata. |
| A5 | **Missing OAuth state parameter** | No `state` parameter found in OAuth callback handling | OAuth flows lack CSRF protection via `state` parameter. | 
| A6 | **Bearer token auth without CSRF** | `frontend/lib/route-auth.ts:74-83` | Authorization: Bearer <token> is accepted for API routes alongside session cookies. This widens the attack surface for token exfiltration. |
