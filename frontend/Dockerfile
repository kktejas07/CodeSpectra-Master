FROM node:22-alpine
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
# Secrets (Didit KYC, payment, AI keys …) are NEVER build args: build args and
# ENV lines are kept in the image layers/history. Pass them at runtime
# (docker-compose `environment`, Dokploy env) — see docs/devops/05-Production-Checklist.md.
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV PISTON_URL=http://piston:2000/api/v2
RUN apk add --no-cache docker-cli chromium ffmpeg nss freetype harfbuzz ca-certificates ttf-freefont font-noto gcompat mesa-egl mesa-gbm \
  && mv /bin/setpriv /bin/setpriv.busybox \
  && printf '%s\n' \
    '#!/bin/sh' \
    '# Remotion passes --pdeathsig; Alpine BusyBox setpriv lacks it. Strip flags and exec.' \
    'while [ $# -gt 0 ]; do' \
    '  case "$1" in' \
    '    --) shift; break ;;' \
    '    --pdeathsig|--pdeathsig=*) if [ "$1" = "--pdeathsig" ]; then shift; fi; shift ;;' \
    '    --reuid|--regid|--inh-caps|--ambient-caps) shift; [ $# -gt 0 ] && case "$1" in -*) ;; *) shift ;; esac ;;' \
    '    -*) shift ;;' \
    '    *) break ;;' \
    '  esac' \
    'done' \
    'exec "$@"' \
    > /bin/setpriv \
  && chmod +x /bin/setpriv
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Leave REMOTION_BROWSER_EXECUTABLE unset so Remotion uses chrome-headless-shell
# (glibc binary via gcompat). Override only if you install a working Chromium.
WORKDIR /app
# SEC-023: build and run as the image's unprivileged `node` user (uid 1000).
# Everything the app writes at runtime goes to /tmp (mkdtemp) or /app/.next.
# docker-cli stays for the optional admin "containers" panel; it only works if
# an operator deliberately mounts the Docker socket (and adds the group).
RUN chown node:node /app
USER node
# patches/ must exist before yarn install — postinstall runs patch-package
COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node patches ./patches
# Same layer, so the ~6 GB yarn cache never lands in the image.
RUN yarn install --frozen-lockfile && yarn cache clean
COPY --chown=node:node . .
# ponytail: self-host face-api models (~6.7MB) so verification never depends
# on a third-party CDN at runtime (outages/throttling/regional blocks stalled
# face capture with zero feedback). Best-effort: the loader falls back to
# jsdelivr if any file is missing, so a mirror hiccup can't break the build.
RUN mkdir -p public/models && for f in tiny_face_detector_model-weights_manifest.json tiny_face_detector_model.bin face_landmark_68_tiny_model-weights_manifest.json face_landmark_68_tiny_model.bin face_recognition_model-weights_manifest.json face_recognition_model.bin; do wget -q -O "public/models/$f" "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/$f" || echo "WARN: face model $f not mirrored, CDN fallback covers runtime"; done; ls -la public/models/
# markdown docs must be present at /app/docs (mirrored into frontend/docs for this context)
RUN test -d docs/public || (echo "ERROR: docs/public missing — run scripts/sync-docs.cjs before build" && exit 1)
RUN chmod +x scripts/docker-entrypoint.sh \
  && npx patch-package \
  && node scripts/ensure-anon-aadhaar-types.cjs
# The app outgrew Node's default heap (CI build aborted with exit 134).
# Override with --build-arg NODE_BUILD_HEAP_MB=… on smaller build hosts.
ARG NODE_BUILD_HEAP_MB=6144
# .next/cache/webpack is ~4 GB of build-only state; fetch-cache stays (it is the
# runtime Data Cache). Together with the yarn cache this halves the image.
RUN NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_HEAP_MB} yarn build && rm -rf .next/cache/webpack
# ponytail: busybox wget is the probe (no curl in node:22-alpine). Compose
# healthcheck overrides this when deployed via compose; this covers plain builds.
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=60s CMD wget -q -O- http://localhost:80/api/health >/dev/null 2>&1 || exit 1
# Port 80 as non-root: Docker grants the bind via net.ipv4.ip_unprivileged_port_start=0
# (default since Docker 20.10). Override PORT if your runtime doesn't.
ENV PORT=80
EXPOSE 80
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
# scripts/server.mjs = `next start` + the real socket peer for client-IP checks (SEC-021).
CMD ["node", "scripts/server.mjs"]
