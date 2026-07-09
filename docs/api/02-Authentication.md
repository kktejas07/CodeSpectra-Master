> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Authentication API

## POST /api/auth/login

Authenticate with email + password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "mypassword"
}
```

**Success Response (200):**
```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com",
    "role": "user",
    "name": "John Doe"
  }
}
```
Sets `codespectra_session` HTTP-only cookie (JWT, 7-day expiry).

**Error Responses:**
- `400` — Missing email or password; account has no password set (OAuth-only)
- `401` — Invalid email or password

**Implementation**: `frontend/app/api/auth/login/route.ts` — uses bcrypt to compare passwordHash from `user` collection.

---

## POST /api/auth/signup

Create a new account.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepass123",
  "name": "New User"
}
```

**Validation:**
- Email and password required
- Password minimum 6 characters
- Email is lowercased and trimmed
- Duplicate email returns 409

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid...",
    "email": "newuser@example.com",
    "role": "user",
    "name": "New User"
  }
}
```
Creates document in `user` collection with `_id`, `email`, `passwordHash` (bcrypt, 12 rounds), `role: 'user'`, `emailVerified: false`. Sets session cookie.

**Error Responses:**
- `400` — Missing email/password, password too short
- `409` — Email already exists

**Implementation**: `frontend/app/api/auth/signup/route.ts`

---

## GET /api/auth/session

Get current session status. Reads `codespectra_session` cookie.

**Success Response (200)** — Authenticated:
```json
{
  "user": {
    "uid": "a1b2c3d4-...",
    "email": "user@example.com",
    "role": "user",
    "plan": "free",
    "fullName": "John Doe"
  }
}
```

**Success Response (200)** — Not authenticated:
```json
{ "user": null }
```

Auth sources tried in order:
1. Firebase Admin SDK `verifySessionCookie()`
2. JWT fallback via `verifySessionToken()` from `lib/session.ts`
3. Firebase Admin `verifyIdToken()` from `Authorization: Bearer <token>` header

**Implementation**: `frontend/app/api/auth/session/route.ts`

---

## POST /api/auth/session

Create a Firebase session cookie from an ID token.

**Request Body:**
```json
{ "idToken": "<firebase-id-token>" }
```

**Success Response (200):**
```json
{ "ok": true }
```
Sets `codespectra_session` HTTP-only cookie (7-day expiry). Also syncs user profile to the `user` collection if not yet present.

**Error Responses:**
- `400` — idToken required
- `401` — Invalid token
- `500` — Firebase not configured

**Implementation**: `frontend/app/api/auth/session/route.ts` — `POST` handler

---

## DELETE /api/auth/session

Clear session (logout).

**Success Response (200):**
```json
{ "ok": true }
```
Clears `codespectra_session` cookie by setting `maxAge: 0`.

**Implementation**: `frontend/app/api/auth/session/route.ts` — `DELETE` handler

---

## GET /api/auth/me

Get current authenticated user.

**Success Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user"
  }
}
```

**Error Response (401):**
```json
{ "error": "Not authenticated" }
```

**Implementation**: `frontend/app/api/auth/me/route.ts` — delegates to `getAPIUser()` from `lib/route-auth.ts`

---

## POST /api/auth/seed-dev

Seed three developer accounts (superadmin only).

**Auth**: Requires `superadmin` role.

**Creates/Updates three accounts:**
| Email | Password | Role |
|-------|----------|------|
| `superadmin@codespectra.com` | `SuperAdmin123!` | `superadmin` |
| `admin@codespectra.com` | `TenantAdmin123!` | `tenant_admin` |
| `demo@codespectra.com` | `DemoPass123!` | `user` |

**Success Response (200):**
```json
{
  "seeded": [
    { "email": "superadmin@codespectra.com", "action": "created" },
    { "email": "admin@codespectra.com", "action": "updated (passwordHash set)" },
    { "email": "demo@codespectra.com", "action": "created" }
  ]
}
```

**Implementation**: `frontend/app/api/auth/seed-dev/route.ts`

---

## Note on Forgot/Reset Password

The codebase references forgot-password and reset-password in doc comments and UI (login page), but **no dedicated API routes exist** for these flows. Password reset is expected to be handled by Firebase Admin SDK's built-in password reset email, or via the Better Auth integration (not yet wired).

## Auth Architecture Summary

| Auth Mechanism | Used For | Status |
|----------------|----------|--------|
| Firebase Admin SDK (session cookie) | Primary auth | Active |
| Firebase Admin SDK (ID token) | Bearer token auth | Active |
| JWT (codespectra_session) | Fallback when Firebase unavailable | Active |
| bcrypt (email+password) | Login/signup | Active |
| Better Auth (server) | Referenced but not wired | Stub only |
| Legacy Supabase auth-service | All functions throw errors | Dead stub |
