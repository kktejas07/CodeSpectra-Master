/*
 * CodeSpectra service worker (docs/pwa.md). Registered from
 * components/pwa/pwa-mount.tsx in production builds only (scope "/").
 *
 * Routing rules live in /pwa-core.js (chooseStrategy, shared with the tests):
 *   static assets           → cache-first (versioned cache, trimmed)
 *   public pages            → stale-while-revalidate
 *   /api, signed-in HTML    → network only, never cached (HTML falls back to /offline)
 * Push: VAPID web push (lib/pwa/web-push.ts). FCM keeps its own worker in its
 * own scope (public/firebase-messaging-sw.js).
 * Updates: a new worker waits; the page shows "New version available" and
 * posts SKIP_WAITING when the user taps Refresh.
 */
importScripts('/pwa-core.js')

const core = self.CSPwaCore
const C = core.CACHES
const KNOWN_CACHES = [C.shell, C.static, C.pages]

// ─── Lifecycle ─────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(refreshShell().catch(() => undefined))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('cs-') && !KNOWN_CACHES.includes(n)).map((n) => caches.delete(n)))
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable() } catch (e) { /* unsupported */ }
    }
    await self.clients.claim()
  })())
})

/**
 * Precache the offline page, its scripts/styles and the icons. Rebuilt as a
 * whole so chunks from an older deploy do not pile up. The /offline HTML is
 * generic (no user data), so it is stored even though it is sent no-store.
 */
async function refreshShell() {
  const cache = await caches.open(C.shell)
  const keep = new Set()
  for (const url of core.SHELL_URLS) {
    try {
      const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' })
      if (res.status !== 200) continue
      if (url === core.OFFLINE_URL) {
        const html = await res.clone().text()
        const assets = new Set()
        const re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g
        let m
        while ((m = re.exec(html))) assets.add(m[1])
        for (const a of assets) {
          try {
            const r = await fetch(a, { credentials: 'same-origin' })
            if (r.status === 200) { await cache.put(a, r); keep.add(new URL(a, self.location.origin).href) }
          } catch (e) { /* skip one asset */ }
        }
      }
      await cache.put(url, res)
      keep.add(new URL(url, self.location.origin).href)
    } catch (e) { /* offline during install: keep what we had */ }
  }
  if (keep.size === 0) return
  for (const req of await cache.keys()) {
    if (!keep.has(req.url)) await cache.delete(req)
  }
}

// ─── Fetch routing ─────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const req = event.request
  const strategy = core.chooseStrategy({
    method: req.method,
    url: req.url,
    origin: self.location.origin,
    mode: req.mode,
    accept: req.headers.get('accept'),
    rsc: req.headers.has('rsc') || req.headers.has('next-router-state-tree'),
  })
  if (strategy === 'network-only') return
  if (strategy === 'cache-first') event.respondWith(cacheFirst(req))
  else if (strategy === 'stale-while-revalidate') event.respondWith(staleWhileRevalidate(event))
  else if (strategy === 'network-first') event.respondWith(networkFirst(event))
  else event.respondWith(networkWithOfflineFallback(event))
})

function cacheable(res) {
  return core.isCacheableResponse({ status: res.status, type: res.type, cacheControl: res.headers.get('cache-control') })
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (cacheable(res)) {
    const copy = res.clone()
    caches.open(C.static).then((c) => c.put(req, copy)).then(() => trim(C.static, core.STATIC_MAX_ENTRIES)).catch(() => undefined)
  }
  return res
}

async function fromNetwork(event) {
  const preloaded = await event.preloadResponse
  return preloaded || fetch(event.request)
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(C.pages)
  const hit = await cache.match(event.request)
  const network = fromNetwork(event).then((res) => {
    if (cacheable(res)) {
      const copy = res.clone()
      cache.put(event.request, copy).then(() => trim(C.pages, core.PAGES_MAX_ENTRIES)).catch(() => undefined)
    }
    return res
  })
  event.waitUntil(network.then(() => undefined, () => undefined))
  if (hit) return hit
  try { return await network } catch (e) { return offlinePage() }
}

async function networkFirst(event) {
  try { return await fromNetwork(event) } catch (e) { return offlinePage() }
}

async function networkWithOfflineFallback(event) {
  try { return await fromNetwork(event) } catch (e) { return offlinePage() }
}

async function offlinePage() {
  const hit = await caches.match(core.OFFLINE_URL)
  return hit || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

// ─── Messages from the app ─────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type
  if (type === 'SKIP_WAITING') self.skipWaiting()
  else if (type === 'REFRESH_SHELL') event.waitUntil(refreshShell().catch(() => undefined))
  else if (type === 'CLEAR_PAGES') event.waitUntil(caches.delete(C.pages))
  else if (type === 'FLUSH_QUEUE') event.waitUntil(flushFromWorker().catch(() => undefined))
})

// ─── Offline submissions (Background Sync) ─────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === core.SYNC_TAG) event.waitUntil(flushFromWorker())
})

async function csrfToken() {
  try {
    if (self.cookieStore) {
      const c = await self.cookieStore.get('csrf_token')
      if (c && c.value) return c.value
    }
  } catch (e) { /* no cookieStore in this browser */ }
  return null
}

async function flushFromWorker() {
  const run = async () => {
    const token = await csrfToken()
    const result = await core.flushQueue(
      core.idbQueueAdapter((item) => core.postQueued(item, token || item.csrf || null)),
      { interactive: false },
    )
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((c) => c.postMessage({ type: 'OFFLINE_QUEUE_UPDATED', result }))
    // Throwing lets Background Sync retry later while items still wait for the network.
    if (result.pending > 0) throw new Error('offline queue pending')
    return result
  }
  if (self.navigator && self.navigator.locks) return self.navigator.locks.request('cs-offline-flush', run)
  return run()
}

// ─── Web push ──────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let raw = {}
  try { raw = event.data ? event.data.json() : {} } catch (e) { raw = { body: event.data ? event.data.text() : '' } }
  const n = core.notificationFromPush(raw)
  event.waitUntil(Promise.all([
    self.registration.showNotification(n.title, n.options),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED' }))),
  ]))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription
    const key = old && old.options && old.options.applicationServerKey
    if (!key) return
    const sub = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    const json = sub.toJSON()
    const token = await csrfToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['x-csrf-token'] = token
    await fetch('/api/push/subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, replaces: old ? old.endpoint : undefined }),
    })
  })().catch(() => undefined))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = core.safeLink(event.notification.data && event.notification.data.url)
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        await c.focus()
        if ('navigate' in c) await c.navigate(url).catch(() => undefined)
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
