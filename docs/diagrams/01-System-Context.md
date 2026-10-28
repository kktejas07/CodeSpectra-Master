> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Auto-Update Rule**: Regenerate when codebase architecture or schema changes.

# C4 Level 1 — System Context Diagram

```mermaid
C4Context
  title System Context — CodeSpectra

  Person(dev, "Developer", "Solves coding problems, submits code, gets AI reviews")
  Person(recruiter, "Recruiter", "Views candidate profiles, assessments, certifications")
  Person(admin, "Platform Admin", "Manages users, roles, billing, system settings")
  Person(anon, "Anonymous User", "Browses public pages, pricing, blog")

  System(codespectra, "CodeSpectra", "Coding assessment & code analysis platform")
  System_Ext(firebase, "Firebase Auth", "Authentication provider (Google, GitHub OAuth)")
  System_Ext(anthropic, "Anthropic API", "Claude Sonnet 4.5 — reasoning, chat, code review, grading")
  System_Ext(gemini, "Gemini API", "Gemini 3 Flash — fast completions, hints, vision (identity verification)")
  System_Ext(openai, "OpenAI API", "GPT-4o / GPT-4o-mini — interview service, AI chat (Vercel AI SDK)")
  System_Ext(razorpay, "Razorpay", "Payment gateway — order creation, verification, webhooks")
  System_Ext(github, "GitHub API", "OAuth, repository listing, commit diffs, PR comments")
  System_Ext(piston, "Piston Engine", "Sandboxed code execution — 40+ languages, port 2000")
  System_Ext(mongodb, "MongoDB Atlas", "Primary database — 38+ collections, string UUIDs")
  System_Ext(email, "Resend / SendGrid / SMTP", "Transactional email — notifications, alerts, invoices")

  Rel(dev, codespectra, "Solves problems, submits code, views analytics")
  Rel(recruiter, codespectra, "Reviews candidates, certifications, assessments")
  Rel(admin, codespectra, "Configures platform, manages users, billing settings")
  Rel(anon, codespectra, "Views public pages, pricing, documentation")

  Rel(codespectra, firebase, "Authenticates users (email/password, OAuth)")
  Rel(codespectra, anthropic, "AI chat, code review, grading, agent, problem generation")
  Rel(codespectra, gemini, "Fast completions, hints, identity verification (vision)")
  Rel(codespectra, openai, "Interview service adaptive questions, AI chat")
  Rel(codespectra, razorpay, "Payment orders, verification, subscription management")
  Rel(codespectra, github, "OAuth integration, repository scan, PR comments")
  Rel(codespectra, piston, "Code execution sandbox — run/compile submissions")
  Rel(codespectra, mongodb, "Persists all user data, scans, submissions, billing")
  Rel(codespectra, email, "Sends transactional emails via Resend/SendGrid/SMTP")
```

## External System Details

| System | Purpose | Integration Method | Auth |
|--------|---------|--------------------|------|
| **Firebase Auth** | Authentication (primary provider) | Firebase Admin SDK v13 + Client SDK v11 | Service account + API key |
| **Anthropic API** | AI reasoning, chat, code review | `backend/ai_client.py` — SSE streaming via Anthropic Messages API | `ANTHROPIC_API_KEY` (env) / `x-anthropic-api-key` header |
| **Gemini API** | Fast completions, hints, vision | `backend/ai_client.py` — SSE streaming via Google Generative AI API | `x-goog-api-key` header (`GEMINI_API_KEY` env) |
| **OpenAI API** | Interview service, AI chat | Vercel AI SDK (`@ai-sdk/openai`) | API key via environment |
| **Razorpay** | Payment processing | `razorpay` npm package + webhooks | Key ID + Secret (env or DB) |
| **GitHub API** | OAuth, repos, file content, PRs | `frontend/lib/github-service.ts` — REST API v3 | OAuth token / GitHub App token |
| **Piston Engine** | Code execution | Docker container `ghcr.io/engineer-man/piston@sha256:…` (digest-pinned via PISTON_IMAGE) on port 2000 | None (internal network) |
| **MongoDB Atlas** | Primary database | `mongodb` npm driver v7.3.0 + `motor` Python driver | Connection string (env) |
| **Resend / SendGrid** | Email delivery | `frontend/lib/transactional-mail.ts` — multi-provider abstraction | API keys (env or DB secrets) |
