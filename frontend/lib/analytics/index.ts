/**
 * CodeSpectra first-party analytics — browser SDK (tiny, no third party).
 *
 *   import { track } from '@/lib/analytics'
 *   track('practice_run', { language: 'python' })
 *
 * Page views and Web Vitals are sent by <AnalyticsRoot/> (mounted once in the
 * root layout). Events are batched (5 s / 10 events / page hide) to
 * POST /api/analytics/collect.
 *
 * Consent (lib/analytics/consent.ts):
 *  - no analytics consent → 'anon' mode: nothing is stored on the device; the
 *    server counts visits with a daily-rotating salted hash;
 *  - analytics consent → 'full' mode: random first-party id (localStorage) +
 *    30-minute session id (sessionStorage); withdrawing consent deletes both.
 * Private pages (token links, test taking, payment steps) send page counts only.
 */
import { currentConsent, type EffectiveConsent } from './consent'
import { isPrivatePath } from './privacy'

type Props = Record<string, string | number | boolean | null>
type Ev =
  | { t: 'pv'; path: string; ref?: string; utm?: Record<string, string>; ts: string }
  | { t: 'ev'; name: string; path: string; props?: Props; ts: string }
  | { t: 'wv'; name: string; value: number; rating?: string; id?: string; nav?: string; path: string; ts: string }

const ENDPOINT = '/api/analytics/collect'
const AID_KEY = 'cs_aid'
const SID_KEY = 'cs_sid'
const SESSION_IDLE_MS = 30 * 60_000

let queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let consent: EffectiveConsent | null = null
let firstPage = true
const tagListeners = new Set<(name: string, props?: Props) => void>()

const isBrowser = () => typeof window !== 'undefined'
const nowIso = () => new Date().toISOString()
const path = () => (isBrowser() ? window.location.pathname : '/')

function randomId(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

function store(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return null }
}

function ids(): { aid?: string; sid?: string } {
  if (!consent || consent.mode !== 'full') return {}
  const ls = store('local')
  const ss = store('session')
  let aid = ls?.getItem(AID_KEY) || ''
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(aid)) { aid = randomId(); ls?.setItem(AID_KEY, aid) }
  let sid = ''
  try {
    const raw = JSON.parse(ss?.getItem(SID_KEY) || 'null') as { id: string; at: number } | null
    if (raw && Date.now() - raw.at < SESSION_IDLE_MS && /^[A-Za-z0-9_-]{8,64}$/.test(raw.id)) sid = raw.id
  } catch { /* ignore */ }
  if (!sid) sid = randomId()
  ss?.setItem(SID_KEY, JSON.stringify({ id: sid, at: Date.now() }))
  return { aid, sid }
}

/** Apply a consent change: forget the device ids when analytics is withdrawn. */
export function setConsent(c: EffectiveConsent): void {
  const before = consent?.mode
  consent = c
  if (c.mode === 'anon' && before !== 'anon') {
    store('local')?.removeItem(AID_KEY)
    store('session')?.removeItem(SID_KEY)
  }
}

function schedule() {
  if (queue.length >= 10) { void flush(); return }
  if (!timer) timer = setTimeout(() => { timer = null; void flush() }, 5000)
}

function payload(events: Ev[]): string {
  const c = consent ?? currentConsent()
  return JSON.stringify({ v: 1, mode: c.mode, ...ids(), events })
}

/** Send everything queued. `beacon` on page hide (survives unload). */
export async function flush(beacon = false): Promise<void> {
  if (!isBrowser() || !queue.length) return
  if (timer) { clearTimeout(timer); timer = null }
  while (queue.length) {
    const body = payload(queue.splice(0, 30))
    try {
      if (beacon && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) continue
      await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60_000, credentials: 'same-origin' })
    } catch { /* analytics must never break the app */ }
  }
}

function utmFromUrl(): Record<string, string> | undefined {
  try {
    const p = new URLSearchParams(window.location.search)
    const out: Record<string, string> = {}
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = p.get(`utm_${k}`)
      if (v) out[k] = v.slice(0, 200)
    }
    return Object.keys(out).length ? out : undefined
  } catch { return undefined }
}

export function trackPageView(p: string = path()): void {
  if (!isBrowser()) return
  if (isPrivatePath(p)) { queue.push({ t: 'pv', path: p, ts: nowIso() }); schedule(); return }
  const ev: Ev = { t: 'pv', path: p, ts: nowIso() }
  if (firstPage) {
    if (document.referrer) ev.ref = document.referrer.slice(0, 2000)
    const utm = utmFromUrl()
    if (utm) ev.utm = utm
  }
  firstPage = false
  queue.push(ev)
  schedule()
}

/** Custom product event. Names: lower_snake_case. Props: ≤ 20 primitives, no personal data. */
export function track(name: string, props?: Props): void {
  if (!isBrowser()) return
  const p = path()
  if (isPrivatePath(p) || !/^[a-z][a-z0-9_.:-]{0,63}$/.test(name)) return
  queue.push({ t: 'ev', name, path: p, ...(props ? { props } : {}), ts: nowIso() })
  schedule()
  for (const l of tagListeners) { try { l(name, props) } catch { /* tag errors stay in the tag */ } }
}

export function trackVital(m: { name: string; value: number; rating?: string; id?: string; navigationType?: string }, p: string = path()): void {
  if (!isBrowser() || isPrivatePath(p)) return
  if (!['LCP', 'INP', 'CLS', 'TTFB', 'FCP'].includes(m.name) || !Number.isFinite(m.value)) return
  queue.push({ t: 'wv', name: m.name, value: Math.max(0, m.value), ...(m.rating ? { rating: m.rating } : {}), ...(m.id ? { id: m.id.slice(0, 120) } : {}), ...(m.navigationType ? { nav: m.navigationType.slice(0, 30) } : {}), path: p, ts: nowIso() })
  schedule()
}

/** Third-party tag loader subscribes here to mirror custom events (only after consent). */
export function onTrack(fn: (name: string, props?: Props) => void): () => void {
  tagListeners.add(fn)
  return () => tagListeners.delete(fn)
}

/** Backwards-compatible facade for older imports. */
export const csAnalytics = {
  init: () => undefined,
  track: (event: string, properties?: Props) => track(event, properties),
  trackPageView: (p?: string) => trackPageView(p),
  identify: () => undefined,
  flush: () => flush(),
}
