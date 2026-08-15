# CodeSpectra

**AI Engineering Platform — Code Quality, Security, Assessments & AI-Powered Development**

---

## Overview

CodeSpectra is an all-in-one AI engineering platform that combines the capabilities of HackerRank and SonarQube into a single, unified solution. It empowers engineering organizations to ship higher-quality code faster by automating code reviews, static analysis, security scanning, and technical debt tracking — all powered by state-of-the-art AI models.

Built for modern engineering teams, CodeSpectra provides end-to-end coverage of the software development lifecycle: from writing and reviewing code, to running assessments and certifications, to monitoring engineering analytics and team performance. Whether you are a startup shipping your first product or an enterprise managing multiple teams across repositories, CodeSpectra enforces quality gates, detects vulnerabilities before they reach production, and provides structured learning paths to upskill your engineers.

---

## Features

| Icon | Feature | Description |
|------|---------|-------------|
| 🤖 | **AI Code Reviews** | Automated pull request review using Claude, Gemini, and GPT-4 with contextual understanding |
| 🔍 | **Static Analysis** | 40+ linting and style rules covering TypeScript, Python, Go, Rust, and more |
| 🛡️ | **Security Scanning** | SAST, secret detection, dependency scanning, and OWASP Top 10 coverage |
| 📝 | **Coding Assessments** | Custom challenges and standardized tests for hiring and internal skilling |
| 🎓 | **Learning Paths & Certifications** | Role-based curricula with verified certifications and progress tracking |
| 👥 | **Team Management & RBAC** | Multi-tenant RBAC with admin, manager, and developer roles |
| 📊 | **Quality Gates & Metrics** | Enforce branch policies with configurable quality thresholds and dashboards |
| 🔗 | **GitHub Integration** | Seamless webhook-based integration with GitHub repositories |
| 💬 | **AI Chat Assistant** | Ask questions about your codebase, get refactoring suggestions, and generate tests |
| 🚀 | **Code Execution Sandbox** | Execute code safely in 40+ languages via Piston sandbox |
| 🎙️ | **AI-Powered Interviews** | Real-time pair programming interviews with AI moderation and scoring |
| 📈 | **Engineering Analytics** | DORA metrics, cycle time, deployment frequency, and trend analysis |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| **Backend** | FastAPI (Python 3.12), Next.js API Routes |
| **Database** | MongoDB 7.x (Atlas) |
| **Auth** | Firebase Auth + JWT session cookies |
| **AI** | Anthropic Claude, Google Gemini, OpenAI GPT-4 |
| **Code Execution** | Piston (sandboxed code runner) |
| **Payments** | Razorpay |
| **Container** | Docker, Docker Compose |

---

## Getting Started

```bash
git clone https://github.com/your-org/codespectra.git
cd codespectra
cp .env.example .env
docker compose up -d
```

The platform will be available at `http://localhost:3000`. Refer to `docs/public/getting-started.md` for a full setup walkthrough.

---

## Project Structure

```
/frontend         — Next.js application (pages, API routes, components, lib)
/backend          — FastAPI proxy service + AI orchestration
/docs             — Documentation organized by audience
  /public         — Getting started, features, pricing, tutorials
  /user           — User guides, admin guides, feature docs
  /developer      — Architecture, API reference, database, security
  /compliance     — Enterprise, audit, government documentation
/scripts          — Build, seed, backup, and migration scripts
/infrastructure   — Docker Compose files and container configuration
```

---

## Documentation

CodeSpectra documentation is organized by audience for easy navigation:

| Path | Audience |
|------|----------|
| `docs/public/` | End users — getting started, features, pricing, tutorials |
| `docs/user/` | Platform users — user guides, admin guides, feature documentation |
| `docs/developer/` | Contributors — architecture, API reference, database schema, security model |
| `docs/compliance/` | Enterprise — SOC 2, audit trails, government compliance |

---

## Security

Security documentation is maintained under `docs/security/`. All secrets, credentials, and API keys must be stored in environment variables or a secrets manager — never committed to the repository.

> **⚠️ Security Notice**  
> If you forked or cloned this repository before July 2026, rotate your MongoDB credentials immediately. Database connection strings were previously committed to version control and may be present in your git history.

For reporting vulnerabilities, please follow the process outlined in `docs/security/responsible-disclosure.md`.

---

## Development

### Frontend

```bash
cd frontend
yarn install
yarn dev
```

The frontend development server runs on `http://localhost:3000` with hot module replacement.

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn server:app --reload --port 8000
```

The backend API is available at `http://localhost:8000` with automatic Swagger docs at `/docs`.

---

## License & Status

- **Status:** Alpha — Active Development  
- **License:** Proprietary. All rights reserved. See `LICENSE` for terms.

CodeSpectra is currently in active alpha development. APIs, data models, and features are subject to change. For production inquiries, contact the maintainers.
