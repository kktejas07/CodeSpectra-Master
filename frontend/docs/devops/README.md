# DevOps Documentation

> **Auto-Generated**: This index is maintained manually. Last updated: 2026-07-08.

**Audience:** Internal Engineering — for DevOps engineers, system administrators, and deployment managers.

**Purpose:** Deployment, Docker, CI/CD, monitoring, infrastructure configuration.

## Documents

| File | Description |
|------|-------------|
| [01-Deployment-Guide.md](./01-Deployment-Guide.md) | Deployment guide — production deployment walkthrough for Docker Compose and Dokploy (Docker Swarm), environment variable configuration, secrets management, and deployment checklist. |
| [02-Docker-Architecture.md](./02-Docker-Architecture.md) | Docker architecture — container definitions (frontend, backend, AI service), Dockerfile breakdown, multi-stage builds, image optimization, and docker-compose.yml reference. |
| [03-CICD-Pipeline.md](./03-CICD-Pipeline.md) | CI/CD pipeline — current manual deployment process, proposed automated pipeline (lint, test, build, deploy stages), GitHub Actions configuration, and rollout strategies. |
| [05-Production-Checklist.md](./05-Production-Checklist.md) | Production checklist — required secrets (SECRETS_ENCRYPTION_KEY, ATS_ENCRYPTION_KEY, CRON_SECRET…), the shared scheduler and when to add an external cron, workers, every provider webhook URL, network/security checks. |
| [04-Monitoring.md](./04-Monitoring.md) | Monitoring — current state (client-side Web Vitals only), recommended monitoring stack (logs, metrics, traces, alerts), dashboard design, and incident response plan. |
| [07-Email-Deliverability.md](./07-Email-Deliverability.md) | Email deliverability — SPF, DKIM, DMARC and return-path DNS for the Postal sending domain, one-click unsubscribe headers, reply-to and unsubscribe-link secrets. |
| [08-Secret-Rotation.md](./08-Secret-Rotation.md) | Secret rotation — what leaked in git history, rotation runbooks per provider (Firebase, MongoDB, internal secret, Google keys, AI, Stripe/Razorpay/PhonePe, Meta/Vapi/Twilio/Checkr…), dev/prod separation, spending limits, history purge with git filter-repo, GitHub secret scanning / push protection / Dependabot / CodeQL. |
| [09-RAG-Vector-Store.md](./09-RAG-Vector-Store.md) | Knowledge search vector store — how vectors are stored/searched in MongoDB today, the optional Postgres + pgvector store (provisioning, TLS, sizing, backups), the resumable backfill and the read switch. |

## Document Count

**9 documents** in this section.
