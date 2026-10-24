# Device Fingerprinting & Security Monitoring — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation. Last updated: 2026-08-07.

## Overview

CodeSpectra uses [FingerprintJS v5](https://github.com/fingerprintjs/fingerprintjs) (MIT licensed) to produce a stable, privacy-respecting device identifier per browser. The identifier survives incognito mode and cookie clearing, which makes it a strong signal for:

- **Multi-account abuse** — the same device signing into (or creating) multiple accounts.
- **New-device detection** — a legitimate user logging in from a previously unseen device.
- **Impossible-travel detection** — an account-takeover signal when a login originates from a different country within a short window.
- **Fraud prevention** — blocking a device fingerprint entirely.

## Architecture

### Client

`frontend/lib/fingerprint.ts` (client component):

- Loads the vendored UMD build from `/vendor/fingerprintjs.min.js` (our own origin — CSP-safe, no external CDN, no npm dependency).
- `getVisitorId()` — computes the stable visitor ID, cached for the session.
- `withFingerprint(body)` — attaches `visitorId` to an outgoing auth request body.
- Best-effort: if fingerprinting fails (ad-blocker, headless browser), auth still proceeds — the identifier is simply not recorded.

Wired into `frontend/lib/auth-context.tsx`:

- Email login/signup send the visitor ID in the request body.
- Google/GitHub sign-in and the 5-minute session heartbeat report it via `POST /api/security/track`.

### Server

| File | Purpose |
|---|---|
| `frontend/lib/db/security.ts` | `security_events`, `device_fingerprints`, `security_blocklist` helpers; `trackDeviceFingerprint`, `detectImpossibleTravel`, `isIpBlocked`, `blockIp`/`unblockIp`, IP-whitelist + concurrent-session enforcement. |
| `frontend/app/api/security/track/route.ts` | `POST` — records a fingerprint against the authenticated user; flags multi-account risk. |
| `frontend/app/api/auth/login/route.ts` | Blocked-IP + IP-whitelist checks, brute-force auto-block (3 failures/IP/10 min → block), device tracking, impossible travel, concurrent-session pruning. |
| `frontend/app/api/auth/signup/route.ts` | Blocked-IP + whitelist checks, device tracking (same device → multiple accounts flagged as `critical`). |
| `frontend/app/api/auth/session/route.ts` | OAuth session recording (heartbeat-safe: updates the existing session, creates only when none matches). |

## Data Model (MongoDB)

### `device_fingerprints`

One document per `visitorId`.

```ts
{
  visitorId: string,
  first_seen: string,      // ISO
  last_seen: string,       // ISO
  seen_count: number,
  accounts: [{ user_id, email, first_seen, last_seen }],  // every account seen on this device
  user_agents: string[],   // last 20 observed
  is_blocked: boolean,
  blocked_at?: string,
  blocked_reason?: string,
}
```

Multi-account risk = `accounts.length > 1`.

### `security_events`

Append-only security log surfaced on the admin dashboard.

```ts
{
  id, ts, type, severity: 'info'|'warning'|'critical',
  user_id?, email?, ip?, visitorId?, detail, metadata?
}
```

Types: `auth.login`, `auth.signup`, `auth.failed_login`, `auth.rate_limited`, `auth.blocked_ip`, `auth.new_device`, `auth.impossible_travel`, `auth.multi_account`, `auth.blocked_fingerprint`, `admin.block_ip`, `admin.unblock_ip`, `admin.block_fingerprint`.

### `security_blocklist`

```ts
{ ip, reason, active: bool, blocked_at, blocked_by, expires_at? }
```

## Admin Dashboard

Route: `/dashboard/admin/security` (superadmin). Four tabs:

| Tab | Contents |
|---|---|
| **Overview** | Active sessions, login activity, alerts, security settings toggles, IP Whitelist + Concurrent Session Limit editors. |
| **Device Fingerprints** | Tracked devices, multi-account risk count, blocked devices; per-device block/unblock. |
| **Blocked IPs** | Add an IP manually (with reason), list active blocks, unblock. |
| **Security Events** | Filterable recent security events with severity badges. |

APIs:

- `GET /api/admin/security/blocked-ips` · `POST` (block) · `DELETE ?ip=` (unblock)
- `GET /api/admin/security/fingerprints` · `POST { visitorId, action: 'block'|'unblock' }`
- `GET /api/admin/security/events`

## Enforced Settings

Toggles in `security_settings` are now enforced (not just displayed):

| Setting | Enforcement |
|---|---|
| **IP Whitelist** | Login/signup refuse when the IP is not on the allowlist (IPv4 CIDR supported). |
| **Concurrent Session Limit** | Oldest `user_sessions` pruned to the configured cap on login. |
| **Device Fingerprinting** | Gate on whether fingerprints are recorded. |
| **Impossible Travel Detection** | Gate on the country-change alert. |
| **Brute Force Protection** | 3 failed logins from one IP in 10 minutes → auto-block. |
| **API Rate Limiting** | Global edge limiter (240 req/min/IP) + per-route limits on auth endpoints. |

## Notes & Known Ceilings

- The edge rate limiter (`lib/edge-rate-limit.ts`) is per-worker in-memory — best-effort. Per-route Node limits are the primary control.
- Impossible travel uses a 2-hour window + country-name comparison. Upgrade path: distance computation from session `lat`/`lon`.
- `isIpOutsideWhitelist` CIDR matching is IPv4-only.
- FingerprintJS is client-computed — spoofable by a determined attacker. Treat as a strong heuristic, not identity proof.
