> **Auto-Generated**: Internal Engineering documentation.

---
title: Test Coverage Audit & Mock Data Guide
description: Feature-by-feature test coverage matrix, identified gaps, and reusable mock fixtures
last_auto_updated: 2026-11-01
---

# Test Coverage Audit & Mock Data Guide

**Audience:** Internal Engineering — for developers writing or running tests in this repo.

**Purpose:** A snapshot of what is covered today, what is not, and where to find the fixtures
needed to write a test without a live backend.

---

## 1. Test Infrastructure

| Layer | Tool | Location | Command |
|-------|------|----------|---------|
| Frontend unit / integration | Vitest 4.x | `frontend/tests/` | `cd frontend && yarn test` |
| Frontend E2E | Playwright | `frontend/e2e/` | `cd frontend && npx playwright test` |
| Backend | pytest | `backend/tests/` | `cd backend && pytest tests/` |
| Mobile | Jest + @testing-library/react-native | `mobile/tests/` | `cd mobile && yarn test` |

Backend has two distinct kinds of test:

- **Offline** — pure functions, route-handler logic, security helpers. Run in CI.
- **Live integration** — `test_iteration7_features.py`, `test_iteration8_features.py`,
  `test_phase10_qr_hackathons.py`, `test_phase11_certs_audit.py`. These drive the running
  Next.js app on `http://localhost:3000` against a seeded MongoDB. They are **not** FastAPI
  tests and cannot be converted to `TestClient` — the endpoints they exercise are Next.js
  route handlers under `frontend/app/api/*`. They now skip cleanly when no server is
  reachable, so `pytest tests/` is green on a bare checkout.

```bash
# Offline backend only (explicit)
cd backend && pytest tests/ -k "not iteration7 and not iteration8 and not phase10 and not phase11" -v
```

---

## 2. Feature × Test Coverage Matrix

| Feature area | Files | Test type | Status |
|---|---|---|---|
| ATS / Hiring | 15+ | Unit + Integration | Covered |
| AI / Agent / RAG | 30+ | Unit + Integration | Covered |
| Assessment / Exam | 11 | Unit | Covered |
| Automation / Workflows | 9 | Unit | Covered |
| Billing / Monetisation | 10 | Unit | Covered |
| Security (CSP/CSRF/auth) | 20+ | Unit | Covered |
| i18n / Localisation | 13 | Unit | Covered |
| SEO | 4 | Unit | Covered |
| Events / Hackathons / Contests | 8 | Unit | Covered |
| Learn / Courses / Community | 10 | Unit | Covered |
| Marketplace | 4 | Unit | Covered |
| Proctoring / Integrity | 5 | Unit | Covered |
| Admin routes | 3 | Unit | Covered |
| Mobile screens | 1 | Render smoke | Covered |
| E2E (Playwright) | 4 | E2E | Covered |
| PWA | 3 | Unit | Covered |
| Crash Analytics | 2 | Unit | Covered |
| CAD Scoring | 2 | Unit | Covered |
| UI Components (~50 dirs) | 2 | Component | Partial |
| Dashboard sub-pages | 0 | — | Gap |
| Blog / News / About / Careers | 0 | — | Gap |
| KYC flow | 0 | — | Gap |
| Voice features | 0 | — | Gap |
| Remotion video pipeline | 0 | — | Gap |
| MCP integration page | 0 | — | Gap |
| QR check-in (frontend) | 0 | — | Gap |

---

## 3. Test Types in the Codebase

**Unit (Vitest)** — `frontend/tests/`, ~225 files. Pure functions, business logic, API response parsing.

**Integration** — `rag-acl-mongo.integration.test.ts` and `rag-pgvector.integration.test.ts` need a
real database connection. The backend live-server suites (above) need a deployed frontend + seeded
MongoDB.

**E2E (Playwright)** — `frontend/e2e/smoke.spec.ts`, `ci-smoke.spec.ts`, `a11y-admin.spec.ts`,
`a11y-candidate.spec.ts`. Inject session cookies for auth and smoke-test the major routes.

