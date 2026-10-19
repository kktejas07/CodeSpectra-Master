/**
 * Daily rollups (one doc per UTC day) so dashboards never scan raw events.
 *
 * buildDailyRollup / mergeRollups are pure (unit tested). runAnalyticsTick is
 * called by the scheduler (lib/scheduler.ts → runAtsMinuteSweeps) every
 * 15 minutes: mirror the automation outbox, rebuild today and yesterday, and
 * backfill up to two missing days per run (last 35 days).
 */
import type { RawEvent } from './store'

export type Counter = Record<string, number>

export interface DailyRollup {
  _id: string
  day: string
  pageviews: number
  /** Private-page views (counted without identifiers). */
  private_pageviews: number
  /** Distinct visitors that day (consented id, else the daily visitor hash). */
  visitors: number
  sessions: number
  /** Sessions with a single page view. */
  bounces: number
  /** Distinct signed-in users seen in any event. */
  users: number
  paths: Counter
  private_paths: Counter
  landings: Counter
  sources: Counter
  mediums: Counter
  campaigns: Counter
  countries: Counter
  devices: Counter
  browsers: Counter
  events: Counter
  updated_at: string
}

export const TOP_N = 200
const inc = (c: Counter, k: string | null | undefined, n = 1) => {
  const key = String(k ?? '').trim() || '(none)'
  // Mongo field names can't contain '.' or start with '$'.
  const safe = key.replace(/\./g, '．').replace(/^\$/, '＄').slice(0, 200)
  c[safe] = (c[safe] || 0) + n
}
export const unsafeKey = (k: string) => k.replace(/．/g, '.').replace(/^＄/, '$')

export function topN(c: Counter, n = TOP_N): Counter {
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n))
}

type Ev = Pick<RawEvent, 'event' | 'kind' | 'ts' | 'path' | 'private' | 'visitor_hash' | 'anonymous_id' | 'session_id' | 'user_id' | 'source' | 'utm_medium' | 'utm_campaign' | 'country' | 'device_type' | 'browser'>

export function buildDailyRollup(day: string, events: Ev[], now: Date = new Date()): DailyRollup {
  const r: DailyRollup = {
    _id: day, day, pageviews: 0, private_pageviews: 0, visitors: 0, sessions: 0, bounces: 0, users: 0,
    paths: {}, private_paths: {}, landings: {}, sources: {}, mediums: {}, campaigns: {}, countries: {}, devices: {}, browsers: {}, events: {},
    updated_at: now.toISOString(),
  }
  const visitors = new Set<string>()
  const users = new Set<string>()
  const sessions = new Map<string, { first: Ev; firstTs: number; pv: number }>()
  for (const e of events) {
    if (e.user_id) users.add(e.user_id)
    if (e.event === 'page_view') {
      if (e.private) { r.private_pageviews++; inc(r.private_paths, e.path); continue }
      r.pageviews++
      inc(r.paths, e.path)
      const v = e.anonymous_id ? `a:${e.anonymous_id}` : e.visitor_hash ? `h:${e.visitor_hash}` : null
      if (v) visitors.add(v)
      if (e.session_id) {
        const t = new Date(e.ts).getTime()
        const s = sessions.get(e.session_id)
        if (!s) sessions.set(e.session_id, { first: e, firstTs: t, pv: 1 })
        else { s.pv++; if (t < s.firstTs) { s.first = e; s.firstTs = t } }
      }
    } else {
      inc(r.events, e.event)
    }
  }
  for (const s of sessions.values()) {
    const f = s.first
    inc(r.landings, f.path)
    inc(r.sources, f.source || 'direct')
    if (f.utm_medium) inc(r.mediums, f.utm_medium)
    if (f.utm_campaign) inc(r.campaigns, f.utm_campaign)
    inc(r.countries, f.country || 'Unknown')
    inc(r.devices, f.device_type || 'desktop')
    inc(r.browsers, f.browser || 'Other')
    if (s.pv === 1) r.bounces++
  }
  r.visitors = visitors.size
  r.sessions = sessions.size
  r.users = users.size
  for (const k of ['paths', 'private_paths', 'landings', 'sources', 'mediums', 'campaigns', 'countries', 'devices', 'browsers', 'events'] as const) r[k] = topN(r[k])
  return r
}

