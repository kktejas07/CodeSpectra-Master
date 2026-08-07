# Security Documentation

> **Auto-Generated**: This index is maintained manually. Last updated: 2026-08-07.

**Audience:** Internal Engineering — for developers, security engineers, and penetration testers.

**Purpose:** Threat model, authentication flows, RBAC model, OWASP compliance checklist, device fingerprinting.

## Documents

| File | Description |
|------|-------------|
| [01-Threat-Model.md](./01-Threat-Model.md) | STRIDE threat model — systematic analysis of Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege risks across the full stack. |
| [02-Authentication-Flow.md](./02-Authentication-Flow.md) | Authentication flow — detailed sequence diagrams and documentation for Better Auth, Firebase legacy auth, and Jose session token flows. |
| [03-RBAC-Model.md](./03-RBAC-Model.md) | RBAC model — role definitions (superadmin, tenant_admin, user), permission matrix, static (page-permissions.ts) and dynamic (MongoDB) enforcement points. |
| [04-OWASP-Checklist.md](./04-OWASP-Checklist.md) | OWASP Top 10 (2021) compliance — per-category assessment of controls, vulnerabilities found, and remediation recommendations. |
| [05-Device-Fingerprinting.md](./05-Device-Fingerprinting.md) | Device fingerprinting — FingerprintJS v5 integration, multi-account risk detection, IP blocklist, impossible-travel detection, and the admin Security dashboard. |

## Document Count

**5 documents** in this section.
