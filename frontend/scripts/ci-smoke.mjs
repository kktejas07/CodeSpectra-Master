#!/usr/bin/env node
/**
 * Fast post-build smoke (CI, audit A-063): waits for `next start`, then checks
 * that key pages answer without a server error and that the security headers
 * keep camera + microphone allowed for our own origin (regression guard for
 * A-001 — a site-wide `microphone=()` silently broke voice interviews).
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/ci-smoke.mjs
 *
 * No secrets needed. Exit 1 on any failure.
 */
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

// Public pages must render (200). Signed-in pages must redirect to sign-in, not 500.
const PUBLIC = ['/', '/pricing', '/auth/login', '/auth/signup', '/docs', '/status', '/maintenance', '/auth/two-factor-setup']
const GUARDED = ['/dashboard', '/dashboard/admin/settings', '/dashboard/interviews/ai-mock']

async function waitForServer(timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs
  for (;;) {
    try {
      // Any HTTP answer means the server is up (health may be 503 without the backend).
      await fetch(`${BASE}/auth/login`, { redirect: 'manual' })
      return
    } catch { /* not up yet */ }
    if (Date.now() > until) {
      if (inCI) console.log(`::error title=Smoke check failed::server did not start at ${BASE}`)
      throw new Error(`server did not start at ${BASE}`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

function policyOf(res) {
  const out = {}
  for (const part of (res.headers.get('permissions-policy') || '').split(',')) {
    const m = part.trim().match(/^([a-z-]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const failures = []
const inCI = !!process.env.GITHUB_ACTIONS
const check = (ok, msg) => {
  if (!ok) failures.push(msg)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`)
  // Surface failures as annotations on the pull request (readable without the raw log).
  if (!ok && inCI) console.log(`::error title=Smoke check failed::${msg.replace(/[\r\n%]/g, ' ')}`)
}

await waitForServer()

for (const path of PUBLIC) {
  const r = await fetch(BASE + path, { redirect: 'manual' })
  check(r.status === 200, `${path} → ${r.status} (want 200)`)
  if (path === '/') {
    const p = policyOf(r)
    check(p.microphone === '(self)', `Permissions-Policy microphone=${p.microphone} (want (self))`)
    check(p.camera === '(self)', `Permissions-Policy camera=${p.camera} (want (self))`)
  }
}
for (const path of GUARDED) {
  const r = await fetch(BASE + path, { redirect: 'manual' })
  const loc = r.headers.get('location') || ''
  check(r.status >= 300 && r.status < 400 && loc.includes('/auth/login'), `${path} (signed out) → ${r.status} ${loc} (want redirect to /auth/login)`)
}
// Wave 7 CSP (lib/csp/policy.ts): the strict policy is sent (Report-Only unless
// CSP_ENFORCE=1) with a report endpoint; dynamic pages carry a per-request nonce
// that Next stamps on its scripts; reports are accepted without a CSRF token.
const strictOf = (res) => {
  const ro = res.headers.get('content-security-policy-report-only')
  return ro || res.headers.get('content-security-policy') || ''
}
{
  const r = await fetch(`${BASE}/`, { redirect: 'manual' })
  const p = strictOf(r)
  check(p.includes('report-uri /api/csp-report'), `/ strict CSP with report-uri (got ${p ? 'a policy without it' : 'none'})`)
  check(!/script-src[^;]*'unsafe-eval'/.test(p), `/ strict CSP has no 'unsafe-eval' in script-src`)
}
{
  const r = await fetch(`${BASE}/auth/login`, { redirect: 'manual' })
  const p = strictOf(r)
  const nonce = (p.match(/'nonce-([A-Za-z0-9+/=_-]+)'/) || [])[1]
  check(!!nonce, '/auth/login strict CSP carries a nonce')
  const html = r.status === 200 ? await r.text() : ''
  check(!!nonce && html.includes(`nonce="${nonce}"`), '/auth/login scripts carry the response nonce (page rendered per request)')
  const again = strictOf(await fetch(`${BASE}/auth/login`, { redirect: 'manual' }))
  check(!!nonce && !again.includes(`'nonce-${nonce}'`), '/auth/login nonce changes per request')
}
{
  const r = await fetch(`${BASE}/api/csp-report`, {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': `${BASE}/`, 'violated-directive': 'script-src-elem', 'blocked-uri': 'inline' } }),
  })
  check(r.status === 204, `/api/csp-report → ${r.status} (want 204)`)
}
{
  const r = await fetch(`${BASE}/api/cron/tick`, { method: 'POST' })
  check(r.status === 401, `/api/cron/tick without CRON_SECRET → ${r.status} (want 401)`)
}

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nsmoke OK')