export interface MergedRollup {
  days: number
  pageviews: number
  private_pageviews: number
  visitors: number
  sessions: number
  bounces: number
  bounce_rate: number | null
  paths: Counter; private_paths: Counter; landings: Counter; sources: Counter; mediums: Counter; campaigns: Counter
  countries: Counter; devices: Counter; browsers: Counter; events: Counter
  series: { day: string; pageviews: number; visitors: number; sessions: number }[]
}

/** Sum days. Visitors are summed daily uniques (a daily hash can't be linked across days). */
export function mergeRollups(rows: Partial<DailyRollup>[], allDays?: string[]): MergedRollup {
  const m: MergedRollup = {
    days: rows.length, pageviews: 0, private_pageviews: 0, visitors: 0, sessions: 0, bounces: 0, bounce_rate: null,
    paths: {}, private_paths: {}, landings: {}, sources: {}, mediums: {}, campaigns: {}, countries: {}, devices: {}, browsers: {}, events: {},
    series: [],
  }
  const byDay = new Map(rows.map((r) => [r.day!, r]))
  for (const r of rows) {
    m.pageviews += r.pageviews || 0
    m.private_pageviews += r.private_pageviews || 0
    m.visitors += r.visitors || 0
    m.sessions += r.sessions || 0
    m.bounces += r.bounces || 0
    for (const k of ['paths', 'private_paths', 'landings', 'sources', 'mediums', 'campaigns', 'countries', 'devices', 'browsers', 'events'] as const) {
      for (const [key, n] of Object.entries(r[k] || {})) m[k][key] = (m[k][key] || 0) + n
    }
  }
  for (const k of ['paths', 'private_paths', 'landings', 'sources', 'mediums', 'campaigns', 'countries', 'devices', 'browsers', 'events'] as const) {
    m[k] = Object.fromEntries(Object.entries(topN(m[k], 500)).map(([key, n]) => [unsafeKey(key), n]))
  }
  m.bounce_rate = m.sessions ? Math.round((m.bounces / m.sessions) * 1000) / 10 : null
  const days = allDays ?? [...byDay.keys()].sort()
  m.series = days.map((day) => ({ day, pageviews: byDay.get(day)?.pageviews || 0, visitors: byDay.get(day)?.visitors || 0, sessions: byDay.get(day)?.sessions || 0 }))
  return m
}

/** Counter → sorted rows for tables / CSV. */
export function rows(c: Counter, limit = 50): { key: string; count: number }[] {
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, count]) => ({ key, count }))
}

// ─── Scheduler entry ────────────────────────────────────────────────────────

// W4-06: a day is rolled up by MongoDB $group pipelines (no row limit, so a
// flood of rows can't push real traffic out of the totals). Two aggregations:
// event-level counters, and per-session first-page dimensions.

