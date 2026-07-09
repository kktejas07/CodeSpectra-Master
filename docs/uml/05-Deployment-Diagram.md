# CodeSpectra Deployment Diagram

> **Auto-generated from codebase audit** — Last updated: 2026-07-08

---

## Physical Deployment Topology

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#6366f1', 'lineColor': '#64748b' }}}%
graph TB
    subgraph "Internet"
        User["User / Browser"]
        DNS["DNS: codespectra.com"]
        CF["Cloudflare\nCDN + DDoS Protection"]
    end

    subgraph "Dokploy / Docker Swarm (VPS)"
        subgraph "Docker Network: codespectra_default"
            Traefik["Traefik / Ingress\nPort 80/443 → Services"]

            subgraph "Frontend Container\ncodespectra-frontend-dmeptb"
                NextJS["Next.js 16\nApp Router\nPort 3000 (dev) / 80 (prod)"]
                NextAPI["API Routes\n/api/auth, /api/submissions,\n/api/analyze-code, etc."]
                NextInternal["Internal Routines\nSession Mgmt\nDatabase Access"]
            end

            subgraph "Backend Container\ncodespectra-backend (FastAPI)\nPort 8001"]
                FastAPI["FastAPI Proxy\nserver.py"]
                AIProxy["AI Router\n/internal/ai/*\nClaude / Gemini"]
            end

            subgraph "Piston Container\nghcr.io/engineer-man/piston\nPort 2000"]
                PistonAPI["Piston API\n/api/v2"]
                Sandbox["Isolated Code\nExecution Sandbox"]
            end
        end
    end

    subgraph "External Services"
        MongoDB["MongoDB Atlas\nDatabase: codespectra\nCollections: users, problems,\nsubmissions, scans, etc."]
        FirebaseAuth["Firebase Auth\nIdentity Platform\nGoogle OAuth, GitHub OAuth"]
        FirebaseAdmin["Firebase Admin SDK\nSession Cookie Mgmt"]
        Razorpay["Razorpay\nPayment Gateway\nOrders, Checkout, Webhooks"]
        GitHubOAuth["GitHub OAuth\nAPI v3\nRepository Access"]
        LLMGateway["Emergent LLM Gateway\nAnthropic Claude Sonnet 4.5\nGoogle Gemini 3 Flash"]
        Stripe["Stripe (Legacy)\nBilling SDK"]
        Nodemailer["SMTP / Nodemailer\nTransactional Email"]
    end

    subgraph "Storage"
        PistonVol["piston-data\nDocker Volume\nLanguage Images"]
    end

    User --> DNS
    DNS --> CF
    CF --> Traefik

    Traefik --> |/api/* → port 8001| FastAPI
    Traefik --> |/ (pages, static, _next/*, other /api/*)| NextJS

    FastAPI --> |Proxy /api/* to Next.js| NextJS
    FastAPI --> |Direct internal| AIProxy

    AIProxy --> |anthropic/claude-sonnet-4.5| LLMGateway
    AIProxy --> |gemini/gemini-3-flash| LLMGateway

    NextJS --> NextAPI
    NextJS --> NextInternal

    NextAPI --> |User CRUD| MongoDB
    NextAPI --> |Submissions| MongoDB
    NextAPI --> |Scans/Metrics| MongoDB
    NextAPI --> |Billing| MongoDB

    NextAPI --> |idToken verification| FirebaseAdmin
    NextAPI --> |Session cookies| FirebaseAdmin

    NextInternal --> |better-auth| FirebaseAuth
    NextAPI --> |execute code| PistonAPI
    PistonAPI --> Sandbox
    Sandbox --> PistonVol

    NextAPI --> |razorpay.orders.create()| Razorpay
    NextAPI --> |verifyPaymentSignature| Razorpay
    Razorpay --> |webhook POST| NextAPI

    NextAPI --> |OAuth start/callback| GitHubOAuth
    NextAPI --> |GET /user/repos| GitHubOAuth

    NextAPI --> |sendMail| Nodemailer
    NextAPI --> (Legacy) --> Stripe
```

---

## Docker Compose Service Architecture

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'primaryColor': '#0ea5e9' }}}%
graph LR
    subgraph "docker-compose.yml"
        direction TB
        PISTON[("piston\nImage: ghcr.io/engineer-man/piston\nPort: 2000\nPrivileged: true\nVolumes: piston-data\nHealthcheck: /api/v2/runtimes")]
        FRONTEND["frontend\nBuild: ./frontend/Dockerfile\nPort: 3000→80\nEnv: PISTON_URL\nDepends: piston (healthy)"]
        BACKEND["backend\nBuild: ./backend/Dockerfile\nPort: 8001→8000\nEnv: NEXTJS_INTERNAL_URL=http://frontend:80\nEnv: from ./backend/.env\nDepends: frontend"]
    end

    FRONTEND --> |"PISTON_URL=http://piston:2000/api/v2"| PISTON
    BACKEND --> |"NEXTJS_INTERNAL_URL=http://frontend:80"| FRONTEND
```

---

## Environment Variable Flow

| Container | Variable | Source | Used For |
|-----------|----------|--------|----------|
| **frontend** | `NEXT_PUBLIC_FIREBASE_*` | Docker build args | Firebase client SDK |
| **frontend** | `PISTON_URL` | `docker-compose.yml` env | Code execution endpoint |
| **frontend** | `MONGODB_URI` | `.env.local` (dev) / secrets (prod) | Database connection |
| **frontend** | `RAZORPAY_KEY_ID/SECRET` | `.env.local` / MongoDB `platform_settings` | Payment processing |
| **frontend** | `SESSION_SECRET` | `.env.local` | JWT session signing |
| **frontend** | `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | `.env.local` / MongoDB `platform_settings` | AI provider keys |
| **backend** | `NEXTJS_INTERNAL_URL` | `docker-compose.yml` env | Proxy target |
| **backend** | `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | `./backend/.env` | AI router |

> **Note:** Razorpay credentials and Piston URL can be configured at runtime via
> Admin → Settings → Integrations, stored in MongoDB `platform_settings` collection,
> taking priority over environment variables.
