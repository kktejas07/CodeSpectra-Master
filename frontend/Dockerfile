FROM node:22-alpine
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG DIDIT_API_KEY
ARG DIDIT_WEBHOOK_SECRET
ARG DIDIT_WORKFLOW_ID
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
ENV DIDIT_API_KEY=${DIDIT_API_KEY}
ENV DIDIT_WEBHOOK_SECRET=${DIDIT_WEBHOOK_SECRET}
ENV DIDIT_WORKFLOW_ID=${DIDIT_WORKFLOW_ID}
ENV PISTON_URL=http://piston:2000/api/v2
RUN apk add --no-cache docker-cli chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto gcompat mesa-egl mesa-gbm \
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
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN chmod +x scripts/docker-entrypoint.sh
RUN yarn build
EXPOSE 80
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["npx", "next", "start", "-p", "80"]
