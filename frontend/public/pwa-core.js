/*
 * CodeSpectra PWA core (docs/pwa.md).
 *
 * One plain-JS file shared by:
 *  - the service worker (public/sw.js → importScripts('/pwa-core.js') → self.CSPwaCore)
 *  - the app (lib/pwa/* import it; bundled by Next)
 *  - the tests (tests/pwa-core.test.ts)
 * so the cache routing, push parsing and offline-queue rules exist once.
 *
 * Rules that matter for privacy:
 *  - /api/**, RSC payloads, token links and every page that is not in the
 *    public allow-list are NEVER cached (network-only). Signed-in HTML only
 *    falls back to the generic /offline page when the network is down.
 *  - Only 200 same-origin responses without `private` / `no-store` are cached.
 *  - The offline store holds question payloads (statement, samples, starter
 *    code — never hidden tests or solutions) and the user's own queued
 *    answers; it is wiped on sign-out (lib/pwa/offline-store.ts).
 */
;(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  if (root) root.CSPwaCore = api
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict'

  /** Bump when the caching rules or the precache list change (old caches are deleted on activate). */
  var CACHE_VERSION = 'v1'
  var CACHES = {
    shell: 'cs-shell-' + CACHE_VERSION,
    static: 'cs-static-' + CACHE_VERSION,
    pages: 'cs-pages-' + CACHE_VERSION,
  }
  var STATIC_MAX_ENTRIES = 300
  var PAGES_MAX_ENTRIES = 40
  var OFFLINE_URL = '/offline'
  var SHELL_URLS = [OFFLINE_URL, '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/badge-96.png']
  var SYNC_TAG = 'cs-offline-submissions'

  /** Hashed / versioned static files: cache-first. */
  var STATIC_PREFIXES = ['/_next/static/', '/icons/', '/illustrations/', '/covers/']
  var STATIC_FILES = ['/icon.svg', '/favicon.ico', '/apple-touch-icon.png', '/apple-icon.svg']

  /**
   * Public, user-independent pages (a subset of lib/seo/public-routes
   * isPublicMarketingPath — tests/pwa-core.test.ts keeps them in sync):
   * stale-while-revalidate so they open instantly and work offline once seen.
   */
  var PUBLIC_PAGES = ['/', '/about', '/faq', '/features', '/pricing', '/learn', '/events', '/contests', '/hackathons', '/companies', '/news', '/docs', '/leagues', '/privacy', '/terms', '/cookies', '/security', '/support', '/status']
  var PUBLIC_PAGE_PREFIXES = ['/learn/', '/events/', '/companies/', '/docs/', '/news/', '/compare/', '/leagues/']

  function stripTrailingSlash(p) {
    return p.length > 1 && p.charAt(p.length - 1) === '/' ? p.slice(0, -1) : p
  }

  function isPublicPage(pathname) {
    var p = stripTrailingSlash(pathname)
    if (PUBLIC_PAGES.indexOf(p) !== -1) return true
    for (var i = 0; i < PUBLIC_PAGE_PREFIXES.length; i++) {
      if (pathname.indexOf(PUBLIC_PAGE_PREFIXES[i]) === 0) return true
    }
    return false
  }

  function isStaticAsset(pathname) {
    if (STATIC_FILES.indexOf(pathname) !== -1) return true
    for (var i = 0; i < STATIC_PREFIXES.length; i++) {
      if (pathname.indexOf(STATIC_PREFIXES[i]) === 0) return true
    }
    return /\.woff2?$/.test(pathname)
  }

  /**
   * Pick how the service worker handles a request.
   * @param {{ method: string, url: string, origin: string, mode?: string, accept?: string, rsc?: boolean }} req
   * @returns {'network-only' | 'cache-first' | 'stale-while-revalidate' | 'network-first' | 'network-only-offline-fallback'}
   *   network-only: the SW does not touch it (never cached).
   *   network-only-offline-fallback: signed-in / private HTML — network, never cached; /offline when the network fails.
   */
  function chooseStrategy(req) {
    if (!req || String(req.method || 'GET').toUpperCase() !== 'GET') return 'network-only'
    var u
    try { u = new URL(req.url) } catch (e) { return 'network-only' }
    if (u.origin !== req.origin) return 'network-only'
    var path = u.pathname
    if (path.indexOf('/api/') === 0 || path === '/api') return 'network-only'
    if (path === '/sw.js' || path === '/pwa-core.js' || path === '/firebase-messaging-sw.js') return 'network-only'
    // RSC / router payloads can carry per-user data; token links are private.
    if (req.rsc || u.searchParams.has('_rsc')) return 'network-only'
    if (/(^|&)[^=&]*token=/i.test(u.search.slice(1))) return 'network-only'
    if (path.indexOf('/_next/image') === 0 || path.indexOf('/_next/data/') === 0) return 'network-only'
    if (isStaticAsset(path)) return 'cache-first'
    var isDocument = req.mode === 'navigate' || /text\/html/.test(req.accept || '')
    if (!isDocument) return 'network-only'
    if (stripTrailingSlash(path) === OFFLINE_URL) return 'network-first'
    if (isPublicPage(path)) return 'stale-while-revalidate'
    return 'network-only-offline-fallback'
  }

  /**
   * May this response be written to a cache?
   * @param {{ status: number, type?: string, cacheControl?: string | null }} res
   */
  function isCacheableResponse(res) {
    if (!res || res.status !== 200) return false
    if (res.type && res.type !== 'basic' && res.type !== 'default') return false
    var cc = String(res.cacheControl || '').toLowerCase()
    return cc.indexOf('no-store') === -1 && cc.indexOf('private') === -1
  }

  // ─── Push ───────────────────────────────────────────────────────────────

  /** Same-origin relative path or the dashboard (never an open redirect). */
  function safeLink(link) {
    var s = typeof link === 'string' ? link.trim() : ''
    if (!s || s.charAt(0) !== '/' || s.charAt(1) === '/' || s.charAt(1) === '\\') return '/dashboard'
    return s.slice(0, 512)
  }

  /**
   * Notification title + options from a push message body. Accepts our VAPID
   * payload (lib/pwa/push-payload.ts: { v, title, body, url, tag, data })
   * and the FCM web shape ({ notification, data, fcmOptions }).
   */
  function notificationFromPush(raw) {
    var d = raw && typeof raw === 'object' ? raw : {}
    var n = d.notification && typeof d.notification === 'object' ? d.notification : null
    var data = d.data && typeof d.data === 'object' ? d.data : {}
    var title = String((n && n.title) || d.title || 'CodeSpectra').slice(0, 120)
    var body = String((n && n.body) || d.body || '').slice(0, 400)
    var link = d.url || (d.fcmOptions && d.fcmOptions.link) || data.link || data.url
    var tag = String(d.tag || data.notification_id || data.tag || '').slice(0, 64)
    var options = {
      body: body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: safeLink(link), type: String(data.type || '') },
    }
    if (tag) options.tag = tag
    return { title: title, options: options }
  }

  // ─── Offline queue ──────────────────────────────────────────────────────

  /**
   * What to do with a queued submission after a sync attempt.
   * 0 = network error (offline / aborted).
   * @returns {'done' | 'retry' | 'auth' | 'rejected'}
   */
  function classifySyncResponse(status) {
    if (status >= 200 && status < 300) return 'done'
    if (!status || status === 408 || status === 425 || status === 429 || status >= 500) return 'retry'
    if (status === 401 || status === 403) return 'auth'
    return 'rejected'
  }

  /** Exponential backoff: 15 s, 30 s, 1 min … capped at 30 min. */
  function retryDelayMs(attempts) {
    var n = Math.max(0, (attempts || 1) - 1)
    return Math.min(30 * 60 * 1000, 15000 * Math.pow(2, Math.min(n, 10)))
  }

  var SENDING_STALE_MS = 2 * 60 * 1000
  var MAX_ATTEMPTS = 12

  /** Is this queue item due for an attempt now? `interactive` = a signed-in tab is flushing. */
  function isDue(item, now, interactive) {
    if (!item) return false
    if (item.state === 'queued') return true
    if (item.state === 'retry') return !item.next_attempt_at || item.next_attempt_at <= now
    if (item.state === 'auth') return !!interactive
    if (item.state === 'sending') return !item.sending_at || now - item.sending_at > SENDING_STALE_MS
    return false
  }

  /**
   * Send every due queue item once, oldest first.
   * adapter: { list(): Promise<Item[]>, put(item): Promise<void>,
   *            send(item): Promise<{ status: number, body?: any }> }
   * Stops at the first network/auth failure (no point hammering while offline
   * or signed out). The server validates every submission as usual.
   * @returns {Promise<{ synced: number, rejected: number, pending: number }>}
   */
  async function flushQueue(adapter, opts) {
    var o = opts || {}
    var now = typeof o.now === 'number' ? o.now : Date.now()
    var all = await adapter.list()
    var due = all
      .filter(function (i) { return isDue(i, now, o.interactive) })
      .sort(function (a, b) { return (a.created_at || 0) - (b.created_at || 0) })
    var out = { synced: 0, rejected: 0, pending: 0 }
    var stopped = false
    for (var k = 0; k < due.length; k++) {
      var item = due[k]
      if (stopped) { out.pending++; continue }
      item.state = 'sending'
      item.sending_at = now
      await adapter.put(item)
      var res
      try { res = await adapter.send(item) } catch (e) { res = { status: 0 } }
      var status = res && typeof res.status === 'number' ? res.status : 0
      var kind = classifySyncResponse(status)
      item.attempts = (item.attempts || 0) + 1
      item.last_status = status
      delete item.sending_at
      if (kind === 'done') {
        item.state = 'synced'
        item.synced_at = now
        item.result = summarizeResult(res.body)
        out.synced++
      } else if (kind === 'rejected' || item.attempts >= MAX_ATTEMPTS) {
        item.state = 'rejected'
        item.error = errorText(res.body, status)
        out.rejected++
      } else if (kind === 'auth') {
        item.state = 'auth'
        out.pending++
        stopped = true
      } else {
        item.state = 'retry'
        item.next_attempt_at = now + retryDelayMs(item.attempts)
        out.pending++
        stopped = true
      }
      await adapter.put(item)
    }
    return out
  }

  function summarizeResult(body) {
    var b = body && typeof body === 'object' ? body : {}
    // /api/submissions → { status, passed_tests, total_tests, score }
    var r = { status: typeof b.status === 'string' ? b.status.slice(0, 40) : 'submitted' }
    if (typeof b.passed_tests === 'number') r.passed = b.passed_tests
    if (typeof b.total_tests === 'number') r.total = b.total_tests
    if (typeof b.score === 'number') r.score = b.score
    return r
  }

  function errorText(body, status) {
    var e = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : ''
    return (e || ('Request failed (' + status + ')')).slice(0, 200)
  }

  // ─── IndexedDB (window and service worker) ──────────────────────────────

  var DB_NAME = 'codespectra-offline'
  var DB_VERSION = 1
  var STORES = ['packs', 'drafts', 'queue', 'meta']

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
      var req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = function () {
        var db = req.result
        if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
      }
      req.onsuccess = function () { resolve(req.result) }
      req.onerror = function () { reject(req.error) }
    })
  }

  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode)
        var result
        t.oncomplete = function () { db.close(); resolve(result) }
        t.onerror = function () { db.close(); reject(t.error) }
        t.onabort = function () { db.close(); reject(t.error) }
        var r = fn(t.objectStore(store))
        if (r) r.onsuccess = function () { result = r.result }
      })
    })
  }

  var idb = {
    getAll: function (store) { return tx(store, 'readonly', function (s) { return s.getAll() }).then(function (r) { return r || [] }) },
    get: function (store, key) { return tx(store, 'readonly', function (s) { return s.get(key) }) },
    put: function (store, value) { return tx(store, 'readwrite', function (s) { return s.put(value) }) },
    del: function (store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key) }) },
    clearAll: function () {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(STORES, 'readwrite')
          STORES.forEach(function (n) { t.objectStore(n).clear() })
          t.oncomplete = function () { db.close(); resolve(undefined) }
          t.onerror = function () { db.close(); reject(t.error) }
        })
      })
    },
  }

  /** Queue adapter over IndexedDB; `send` is supplied by the caller (window: csrfFetch, SW: fetch + cookie). */
  function idbQueueAdapter(send) {
    return {
      list: function () { return idb.getAll('queue') },
      put: function (item) { return idb.put('queue', item) },
      send: send,
    }
  }

  /** POST one queued submission (body as built by lib/pwa/offline-store.ts). */
  async function postQueued(item, csrfToken) {
    // The queue item's UUID is the idempotency key: a resend after a lost
    // response gets the first graded result back (lib/submission-idempotency.ts).
    var headers = { 'Content-Type': 'application/json', 'Idempotency-Key': item.id }
    if (csrfToken) headers['x-csrf-token'] = csrfToken
    var res = await fetch(item.endpoint || '/api/submissions', {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(item.body),
    })
    var body = null
    try { body = await res.json() } catch (e) { body = null }
    return { status: res.status, body: body }
  }

  return {
    CACHE_VERSION: CACHE_VERSION,
    CACHES: CACHES,
    STATIC_MAX_ENTRIES: STATIC_MAX_ENTRIES,
    PAGES_MAX_ENTRIES: PAGES_MAX_ENTRIES,
    OFFLINE_URL: OFFLINE_URL,
    SHELL_URLS: SHELL_URLS,
    SYNC_TAG: SYNC_TAG,
    PUBLIC_PAGES: PUBLIC_PAGES,
    PUBLIC_PAGE_PREFIXES: PUBLIC_PAGE_PREFIXES,
    chooseStrategy: chooseStrategy,
    isCacheableResponse: isCacheableResponse,
    isPublicPage: isPublicPage,
    safeLink: safeLink,
    notificationFromPush: notificationFromPush,
    classifySyncResponse: classifySyncResponse,
    retryDelayMs: retryDelayMs,
    isDue: isDue,
    flushQueue: flushQueue,
    idb: idb,
    idbQueueAdapter: idbQueueAdapter,
    postQueued: postQueued,
  }
})