**Component render** — `frontend/tests/components/button.test.tsx`,
`answer-input-a11y.test.tsx`, `animated-icon.test.tsx`, `user-avatar.test.tsx` and the other
`.tsx` render tests.

**Mobile** — `mobile/tests/screens.render.test.tsx` covers all 8 screens in loading / empty /
data / error states.

**Crash + log** — `crash-analytics.test.ts`, `test_crash_analytics.py`, `log-redact.test.ts` (PII scrubbing).

---

## 4. Mock Data

Reusable fixtures live in two places so both stacks can use them:

- **Frontend (TypeScript)** — `frontend/tests/fixtures/mock-data.ts`
- **Backend (Python)** — `backend/tests/mock_data.py`

Import from those files rather than inlining literals, so a schema change is a one-line fix.

### 4.1 Admin System / Operations

```ts
export const serverHealth = {
  cpu: 42.5, memory: 68.2, disk: 55.0, uptime: 1209600,
  docker: { running: 7, stopped: 1 },
}
export const redisStatus = {
  connected: true, hitRate: 0.91, keys: 14230, memory: '128MB',
  rateLimitCounters: { 'signin:ip': 12, 'signin:email': 3, 'ai-requests': 47 },
}
export const webVitals = {
  LCP: { p75: 2100, rating: 'good' },
  INP: { p75: 180, rating: 'good' },
  CLS: { p75: 0.05, rating: 'good' },
  TTFB: { p75: 410, rating: 'needs-improvement' },
}
```

### 4.2 Users / Roles

```ts
export const users = [
  { _id: 'u_001', name: 'Priya Sharma', email: 'priya@axiss.com', role: 'superadmin', status: 'active' },
  { _id: 'u_002', name: 'Arjun Mehta', email: 'arjun@test.com', role: 'candidate', status: 'active' },
  { _id: 'u_003', name: 'Sunita Rao', email: 'sunita@acme.com', role: 'recruiter', status: 'suspended' },
]
export const roles = [
  { id: 'superadmin', permissions: ['*'] },
  { id: 'recruiter', permissions: ['ats:read', 'ats:write', 'hiring:read'] },
  { id: 'candidate', permissions: ['exam:take', 'profile:write'] },
]
```

### 4.3 Assessments / Exam

```ts
export const assessment = {
  _id: 'asmnt_001', title: 'Senior SWE — DSA Round', durationMinutes: 90,
  sections: [
    { id: 'sec_mcq', type: 'mcq', questions: 20, marks: 20 },
    { id: 'sec_code', type: 'coding', questions: 2, marks: 30 },
  ],
  settings: { proctoring: true, cameraRequired: true, browserLockdown: false },
}
export const submission = {
  userId: 'u_002', assessmentId: 'asmnt_001', score: 42, maxScore: 50,
  answers: [
    { questionId: 'q_001', selected: 'B', correct: true },
    { questionId: 'q_002', code: 'def twoSum(nums, target): ...', language: 'python' },
  ],
}
```

### 4.4 Events / Hackathons / Contests

```ts
export const hackathon = {
  _id: 'hack_001', title: 'HackWave 2026', theme: 'AI for Social Good',
  startDate: '2026-11-01T09:00:00Z', endDate: '2026-11-02T18:00:00Z',
  maxTeamSize: 4, registrations: 312, submissions: 89,
}
export const ctfContest = {
  _id: 'ctf_001', title: 'CyberQuest CTF',
  flags: [
    { challengeId: 'ch_001', flag: 'CS{xor_is_fun_0x42}', points: 100 },
    { challengeId: 'ch_002', flag: 'CS{sql_1nject10n}', points: 200 },
  ],
}
```

### 4.5 ATS / Hiring Pipeline

