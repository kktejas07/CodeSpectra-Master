# Reverse proxy, client IPs and network exposure

Security wave 4 (SEC-001, SEC-017, SEC-021, SEC-022). Read this before deploying
`docker-compose.yml` or changing the Dokploy/Traefik setup.

## What is published

| Service | Compose | Reachable from |
|---|---|---|
| frontend (Next.js, `scripts/server.mjs`) | `127.0.0.1:3000:80` | the host only — put a reverse proxy in front |
| backend (FastAPI) | `expose: 8000`, **no port mapping** | the compose network only (`http://backend:8000`) |
| piston | `expose: 2000` | the compose network only |

The backend's `/internal/*` routes and `/api/item-bank/*` now require the
`x-internal-secret` header (timing-safe compare). The Next.js app sends it on
every server-to-server call. Set the same `INTERNAL_BACKEND_SECRET` (32+ chars)
for the frontend, the course worker and `backend/.env` (or save it once in
Admin → Settings — both sides fall back to the Mongo copy).

The backend also no longer sends AI keys to a caller-chosen base URL:
`endpoint_override` must be a built-in provider endpoint, an endpoint a
superadmin saved in Admin → Settings → AI, or listed in `AI_ENDPOINT_ALLOWLIST`
(comma-separated URLs or hostnames; plain `http://` only when given as a full URL,
e.g. `http://ollama:11434`).

Do **not** route `/api/*` from the proxy to the backend any more. Everything goes
to the frontend; the frontend calls the backend internally.

## Client IP (rate limits, IP blocks, audit logs)

`X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP` are trusted **only** when
the TCP peer is in `TRUSTED_PROXY_CIDRS` (comma-separated). `docker-compose.yml`
defaults it to the Docker bridge range `172.16.0.0/12,127.0.0.1`.

If it is empty and the peer is a private / loopback / link-local address (so a
local reverse proxy or Docker gateway is clearly in front), the app trusts exactly
**one** hop — the right-most `X-Forwarded-For` entry that proxy appended — and
logs a one-time warning asking you to set `TRUSTED_PROXY_CIDRS`. A public peer
never has its forwarding headers honoured without the setting.

- `scripts/server.mjs` (Dockerfile `CMD` and `yarn start`) records the real socket peer on every
  request. Plain `next start` (`yarn start:next`) cannot, so the right-most `X-Forwarded-For` hop is
  used instead — only safe while the port is reachable through the proxy alone.
- `TRUST_CF_CONNECTING_IP=true` additionally honours `CF-Connecting-IP`, but only
  from a trusted peer. Turn it on only when **every** request reaches the trusted
  proxy through Cloudflare (otherwise a client can set the header itself).
- The login auto-block now needs 50+ failures across 10+ different accounts from
  one public IP; private, loopback, proxy and unknown addresses are never auto-blocked.

Typical values:

| Setup | `TRUSTED_PROXY_CIDRS` |
|---|---|
| Caddy/Nginx on the host → `127.0.0.1:3000` | the Docker bridge gateway, e.g. `172.17.0.1/32` (check `docker network inspect`), plus `127.0.0.1` |
| Traefik / Dokploy overlay network | the overlay subnet, e.g. `10.0.1.0/24` |
| Cloudflare → Caddy → app | Caddy's address as above, and `TRUST_CF_CONNECTING_IP=true` |

## Caddy

```caddyfile
codespectra.ai {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        # Caddy appends the client to X-Forwarded-For and sets X-Real-IP-like
        # headers itself; it does not trust client-supplied values by default.
        header_up X-Real-IP {remote_host}
    }
}
```

Behind Cloudflare, also tell Caddy which peers may set the client IP
(`servers { trusted_proxies static <cloudflare ranges> }`) and firewall the origin
to Cloudflare's ranges.

## Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name codespectra.ai;
    ssl_certificate     /etc/letsencrypt/live/codespectra.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/codespectra.ai/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        # Overwrite (not append) — the app trusts these only from this proxy.
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If Nginx itself sits behind Cloudflare, use `set_real_ip_from <cloudflare ranges>;`
+ `real_ip_header CF-Connecting-IP;` so `$remote_addr` is the visitor.

## Firewall

Allow 80/443 to the proxy only. Nothing else (3000, 8000/8001, 2000, 27017) should
be reachable from the internet; check with `ss -tlnp` and an external port scan.

## Database backup credentials (SEC-017)

`scripts/backup/*.sh` no longer contain the Mongo password. Put
`MONGO_BACKUP_URI="mongodb://<user>:<password>@localhost:27017/?authSource=admin"`
in `/etc/codespectra/mongo-backup.env` (root, `chmod 600`; `setup_backup.sh`
creates the file).

**The old password was committed to git and must be treated as public:**

1. Rotate it now: `db.getSiblingDB('admin').changeUserPassword('mongo', '<new>')`,
   then update `MONGODB_URI` everywhere (Dokploy env, `backend/.env`, the backup env file).
2. Purge it from history (coordinate with everyone who has a clone — this rewrites
   every commit hash):
   ```bash
   # git filter-repo (preferred)
   printf '<OLD_PASSWORD>==>***REMOVED***\n' > /tmp/replacements.txt
   git filter-repo --replace-text /tmp/replacements.txt
   # or BFG
   bfg --replace-text /tmp/replacements.txt
   git push --force --all && git push --force --tags
   ```
   Then ask GitHub support to drop cached views / PR refs, and have every
   contributor re-clone. Rotation (step 1) is what actually protects you; the
   purge only stops the old value from spreading further.
