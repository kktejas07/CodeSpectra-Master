> **Auto-Generated Documentation**
> **Last Updated**: 2026-09-21
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Mobile API

Endpoints backing the Expo app (`mobile/`). The app talks only to these
Next.js routes (plus the existing authenticated `/api/*` surface via
`Authorization: Bearer`). No separate mobile backend exists.

## POST /api/auth/mobile-token

Mint a long-lived session JWT for SecureStore storage. Same credential
verification as web login (bcrypt + TOTP passthrough + IP rate limits);
no Turnstile (no DOM in native) and no session cookie.

**Request Body:**
```json
{ "email": "user@example.com", "password": "mypassword", "totpToken": "123456" }
```

**Success Response (200):**
```json
{
  "token": "<jose HS256 JWT, 30-day expiry>",
  "user": { "id": "…", "email": "…", "role": "user", "name": "…" },
  "faceEnrollmentRequired": false
}
```

Logout / password-change revoke via `session_version` like web.
`GET /api/mobile/bootstrap` and all other routes accept the token as
`Authorization: Bearer <token>` (Firebase ID tokens still accepted
first when configured; own session JWTs are the fallback).

**Error Responses:**
- `400` — Missing email or password
- `401` — Invalid credentials / bad 2FA code
- `429` — Rate limited (IP or per-email)

**Implementation**: `frontend/app/api/auth/mobile-token/route.ts`.
Token minted by `signSessionToken(payload, '30d')` (`frontend/lib/session.ts`).

---

## GET /api/mobile/bootstrap?mode=dark|light

The entire app shell renders from this document. Any authenticated role
may call it; it only reveals what the caller may see.

**Success Response (200):**
```json
{
  "user": { "id": "…", "email": "…", "name": "…", "role": "tenant_admin", "tenantId": "…" },
  "tabs": [
    { "id": "problems", "label": "Problems", "icon": "code-2", "route": "/(tabs)/problems", "webRoute": "/dashboard/problems", "minRole": "user", "badge": null }
  ],
  "theme": { "mode": "dark", "primary": "#00D681", "background": "#080D17", "card": "#0E1626", "text": "#F1F5F9", "muted": "#94A3B8", "border": "#1E293B" },
  "flags": { "faceEnrollmentRequired": false, "maintenanceMode": false }
}
```

- `tabs`: selected by role rank (`user < judge < tenant_admin < superadmin`)
  minus DB-denied `webRoute`s (same merge as `/api/user/my-permissions`,
  so the permissions UI reshapes the app with no binary update).
- `theme`: mapped from `globals.css` tokens; client falls back to its
  bundled snapshot offline.
- `flags.faceEnrollmentRequired`: `role === 'user'` without a
  `facial_biometric_template` (same rule as the web dashboard banner).
- `badges.profile`: unread notification count (best-effort, never 500s).

**Error Responses:**
- `401` — Missing/invalid/expired Bearer token (client wipes SecureStore)

**Implementation**: `frontend/app/api/mobile/bootstrap/route.ts` —
tab selection pure in `frontend/lib/mobile/manifest.ts` (contract-tested
in `frontend/tests/mobile-manifest.test.ts`), DB helpers in
`frontend/lib/mobile/server.ts`.
