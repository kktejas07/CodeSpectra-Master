# Architecture Decision Records

> **Auto-Generated**: Internal Engineering documentation.

## ADR-001: Next.js App Router over Pages Router

**Status:** Accepted

**Context:** CodeSpectra needed to choose between Next.js Pages Router (legacy) and App Router (introduced in Next.js 13). The application requires server-side rendering for public pages, API routes for backend functionality, and a modern React component model. The project initially used the Pages Router and migrated to App Router.

**Decision:** Adopt the Next.js App Router for all new routes. The App Router provides:
- React Server Components (RSC) — reduced client-side JavaScript for dashboard pages
- Nested layouts with persistent state — shared dashboard layouts without remounting
- Route groups and parallel routes — flexible organization of public vs. authenticated sections
- Built-in error boundaries via `error.tsx` and `global-error.tsx`
- Server Actions for mutations where appropriate
- Improved streaming and Suspense integration

**Consequences:**
- **Positive:** Reduced client bundle size through server components. Cleaner file-based routing with `layout.tsx`, `page.tsx`, and `route.ts` conventions. The `app/dashboard/layout.tsx` provides a single shared wrapper for all dashboard pages with sidebar navigation, RBAC enforcement, and user menu.
- **Negative:** Requires understanding of the distinction between Server and Client Components. API routes (`route.ts`) and page components coexist in the same directory tree, which can be confusing. Some legacy code patterns (e.g., direct `useEffect` in pages) must be refactored to server components.
- **Migration:** The project completed its migration from Supabase (Pages Router era) to MongoDB (App Router era), with all new development in `app/` directory.

---

## ADR-002: MongoDB over PostgreSQL (Schemaless Flexibility)

**Status:** Accepted

**Context:** CodeSpectra originally used Supabase PostgreSQL with a fixed relational schema. The application domain includes highly heterogeneous data: AI chat messages with varying metadata, code scan results with nested issue arrays, identity verification records with image data, proctor events with arbitrary event shapes, and workflow definitions with recursive node structures. The team needed to reduce schema migration overhead and support rapid feature iteration.

**Decision:** Migrate from Supabase PostgreSQL to MongoDB as the primary data store.

**Rationale:**
- Schemaless documents naturally represent the heterogeneous data (JSON-within-JSON, variable fields per document type)
- Reduced migration overhead — new features can add fields without running ALTER TABLE
- Single database technology simplifies the stack (was: Supabase + PostgreSQL; now: MongoDB only)
- MongoDB's aggregation pipeline provides equivalent functionality to SQL JOINs (e.g., `$lookup` for scan→metrics joins)
- Existing database tooling (MongoDB Compass, Atlas UI) provides adequate admin interfaces

**Consequences:**
- **Positive:** Development velocity increased — features like identity verification, skill insights cache, and proctor events were added without schema migrations. The 11 repository files in `lib/db/` define TypeScript interfaces that serve as the contract, with MongoDB enforcing no schema at the database level.
- **Negative:** No foreign key constraints — referential integrity is enforced at the application layer. No built-in row-level security (RLS) — access control is implemented in application code via RBAC. Some complex queries require aggregation pipelines that are less intuitive than SQL JOINs.
- **Migration:** The migration from Supabase to MongoDB was executed in phases, with each feature area ported independently. Collections use string UUIDs (not ObjectIDs) to maintain compatibility with existing UI code that expects UUID-format identifiers.
- **Collections:** Approximately 60 collections across domains (auth, AI, content, scanner, billing, platform, etc.)

---

## ADR-003: FastAPI Proxy over Direct Next.js API Exposure

**Status:** Accepted

**Context:** The deployment topology required a clear separation between external-facing services and internal application logic. The application runs in a Kubernetes/Dokploy environment where an ingress routes `/api/*` traffic to a specific port. The team needed to decide whether to expose Next.js API routes directly or use a separate proxy service.

**Decision:** Deploy a FastAPI Python service as a reverse proxy in front of the Next.js application, with two responsibilities:
1. Accept all `/api/*` traffic from the ingress and forward it to the Next.js app running on port 3000
2. Host an internal AI router (`/internal/ai/*`) for LLM operations that Next.js API routes call over the internal Docker network

**Rationale:**
- The proxy decouples external routing from application internals — the Next.js app runs on a private port (3000) and is never exposed directly
- The FastAPI service also hosts the AI router, keeping LLM-related Python code separate from the TypeScript application
- Dual path handling supports both path-preserving and path-stripping ingress configurations
- Stripping hop-by-hop headers in the proxy prevents header injection attacks

**Consequences:**
- **Positive:** Clean separation of concerns — TypeScript (Next.js) for business logic and Python (FastAPI) for LLM proxying. The AI router can be scaled independently if needed. The proxy layer adds defense-in-depth by filtering headers.
- **Negative:** Added network hop for every API request — though latency is negligible within the same Docker network. Added operational complexity (two services to deploy and monitor instead of one). The AI router requires a running Next.js instance for context building (chat history, RAG from MongoDB), creating a circular dependency: Next.js → FastAPI (for AI) and FastAPI → Next.js (for non-AI API calls).
- **Python dependencies:** FastAPI, Uvicorn, httpx, pydantic, python-multipart
- **Scalability:** The proxy is stateless and can be horizontally scaled. The Next.js instance behind it must maintain session affinity for cookie-based auth (sameSite lax + same cookie works across instances).

---

## ADR-004: Hybrid Firebase Auth + JWT Session Cookies

