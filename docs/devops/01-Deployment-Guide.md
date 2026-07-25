# Deployment Guide — CodeSpectra

> **Last Updated:** 2026-07-08  
> **Deployment Target:** Docker Compose (3 containers)  
> **Production Host:** Dokploy (Docker Swarm)  

---

## Architecture Overview

```
                          Internet
                             │
                    ┌────────┴────────┐
                    │   DNS / Ingress  │
                    │  (Cloudflare?)   │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
         :3000 ┌┴┐      :8001 ┌┴┐     :2000 ┌┴┐
         ┌─────┴─┐     ┌─────┴─┐    ┌──────┴──┐
         │Frontend│────▶│Backend │    │ Piston  │
         │Next.js │     │FastAPI │    │Sandbox  │
         │  :80   │     │ :8000  │    │  :2000  │
         └───┬────┘     └───┬────┘    └────┬────┘
             │              │              │
             └──────────────┴──────────────┘
                        Docker Network
```

---

## Docker Compose Setup

Three services defined in `docker-compose.yml`:

### Service 1: Piston (Code Execution Sandbox)

```yaml
piston:
  image: ghcr.io/engineer-man/piston:latest
  container_name: codespectra-piston
  privileged: true
  ports: ["2000:2000"]
  volumes: ["piston-data:/piston"]
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:2000/api/v2/runtimes"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 60s
```

- Runs as `privileged` for container-in-container execution isolation
- Healthcheck waits for `/api/v2/runtimes` to return 200
- Persistent volume `piston-data` for cached runtimes

### Service 2: Frontend (Next.js)

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
    args:
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
      NEXT_PUBLIC_FIREBASE_API_KEY: ${NEXT_PUBLIC_FIREBASE_API_KEY}
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
      NEXT_PUBLIC_FIREBASE_APP_ID: ${NEXT_PUBLIC_FIREBASE_APP_ID}
  ports: ["3000:80"]
  environment:
    - PISTON_URL=http://piston:2000/api/v2
  depends_on:
    piston: condition: service_healthy
```

- Node 22 Alpine base image
- Firebase config baked in at build time (ARG → ENV)
- Port 80 inside container, mapped to host 3000
- Depends on Piston being healthy before starting

### Service 3: Backend (FastAPI Proxy)

```yaml
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile
  ports: ["8001:8000"]
  environment:
    - NEXTJS_INTERNAL_URL=http://frontend:80
  env_file:
    - ./backend/.env
  depends_on:
    - frontend