```ts
export const job = {
  _id: 'job_001', title: 'Full Stack Engineer',
  department: 'Engineering', location: 'Hyderabad / Remote',
  pipeline: ['applied', 'screen', 'technical', 'hr', 'offer', 'hired'],
}
export const candidates = [
  { _id: 'c_001', name: 'Rahul Kumar', stage: 'technical', aiScore: 87.4 },
  { _id: 'c_002', name: 'Fatima Sheikh', stage: 'offer', aiScore: 92.1, offerAmount: 1800000 },
]
```

### 4.6 Billing / Plans

```ts
export const subscription = {
  orgId: 'org_001', plan: 'pro', currency: 'INR',
  amount: 4999, interval: 'monthly', status: 'active',
  gateway: 'razorpay', nextBillingDate: '2026-11-27T00:00:00Z',
}
export const usage = { aiRequests: 4820, aiLimit: 5000, candidates: 128, candidateLimit: 200 }
```

### 4.7 Analytics / Insights

```ts
export const userGrowth = [
  { month: '2026-05', newUsers: 340 }, { month: '2026-06', newUsers: 412 },
  { month: '2026-07', newUsers: 389 }, { month: '2026-08', newUsers: 501 },
  { month: '2026-09', newUsers: 620 }, { month: '2026-10', newUsers: 714 },
]
export const usersByRole = { candidate: 8420, recruiter: 310, admin: 12 }
export const mrr = { INR: 248000, USD: 2980 }
export const insights = {
  integrityFlags: 14,
  aiUsageThisMonth: 38200,
}
```

### 4.8 Learn / Courses

```ts
export const course = { _id: 'crs_001', title: 'DSA Masterclass', modules: 12, lessonsTotal: 84, enrollments: 2140 }
export const progress = {
  userId: 'u_002', courseId: 'crs_001', lessonsCompleted: 31,
  lastWatched: { lessonId: 'les_031', watchedSeconds: 720, totalSeconds: 900 },
  quizScores: { quiz_mod3: 85, quiz_mod4: 92 },
}
```

### 4.9 Proctoring

```ts
export const proctorSession = {
  _id: 'proc_001', examId: 'asmnt_001', userId: 'u_002',
  flags: [
    { type: 'tab_switch', ts: '2025-06-01T09:14:22Z' },
    { type: 'face_not_detected', ts: '2025-06-01T09:28:05Z' },
  ],
  recording: { r2Key: 'proc/proc_001/video.webm', durationSeconds: 5400 },
  verdict: 'suspicious',
}
```

### 4.10 Crash Analytics

```ts
export const crashes = [
  {
    message: "Cannot read properties of undefined (reading 'id')",
    severity: 'error', component: 'AtsEngine',
    userId: 'u_002', ts: '2026-10-27T04:12:00Z',
  },
  {
    message: 'Redis connection timeout',
    severity: 'fatal', component: 'RedisCacheHandler',
    userId: null, ts: '2026-10-27T04:15:33Z',
  },
]
```

---

## 5. Open Gaps

1. **UI component tests** — RTL coverage for `components/admin/`, `components/analytics/`,
   `components/proctoring/`, `app/dashboard/admin/billing/`.
2. **Dashboard sub-page E2E** — Playwright specs for the dashboard sub-pages.
3. **KYC flow** — unit tests for the identity-verification steps.
4. **Voice features** — unit tests for the recording state machine in `components/voice/`.
5. **Backend CI conversion** — the live suites now skip offline; the remaining CI-runnable
   subset is the static code-path checks (see `backend/tests/test_iteration7_features.py`).
6. **Blog / News / About / Careers**, **Remotion pipeline**, **MCP page**, **QR check-in UI** —
   no tests yet.

---

## 6. Running Everything

```bash
# Frontend unit
cd frontend && yarn test

# Frontend e2e
cd frontend && npx playwright test

# Backend (offline subset runs; live suites skip without a deployed app)
cd backend && pytest tests/ -v

# Mobile
cd mobile && yarn test
```