**Status:** Accepted

**Context:** The platform supports three authentication methods: email/password (direct), Google OAuth, and GitHub OAuth. The team needed a session management strategy that works across server-rendered and client-rendered pages, supports instant revocation, and handles the case where Firebase is not configured (dev environments).

**Decision:** Use a two-tier session management approach:
1. **Firebase Auth** for client-side identity verification (OAuth flows, token refresh) — provides the ID token
2. **Firebase session cookies** (primary) + **HS256 JWT session tokens** (fallback) for server-side session validation

**Flow:**
- **OAuth paths**: Firebase client SDK handles the OAuth popup/redirect → Firebase Admin SDK verifies the resulting ID token → a Firebase session cookie is created and set as `codespectra_session` (httpOnly, secure, sameSite=lax)
- **Email/password path**: username/password verified against bcrypt hash in MongoDB → a JWT is signed with `SESSION_SECRET` using the `jose` library → the same `codespectra_session` cookie is set
- **Validation**: `getAPIUser()` in `lib/route-auth.ts` tries Firebase session cookie verification first, falls back to JWT verification if Firebase is unavailable or the cookie is not a Firebase cookie

**Consequences:**
- **Positive:** Firebase provides robust OAuth flows, token refresh, and insta-revocation (via `verifySessionCookie` with `checkRevoked=true`). The JWT fallback allows email/password auth to work without Firebase. Both paths use the same cookie name, making the cookie handling transparent to consuming code.
- **Negative:** Two session verification paths means two code branches to maintain. The JWT fallback does not support revocation (tokens are valid until expiry). Firebase Admin SDK requires service account credentials, which adds configuration overhead.
- **Statelessness:** The JWT path is completely stateless (no DB read for session validation). The Firebase path requires a Firebase Admin SDK call but caches the result.

---

## ADR-005: Piston Sandbox for Code Execution

**Status:** Accepted

**Context:** The problem-solving arena and practice problems require executing user-submitted code against test cases. This must be done securely — arbitrary user code cannot run on the main application server. The team needed a code execution sandbox that supports 40+ languages and can be self-hosted.

**Decision:** Use Piston (ghcr.io/engineer-man/piston) as the primary code execution backend, with a local subprocess executor as fallback.

**Rationale:**
- Piston runs code in isolated Docker containers with resource limits (memory, timeouts), preventing sandbox escapes
- Supports 40+ languages including Python, JavaScript, TypeScript, Java, C++, Go, Rust, Ruby, PHP, Kotlin, Swift, Bash
- Self-hosted via Docker — no third-party API dependency for core functionality
- REST API (`/api/v2/execute`) is simple and well-documented
- Open source with active community maintenance

**Consequences:**
- **Positive:** Complete isolation between user code and application infrastructure. Piston can be scaled independently for high load. The language runtime list is cached (5-minute TTL) for fast validation. The concurrency limiter (configurable via `piston_max_concurrent`) prevents resource exhaustion.
- **Negative:** Requires a privileged Docker container (for container-in-container execution). The public Piston instance (emkc.org) has rate limits and IP-based restrictions — the self-hosted instance avoids these. The fallback local executor only supports 4 languages (Python, JavaScript, TypeScript, Bash).
- **Graceful degradation:** If Piston is unreachable (network failure), returns 401/403/429, or a language is unknown, the system falls back to the local executor. This ensures the platform remains functional during Piston outages.
- **Configuration:** Piston URL is resolved from three sources (in priority order): MongoDB `platform_settings`, `PISTON_URL` env var, or `null` (local only).

---

## ADR-006: Monorepo Structure (frontend/ + backend/ + mobile/)

**Status:** Accepted

**Context:** CodeSpectra consists of a Next.js TypeScript application, a FastAPI Python service, and a React Native mobile app. These share no runtime code but are developed, tested, and deployed together. The team needed to decide between a monorepo and multiple repositories.

**Decision:** Use a monorepo with separate directories for each application, without a shared package manager workspace.

**Structure:**
```
codespectra/
├── frontend/         # Next.js 16 + React 19 + TypeScript
│   ├── package.json  # yarn-managed
│   ├── Dockerfile
│   └── ...
├── backend/          # FastAPI Python 3.12
│   ├── requirements.txt  # pip-managed
│   ├── Dockerfile
│   └── ...
├── mobile/           # React Native
│   ├── android/
│   ├── ios/
│   └── ...
├── docker-compose.yml
└── docs/
```

**Rationale:**
- Single repository simplifies cross-team visibility — frontend, backend, and mobile developers see all changes
- No shared package manager workspace overhead — each sub-project manages its own dependencies independently
- Single `docker-compose.yml` orchestrates all services for local development
- Shared documentation in `docs/` and development conventions in `AGENTS.md`
- CI/CD can be unified (single pipeline build all services) or per-service (separate Docker builds)

**Consequences:**
- **Positive:** Easy to see the full system state in one checkout. Single PRs can span frontend and backend changes. Docker Compose orchestrates all three services for local development. No cross-package version conflicts.
- **Negative:** No shared TypeScript types between frontend and mobile (they copy types as needed). Git history includes all projects, which can be noisy. Monorepo tooling (changesets, Turborepo) was evaluated but not adopted — the team preferred simplicity over workspace tooling.
- **Future consideration:** If the mobile app grows significantly, it could be split into a separate repository with shared types published as an npm package. The current `AGENTS.md` rules (RBAC, CRUD, null safety) apply to the frontend only, with no equivalent rules for mobile yet.