const PUBLIC_PV = { event: 'page_view', private: { $ne: true } }
const topStage = (field: unknown, match: Record<string, unknown> = {}) => [
  ...(Object.keys(match).length ? [{ $match: match }] : []),
  { $group: { _id: field, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: TOP_N },
]

/** Pipeline 1: totals + top paths / events / private paths / distinct visitors and users. */
export function dayEventsPipeline(day: string): Record<string, unknown>[] {
  return [
    { $match: { day } },
    {
      $facet: {
        pageviews: [{ $match: PUBLIC_PV }, { $count: 'n' }],
        private_pageviews: [{ $match: { event: 'page_view', private: true } }, { $count: 'n' }],
        paths: topStage('$path', PUBLIC_PV),
        private_paths: topStage('$path', { event: 'page_view', private: true }),
        events: topStage('$event', { event: { $ne: 'page_view' } }),
        visitors: [
          { $match: { ...PUBLIC_PV, $or: [{ anonymous_id: { $type: 'string' } }, { visitor_hash: { $type: 'string' } }] } },
          { $group: { _id: { $cond: [{ $eq: [{ $type: '$anonymous_id' }, 'string'] }, { $concat: ['a:', '$anonymous_id'] }, { $concat: ['h:', '$visitor_hash'] }] } } },
          { $count: 'n' },
        ],
        users: [{ $match: { user_id: { $type: 'string', $ne: '' } } }, { $group: { _id: '$user_id' } }, { $count: 'n' }],
      },
    },
  ]
}

/** Pipeline 2: sessions (first public page view of each) → landing / source / … counters. */
export function daySessionsPipeline(day: string): Record<string, unknown>[] {
  return [
    { $match: { day, ...PUBLIC_PV, session_id: { $type: 'string' } } },
    { $sort: { ts: 1 } },
    {
      $group: {
        _id: '$session_id',
        pv: { $sum: 1 },
        path: { $first: '$path' },
        source: { $first: '$source' },
        utm_medium: { $first: '$utm_medium' },
        utm_campaign: { $first: '$utm_campaign' },
        country: { $first: '$country' },
        device_type: { $first: '$device_type' },
        browser: { $first: '$browser' },
      },
    },
    {
      $facet: {
        sessions: [{ $count: 'n' }],
        bounces: [{ $match: { pv: 1 } }, { $count: 'n' }],
        landings: topStage('$path'),
        sources: topStage({ $ifNull: ['$source', 'direct'] }),
        mediums: topStage('$utm_medium', { utm_medium: { $nin: [null, ''] } }),
        campaigns: topStage('$utm_campaign', { utm_campaign: { $nin: [null, ''] } }),
        countries: topStage({ $ifNull: ['$country', 'Unknown'] }),
        devices: topStage({ $ifNull: ['$device_type', 'desktop'] }),
        browsers: topStage({ $ifNull: ['$browser', 'Other'] }),
      },
    },
  ]
}

type FacetRow = { _id?: unknown; n: number }
type Facets = Record<string, FacetRow[]>

/** Pure: the two facet results → a DailyRollup (same shape as buildDailyRollup). */
export function rollupFromFacets(day: string, ev: Facets, ses: Facets, now: Date = new Date()): DailyRollup {
  const count = (f: Facets, k: string) => Number(f[k]?.[0]?.n || 0)
  const counter = (f: Facets, k: string, fallback = '(none)'): Counter => {
    const c: Counter = {}
    for (const r of f[k] || []) inc(c, r._id === null || r._id === undefined || r._id === '' ? fallback : String(r._id), r.n)
    return topN(c)
  }
  return {
    _id: day, day,
    pageviews: count(ev, 'pageviews'),
    private_pageviews: count(ev, 'private_pageviews'),
    visitors: count(ev, 'visitors'),
    sessions: count(ses, 'sessions'),
    bounces: count(ses, 'bounces'),
    users: count(ev, 'users'),
    paths: counter(ev, 'paths'),
    private_paths: counter(ev, 'private_paths'),
    events: counter(ev, 'events'),
    landings: counter(ses, 'landings'),
    sources: counter(ses, 'sources', 'direct'),
    mediums: counter(ses, 'mediums'),
    campaigns: counter(ses, 'campaigns'),
    countries: counter(ses, 'countries', 'Unknown'),
    devices: counter(ses, 'devices', 'desktop'),
    browsers: counter(ses, 'browsers', 'Other'),
    updated_at: now.toISOString(),
  }
}

export async function rebuildDay(day: string, now = new Date()): Promise<DailyRollup> {
  const { eventsCol, rollupsCol } = await import('./store')
  const col = await eventsCol()
  const [ev] = (await col.aggregate(dayEventsPipeline(day), { allowDiskUse: true }).toArray()) as Facets[]
  const [ses] = (await col.aggregate(daySessionsPipeline(day), { allowDiskUse: true }).toArray()) as Facets[]
  const doc = rollupFromFacets(day, ev || {}, ses || {}, now)
  await (await rollupsCol()).replaceOne({ _id: day } as never, doc, { upsert: true })
  return doc
}

export async function runAnalyticsTick(now = new Date()): Promise<{ mirrored: number; rebuilt: string[] }> {
  const { ensureIndexes, rollupsCol } = await import('./store')
  const { mirrorBusEvents } = await import('./server')
  await ensureIndexes()
  const mirrored = await mirrorBusEvents().catch((e) => { console.error('[analytics] bus mirror failed:', (e as Error)?.message); return 0 })
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const rebuilt = [today, yesterday]
  // Backfill: up to two missing days from the last 35.
  const want: string[] = []
  for (let i = 2; i <= 35; i++) want.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10))
  const have = new Set((await (await rollupsCol()).find({ _id: { $in: want } } as never, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)))
  rebuilt.push(...want.filter((d) => !have.has(d)).slice(0, 2))
  for (const d of rebuilt) await rebuildDay(d, now)
  return { mirrored, rebuilt }
}
