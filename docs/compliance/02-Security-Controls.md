# CodeSpectra Security Controls

> **Auto-generated:** Based on codebase audit. Last updated: 2026-07-08.
> **Legend:** ✅ Implemented | 🟡 Partial | ❌ Not Implemented

---

## Control Matrix

| Control | Status | Implementation Details | Gaps & Risks |
|---------|--------|----------------------|--------------|
| **Authentication** | ✅ | Email/password via bcrypt + session cookie. Firebase Auth for OAuth (Google, GitHub). JWT session tokens via `jose`. | OAuth lacks server-side session sync. Password reset delegates to Firebase. |
| **Authorization (RBAC)** | 🟡 | Page-level RBAC via `page-permissions.ts` + `usePageGuard`. DB-driven roles via `permissions-db.ts`. Three roles: `superadmin`, `tenant_admin`, `user`. | No server-side middleware enforcement. Client-side guards only. `/dashboard/admin/*` routes lack auth on some API endpoints. |
| **Encryption at Rest** | 🟡 | GitHub tokens encrypted with AES-256-GCM (`github-token-crypto.ts`). Password hashes via bcrypt (cost 12). | TOTP secrets stored without encryption. No field-level encryption for PII. `platform_settings` secrets in plaintext in MongoDB. |
| **Encryption in Transit** | ✅ | HTTPS enforced in production. Cookies use `secure: true`. Session cookie has `httpOnly` + `sameSite: lax`. | `secure` flag depends on `NODE_ENV === 'production'` — dev environments are HTTP. |
| **Session Management** | 🟡 | 7-day JWT sessions with httpOnly cookies. Firebase session cookies via Admin SDK. | Hardcoded JWT fallback secret (CRITICAL). No session revocation/blacklist. No refresh token rotation. 7-day expiry without renewal. |
| **Rate Limiting** | 🟡 | `in-memory-rate-limit.ts` sliding window. `upstash-rate-limit.ts` distributed limiter (covers only `generate-fixes` endpoint). | No rate limiting on login, signup, or any of the 10 AI endpoints. Upstash not used as default. |
| **Audit Logging** | 🟡 | Admin audit logs via `/dashboard/admin/audit-logs`. Platform settings changes logged. | No auth event audit (login, signup, 2FA, password changes not logged). No structured audit schema. |
| **Input Validation** | 🟡 | Zod schemas for some models. Manual validation in `validation-schemas.ts` for jobs, exams, resumes. | Many `as any` casts bypass validation. AI router has no output schema validation. No request size limits on upload endpoints. |
| **CSP / Security Headers** | ❌ | Not configured in `next.config.mjs`. | No Content-Security-Policy. No HSTS. No X-Frame-Options. No X-Content-Type-Options. No Referrer-Policy. |
| **Vulnerability Scanning** | 🟡 | AI inventory (`ai-inventory.ts`) references `pip-audit` for Python deps. | No automated dependency scanning. No SBOM generation. No secret scanning. No container image scanning. |
| **Secrets Management** | 🟡 | Dual-source pattern (env vars → MongoDB `platform_settings`). GitHub token crypto uses env key. | API keys in environment variables (no vault). AI API key in Gemini URL (logged). Firebase credentials as plain env vars. |
| **CORS** | ✅ | FastAPI proxy handles CORS implicitly. Next.js API routes are same-origin. | Validate if custom domains need CORS configuration. |
| **Anti-Cheating** | 🟡 | Identity verification via AI vision (`/identity-verify`). Session tracking. | No proctoring for live interviews. No plagiarism detection for code submissions. No browser lock-down. |
| **Data Retention** | ❌ | No TTL indexes on audit logs, webhook events, or session data. | Unbounded data growth in `audit_logs`, `webhook_events`, `ai_chat_sessions`. |
| **Backup & Recovery** | ❌ | No backup configuration in codebase. MongoDB Atlas provides automated backups. | No documented restore procedures. No point-in-time recovery config in code. |
| **Incident Response** | ❌ | No logging infrastructure for security events. No alerting configuration. | Cannot detect or respond to security incidents. No SIEM integration. |

---

## Risk Heat Map

```
                      LIKELIHOOD
                  Low    Medium    High
                ┌──────┬────────┬────────┐
   Critical    │       │        │ JWT    │
              │       │        │ secret │
    I         ├──────┼────────┼────────┤
    M  High    │       │No CSP │No rate │
    P         │       │        │limiting│
    A         ├──────┼────────┼────────┤
    C  Medium  │TOTP  │No auth │No audit│
    T         │plain │revoke  │logging │
              ├──────┼────────┼────────┤
    E  Low     │No TTL│No CI/CD│No deps │
              │      │        │scanning│
              └──────┴────────┴────────┘
```

---

## Compliance Mapping

| Standard | Control | Status | Notes |
|----------|---------|--------|-------|
| **OWASP Top 10** | A01: Broken Access Control | 🟡 | Client-side RBAC only; server-side enforcement needed |
| | A02: Cryptographic Failures | 🟡 | JWT secret issue; TOTP plaintext; Gemini key in URL |
| | A04: Insecure Design | 🟡 | God components, no caching layer |
| | A05: Security Misconfiguration | ❌ | No CSP, no HSTS |
| | A06: Vulnerable Components | 🟡 | No dep scanning, pip-audit only |
| | A07: ID & Auth Failures | 🟡 | No rate limiting, no session revocation |
| | A09: Security Logging Failures | 🟡 | No auth audit logging |
| **SOC 2** | CC6.1: Logical & Physical Access | 🟡 | Encryption at rest partial; encryption in transit OK |
| | CC7.2: Monitor & Detect | ❌ | No security monitoring |
| | CC7.3: Incident Response | ❌ | No IR plan in codebase |
| **GDPR** | Art. 5: Data Minimization | 🟡 | No data retention policies |
| | Art. 17: Right to Erasure | 🟡 | `deleteUserById` exists but no full cascade delete |
| | Art. 32: Security of Processing | 🟡 | Multiple security gaps identified |
| **PCI DSS** | Req 3: Protect Stored Data | 🟡 | No card data stored directly (Razorpay handles this) |
| | Req 4: Encrypt Transmission | ✅ | HTTPS enforced |
| | Req 6: Develop Secure Systems | 🟡 | No SAST/DAST, no dependency scanning |

---

## Remediation Priority

| Timeframe | Actions |
|-----------|---------|
| **Immediate (this week)** | Fix JWT fallback secret, Fix Gemini API key URL, Add rate limiting to login/signup |
| **Short-term (2 weeks)** | Add CSP/HSTS headers, Add auth audit logging, Add session revocation |
| **Medium-term (1 month)** | Encrypt TOTP secrets, Add server-side RBAC middleware, Add dependency scanning |
| **Long-term (3 months)** | SIEM integration, Incident response automation, Penetration testing, SOC 2 readiness |
