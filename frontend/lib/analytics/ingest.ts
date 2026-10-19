/**
 * Ingestion for POST /api/analytics/collect.
 *
 * buildDocs() is pure (unit tested): it applies the privacy rules —
 *  - private pages → one page-view row with the route template and nothing else;
 *    custom events / vitals on private pages are dropped;
 *  - 'anon' mode → no persistent id and no user id: the daily visitor hash only;
 *  - 'full' mode (analytics consent) → random first-party id, session id, user id;
 *  - custom event props are scrubbed of personal data; business event names are
 *    reserved for the server.
 * ingestRequest() does the I/O (salt, session, inserts).
 */
import 'server-only'
import { newId } from '@/lib/db/ids'
import { clampTs, collectSchema, MAX_BODY_BYTES, type CollectPayload } from './schema'
import { browserFamily, cleanPath, countryFromHeaders, deviceClass, isBot, osFamily, privateRoute, referrerHost, scrubProps, sourceOf } from './privacy'
import { SERVER_EVENT_NAMES } from './events'
import { DEFAULT_CLIENT_EVENTS, validPath } from './guard'
import type { RawEvent } from './store'

export interface IngestContext {
  now: Date
  userId: string | null
  tenantId: string | null
  visitorHash: string | null
  country: string | null
  ua: string
  ownHost: string
  sessionId: string | null
  /** W4-06: client custom-event names accepted (default: DEFAULT_CLIENT_EVENTS). */
  allowedEvents?: ReadonlySet<string>
}

const DEFAULT_ALLOWED: ReadonlySet<string> = new Set(DEFAULT_CLIENT_EVENTS)

export interface VitalDoc {
  id: string
  user_id: string | null
  route: string
  metric_name: string
  metric_value: number
  metric_rating: string | null
  metric_id: string | null
  navigation_type: string | null
  client_ts: string
  created_at: string
}

export interface BuiltDocs {
  events: RawEvent[]
  vitals: VitalDoc[]
  dropped: number
  /** First public page view in the batch (session entry), if any. */
  firstPage: RawEvent | null
}

const iso = (d: Date) => d.toISOString()

export function buildDocs(p: CollectPayload, ctx: IngestContext): BuiltDocs {
  const full = p.mode === 'full'
  const events: RawEvent[] = []
  const vitals: VitalDoc[] = []
  let dropped = 0
  let firstPage: RawEvent | null = null
  const device = { device_type: deviceClass(ctx.ua), browser: browserFamily(ctx.ua), os: osFamily(ctx.ua) }
  const identity = full
    ? { mode: 'full' as const, anonymous_id: p.aid, user_id: ctx.userId || undefined, tenant_id: ctx.userId ? ctx.tenantId : undefined }
    : { mode: 'anon' as const, visitor_hash: ctx.visitorHash || undefined }

  for (const e of p.events) {
    const at = clampTs(e.ts, ctx.now)
    const path = cleanPath(e.path)
    const tpl = privateRoute(path)
    // W4-06: path length / charset (private paths collapse to a template anyway).
    if (!tpl && !validPath(path)) { dropped++; continue }
    const base = { id: newId(), ts: at, timestamp: iso(at), day: iso(at).slice(0, 10) }
    if (tpl) {
      if (e.t === 'pv') events.push({ ...base, event: 'page_view', kind: 'page', path: tpl, private: true })
      else dropped++
      continue
    }
    if (e.t === 'wv') {
      vitals.push({
        id: base.id,
        user_id: full ? ctx.userId : null,
        route: path,
        metric_name: e.name,
        metric_value: e.value,
        metric_rating: e.rating ?? null,
        metric_id: e.id ?? null,
        navigation_type: e.nav ?? null,
        client_ts: base.timestamp,
        created_at: iso(ctx.now),
      })
      continue
    }
    const common = {
      ...base, ...identity, ...device,
      path,
      session_id: ctx.sessionId || undefined,
      country: ctx.country,
    }
    if (e.t === 'pv') {
      const ref = referrerHost(e.ref, ctx.ownHost)
      const doc: RawEvent = {
        ...common,
        event: 'page_view',
        kind: 'page',
        referrer: ref,
        source: sourceOf(e.utm?.source, ref),
        utm_source: e.utm?.source?.toLowerCase().slice(0, 80) || '',
        utm_medium: e.utm?.medium?.toLowerCase().slice(0, 80) || '',
        utm_campaign: e.utm?.campaign?.slice(0, 120) || '',
      }
      if (!firstPage) firstPage = doc
      events.push(doc)
      continue
    }
    // Custom event
    if (SERVER_EVENT_NAMES.has(e.name) || !(ctx.allowedEvents ?? DEFAULT_ALLOWED).has(e.name)) { dropped++; continue }
    events.push({ ...common, event: e.name, kind: 'event', properties: scrubProps(e.props) })
  }
  return { events, vitals, dropped, firstPage }
}

export interface IngestResult { status: number; body: Record<string, unknown> }