```

- Python 3.12-slim base
- Proxies `/api/*` requests to Next.js on port 80
- Reads MongoDB credentials from `backend/.env`
- Depends on frontend (but no healthcheck condition)

---

## Environment Variables

### Required (Build Time — Frontend Docker ARGs)

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (e.g., https://codespectra.ai) | `.env.docker` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (project.firebaseapp.com) | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID | Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | Firebase Console |

### Required (Runtime — Backend .env)

| Variable | Description | Source |
|----------|-------------|--------|
| `MONGO_URL` | MongoDB connection string (Atlas SRV) | MongoDB Atlas |
| `DB_NAME` | Database name (default: `codespectra`) | `.env.docker` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `.env.docker` |
| `NEXTJS_INTERNAL_URL` | Internal Next.js URL for proxy | `docker-compose.yml` |

### Required (Runtime — Frontend Container)

| Variable | Description | Source |
|----------|-------------|--------|
| `PISTON_URL` | Piston API URL (internal Docker network) | `docker-compose.yml` |

### Optional / Service-Specific

| Variable | Description | Source |
|----------|-------------|--------|
| `SESSION_SECRET` | JWT session signing secret (32+ chars) | Admin config |
| `FIREBASE_PROJECT_ID` | Firebase Admin project ID | Firebase Console |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin service account email | Firebase Console |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin private key | Firebase Console |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key (base64, 32 bytes) | `openssl rand -base64 32` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | GitHub Settings |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App secret | GitHub Settings |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL for rate limiting | Upstash Console |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Upstash Console |
| `ANTHROPIC_API_KEY` | API key for Claude (Anthropic) | Anthropic Console |
| `GEMINI_API_KEY` | API key for Gemini (Google) | Google AI Studio |
| `INTERNAL_BACKEND_URL` | Backend URL for AI calls (default `http://localhost:8001`) | Docker network |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway key ID | Razorpay Dashboard |
| `RAZORPAY_KEY_SECRET` | Razorpay payment gateway secret | Razorpay Dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret | Razorpay Dashboard |

**Total: ~24 documented variables** (7 build-time, 4 runtime-mandatory, 13 optional)

---

## MongoDB Atlas Connection

Connection string format from `.env.docker`:
```
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=codespectra
DB_NAME=codespectra
```

**Collection list** (key collections from `frontend/lib/db/*`):
- `users` — User profiles and credentials
- `platform_settings` — Dynamic secrets and settings
- `challenges` — Coding challenges
- `problems` — Coding problems
- `submissions` — User submissions
- `workflows` — Workflow definitions
- `roles` — RBAC role definitions with permissions
- `account` — OAuth account tokens (GitHub, Google)
- `user` — Per-user data (2FA, preferences)
- `billing_orders`, `billing_payments`, `billing_subscriptions` — Billing
- `admin_audit_logs` — Audit trail collection
- `web_vitals_events` — Client-side performance data

---

## Piston Sandbox Configuration

- **Image:** `ghcr.io/engineer-man/piston:latest`
- **Mode:** `privileged: true` (required for container-in-container)
- **Port:** `2000`
- **Healthcheck:** `/api/v2/runtimes` endpoint
- **API URL inside frontend:** `http://piston:2000/api/v2` (auto-set via docker-compose env)
- **Volume:** `piston-data:/piston` (persists cached language runtimes)
- **Configurable via Admin UI:** `PISTON_URL`, `PISTON_RUN_TIMEOUT_MS`, `PISTON_MAX_CONCURRENT` in Server Secrets

---

## Build & Deployment Steps

### Local Development

```bash
# Install dependencies
cd frontend
yarn install

# Start dev server (requires MongoDB + Firebase)
yarn dev            # Next.js on :3000

# Start backend (FastAPI proxy)
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Start Piston (Docker)
docker run -d --privileged -p 2000:2000 -v piston-data:/piston ghcr.io/engineer-man/piston:latest
```

### Docker Compose Deployment

```bash
# 1. Clone and configure
git clone <repo>
cd CodeSpectra-Master

# 2. Set environment variables
cp .env.docker .env
# Edit .env with your values

# 3. Set backend secrets
cp backend/.env.example backend/.env
# Edit backend/.env with MongoDB URI

# 4. Build and start
docker compose build --no-cache
docker compose up -d

# 5. Verify
curl http://localhost:3000            # Frontend
curl http://localhost:8001/__proxy_health  # Backend
curl http://localhost:2000/api/v2/runtimes # Piston
```

### Production Deployment (Dokploy / Docker Swarm)

```bash
# Build on server (from AGENTS.md)
docker exec <container> sh -c "cd /app && yarn build"
docker commit <container> codespectra-frontend-dmeptb:patched
docker service update --image codespectra-frontend-dmeptb:patched --force codespectra-frontend-dmeptb
```

---

## DNS & Ingress Configuration

### DNS Records

```
Type    Name                Value
A       codespectra.ai      <server-ip>
CNAME   www.codespectra.ai  codespectra.ai
```

### Nginx Reverse Proxy (if not using Dokploy)

```nginx
server {
    listen 80;
    server_name codespectra.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name codespectra.ai;

    ssl_certificate     /etc/letsencrypt/live/codespectra.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codespectra.ai/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloudflare (Recommended)

- **SSL/TLS:** Full (Strict)
- **Rate Limiting:** Enable for `/api/auth/*` and `/api/billing/*`
- **WAF:** Block common attack patterns
- **Caching:** Cache static assets with 1-year TTL