/** Validate + store one batch. `userId` / `tenantId` come from the session cookie (never the body). */
export async function ingestRequest(req: Request, who: { userId: string | null; tenantId: string | null }, now = new Date()): Promise<IngestResult> {
  const ua = req.headers.get('user-agent') || ''
  if (isBot(ua)) return { status: 202, body: { ok: true, accepted: 0 } }
  const text = await req.text().catch(() => '')
  if (!text || text.length > MAX_BODY_BYTES) return { status: 413, body: { error: 'Payload too large' } }
  let json: unknown
  try { json = JSON.parse(text) } catch { return { status: 400, body: { error: 'Invalid JSON' } } }
  const parsed = collectSchema.safeParse(json)
  if (!parsed.success) return { status: 400, body: { error: 'Invalid payload' } }
  const p = parsed.data

  const { dailySalt, dayKey, eventsCol, sessionsCol, markUserDay, capsCol } = await import('./store')
  const { visitorHash, clientIp, ipCapKey } = await import('./hash')
  const guard = await import('./guard')
  const ownHost = (() => { try { return new URL(req.url).host } catch { return '' } })()
  // W4-06: only beacons from our own pages.
  const appHost = (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL || '').host } catch { return '' } })()
  if (!guard.sameSiteOrigin(req.headers, [ownHost, appHost, req.headers.get('host') || ''])) {
    return { status: 202, body: { ok: true, accepted: 0 } }
  }
  const allPrivate = p.events.every((e) => privateRoute(cleanPath(e.path)))
  const salt = await dailySalt(dayKey(now))
  const ip = clientIp(req.headers)
  let vh: string | null = null
  if (!allPrivate) vh = visitorHash(salt, ip, ua, ownHost)
  const full = p.mode === 'full'

  // W4-06: daily caps per visitor and per (hashed) IP.
  const caps = guard.dailyCaps()
  const visitorKey = full && p.aid ? `a:${p.aid}` : vh ? `h:${vh}` : ''
  const within = await guard.capsAllow(await capsCol() as never, dayKey(now), [
    { key: visitorKey, cap: caps.visitor },
    { key: ip !== 'unknown' ? ipCapKey(salt, ip) : '', cap: caps.ip },
  ], p.events.length)
  if (!within) return { status: 202, body: { ok: true, accepted: 0, dropped: p.events.length } }

  let allowedEvents: ReadonlySet<string> | undefined
  try {
    const { getServerSecretsFromCache } = await import('@/lib/server-secrets-cache')
    allowedEvents = guard.eventAllowlist((getServerSecretsFromCache() as Record<string, unknown>).analytics_custom_events)
  } catch { allowedEvents = undefined }

  // Session: client id with consent; otherwise derived on the server from the
  // visitor hash with a 30-minute inactivity window (nothing stored on the device).
  let sessionId: string | null = null
  const sessions = await sessionsCol()
  if (!allPrivate) {
    if (full && p.sid) sessionId = `f_${p.sid}`
    else if (vh) {
      const recent = await sessions.findOne({ visitor_hash: vh, last_activity_at: { $gte: new Date(now.getTime() - 30 * 60_000).toISOString() } }, { sort: { last_activity_at: -1 } })
      sessionId = (recent?.id as string) || `a_${newId()}`
    }
  }

  const built = buildDocs(p, {
    now,
    userId: who.userId,
    tenantId: who.tenantId,
    visitorHash: vh,
    country: countryFromHeaders(req.headers),
    ua,
    ownHost,
    sessionId,
    allowedEvents,
  })

  if (built.events.length) await (await eventsCol()).insertMany(built.events)
  if (built.vitals.length) {
    const { webVitalsEvents } = await import('@/lib/db/misc')
    await (await webVitalsEvents()).insertMany(built.vitals as never)
  }

  const pub = built.events.filter((e) => !e.private)
  if (sessionId && pub.length) {
    const nowIso = now.toISOString()
    const pv = pub.filter((e) => e.event === 'page_view')
    const last = pv[pv.length - 1]
    const existing = await sessions.findOne({ id: sessionId })
    if (existing) {
      await sessions.updateOne({ id: sessionId }, {
        $set: { last_activity_at: nowIso, ...(last ? { exit_page: last.path } : {}), ...(full && who.userId ? { user_id: who.userId } : {}) },
        $inc: { pageviews: pv.length, events_count: pub.length },
        ...(pv.length ? { $addToSet: { pages: { $each: [...new Set(pv.map((e) => e.path!))].slice(0, 20) } } } : {}),
      })
    } else {
      const f = built.firstPage
      await sessions.insertOne({
        id: sessionId,
        mode: p.mode,
        ...(full ? { anonymous_id: p.aid, user_id: who.userId || undefined } : { visitor_hash: vh }),
        started_at: nowIso,
        last_activity_at: nowIso,
        entry_page: f?.path || pub[0].path,
        exit_page: last?.path || pub[0].path,
        pageviews: pv.length,
        events_count: pub.length,
        country: pub[0].country,
        device_type: pub[0].device_type,
        browser: pub[0].browser,
        os: pub[0].os,
        referrer: f?.referrer || '',
        source: f?.source || 'direct',
        utm_source: f?.utm_source || '',
        utm_medium: f?.utm_medium || '',
        utm_campaign: f?.utm_campaign || '',
        pages: [...new Set(pv.map((e) => e.path!))].slice(0, 20),
      })
    }
  }
  if (full && who.userId && pub.length) await markUserDay(who.userId, who.tenantId, now)

  return { status: 200, body: { ok: true, accepted: built.events.length + built.vitals.length, dropped: built.dropped } }
}
