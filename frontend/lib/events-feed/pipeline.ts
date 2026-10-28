/**
 * Pull pipeline: enabled sources → fetch (each isolated, timed out) → sanitise
 * → cross-source dedupe → match against stored events → insert / update
 * (admin edits win) → AI summary for new long descriptions → auto-archive
 * ended events. New events are published immediately (owner's decision);
 * admins can hide / feature / edit afterwards.
 */
import { createHash } from 'node:crypto'
import { aiSummarise, shouldSummarise } from './ai'
import { dedupeBatch, sameEvent, sourcePriority } from './dedupe'
import { politeGet, type HttpGet } from './http'
import { canonicalUrl, sanitizeEvent } from './normalize'
import { BUILTIN_CONNECTORS, connectorFor, type Connector } from './sources'
import { feedCol, nowIso, sourcesCol } from './store'
import type { ExternalEvent, FeedEventDoc, SourceState } from './types'
import { knowledgeOnExternalEvent } from '@/lib/rag/hooks'
import { revalidateContent } from '@/lib/cache/revalidate'

/** Automation event for a newly published external event (once per event id). */
export function emitNewFeedEvent(doc: FeedEventDoc, now: Date): void {
  if (doc.internal || doc.status !== 'published') return
  // Don't fan out events that are already over (e.g. a source's back catalogue).
  if (doc.ends_at && Date.parse(doc.ends_at) < now.getTime()) return
  void (async () => {
    const { emit } = await import('@/lib/automation/events')
    const { getAppOrigin } = await import('@/lib/app-origin')
    await emit('events_feed.new_event', {
      event_id: doc.id, title: doc.title, url: `${getAppOrigin()}/events/${doc.id}`, starts_at: doc.starts_at,
      mode: doc.mode, city: doc.location?.city ?? null, source: doc.source,
    }, { idempotencyKey: `events_feed.new_event:${doc.id}` })
  })().catch(() => undefined)
}

const SOURCE_TIMEOUT_MS = 90_000
const MAX_AI_PER_RUN = 20
/** Fields a pull may refresh (unless an admin edited them). */
export const PULLED_FIELDS = ['title', 'url', 'organiser', 'kind', 'mode', 'location', 'starts_at', 'ends_at', 'registration_deadline', 'prize', 'themes', 'image', 'description_summary'] as const

export const feedId = (urlKey: string) => `ef_${createHash('sha1').update(urlKey).digest('hex').slice(0, 16)}`

export function blankSourceState(c: Pick<Connector, 'id' | 'defaultEnabled'>, config: SourceState['config'] = null): SourceState {
  return {
    id: c.id, enabled: c.defaultEnabled, permission_confirmed_by: null, permission_confirmed_at: null, config,
    last_run_at: null, last_ok_at: null, last_error: null, last_count: 0, last_new: 0, runs: 0, failures: 0,
  }
}

/** Make sure every built-in connector has a state row. Returns all rows (built-in + admin feeds). */
export async function ensureSources(): Promise<SourceState[]> {
  const col = await sourcesCol()
  for (const c of BUILTIN_CONNECTORS) {
    await col.updateOne({ id: c.id }, { $setOnInsert: blankSourceState(c) }, { upsert: true })
  }
  return (await col.find({}, { projection: { _id: 0 } }).toArray()) as SourceState[]
}

/** A source may run when enabled and — if its terms need it — an admin confirmed permission. */
export function canRun(state: SourceState, c: Connector): boolean {
  return state.enabled && (!c.needsPermission || Boolean(state.permission_confirmed_at))
}

/** Pure: find the stored event a deduped group corresponds to. */
export function matchExisting(group: { event: ExternalEvent; aliases: ExternalEvent[] }, existing: FeedEventDoc[]): FeedEventDoc | null {
  const all = [group.event, ...group.aliases]
  const keys = new Set(all.map((e) => canonicalUrl(e.url)))
  const ids = new Set(all.map((e) => `${e.source}\u0000${e.source_id}`))
  return (
    existing.find((d) => d.sources.some((s) => ids.has(`${s.source}\u0000${s.source_id}`))) ||
    existing.find((d) => keys.has(d.url_key)) ||
    existing.find((d) => all.some((e) => sameEvent(e, d))) ||
    null
  )
}

export function toDoc(e: ExternalEvent, aliases: ExternalEvent[], now: string): FeedEventDoc {
  const urlKey = canonicalUrl(e.url)
  const { raw_description: _raw, ...rest } = e
  void _raw
  return {
    ...rest,
    id: feedId(urlKey),
    url_key: urlKey,
    sources: [e, ...aliases].map((x) => ({ source: x.source, source_id: x.source_id, url: x.url })),
    status: 'published',
    featured: Boolean(e.featured),
    internal: Boolean(e.internal),
    edited_fields: [],
    ai_summary: false,
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now,
    archived_at: null,
  }
}

/** Pure: the $set for refreshing a stored event from a new pull. */
export function refreshPatch(doc: FeedEventDoc, e: ExternalEvent, aliases: ExternalEvent[], now: string): Partial<FeedEventDoc> {
  const patch: Record<string, unknown> = { last_seen_at: now }
  // A lower-priority source must not overwrite what a better one gave us.
  const best = Math.min(...doc.sources.map((s) => sourcePriority(s.source)))
  const mayOverwrite = sourcePriority(e.source) <= best
  for (const f of PULLED_FIELDS) {
    if (doc.edited_fields.includes(f)) continue
    if (f === 'description_summary' && doc.ai_summary) continue
    const v = (e as unknown as Record<string, unknown>)[f]
    const cur = (doc as unknown as Record<string, unknown>)[f]
    if (v == null || v === '') continue
    if (mayOverwrite || cur == null || cur === '') if (JSON.stringify(v) !== JSON.stringify(cur)) patch[f] = v
  }
  const merged = [...doc.sources]
  for (const x of [e, ...aliases]) if (!merged.some((s) => s.source === x.source && s.source_id === x.source_id)) merged.push({ source: x.source, source_id: x.source_id, url: x.url })
  if (merged.length !== doc.sources.length) patch.sources = merged.slice(0, 20)
  if (e.featured && !doc.featured && !doc.edited_fields.includes('featured')) patch.featured = true
  // An archived event that a source now lists with a future end comes back.
  const end = (patch.ends_at as string | undefined) || doc.ends_at
  if (doc.status === 'archived' && end && end > now) { patch.status = 'published'; patch.archived_at = null }
  if (Object.keys(patch).length > 1) patch.updated_at = now
  return patch as Partial<FeedEventDoc>
}

/** Pure: should this stored event be archived now? */
export function shouldArchive(d: Pick<FeedEventDoc, 'status' | 'ends_at' | 'starts_at' | 'last_seen_at'>, now: Date): boolean {
  if (d.status !== 'published') return false
  const t = now.getTime()
  if (d.ends_at) return new Date(d.ends_at).getTime() < t - 6 * 3600_000
  if (d.starts_at) return new Date(d.starts_at).getTime() < t - 3 * 24 * 3600_000
  return new Date(d.last_seen_at).getTime() < t - 21 * 24 * 3600_000
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`Timed out after ${ms / 1000}s`)), ms) })])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface PullReport {
  at: string
  sources: { id: string; ok: boolean; count: number; error?: string; skipped?: string }[]
  inserted: number
  updated: number
  archived: number
  ai: number
}

export async function runPull(opts: { now?: Date; only?: string[]; get?: HttpGet; ai?: boolean } = {}): Promise<PullReport> {
  const now = opts.now || new Date()
  const at = now.toISOString()
  const report: PullReport = { at, sources: [], inserted: 0, updated: 0, archived: 0, ai: 0 }
  const states = await ensureSources()
  const sCol = await sourcesCol()
  const fetched: ExternalEvent[] = []

  await Promise.all(states.map(async (state) => {
    if (opts.only && !opts.only.includes(state.id)) return
    const c = connectorFor(state)
    if (!c) return
    if (!canRun(state, c)) {
      report.sources.push({ id: state.id, ok: true, count: 0, skipped: state.enabled ? 'needs permission' : 'disabled' })
      return
    }
    try {
      const raw = await withTimeout(c.fetch({ get: opts.get || politeGet, now, config: state.config }), SOURCE_TIMEOUT_MS)
      const clean = raw.map(sanitizeEvent).filter((e): e is ExternalEvent => Boolean(e)).slice(0, 1000)
      fetched.push(...clean)
      report.sources.push({ id: state.id, ok: true, count: clean.length })
      await sCol.updateOne({ id: state.id }, { $set: { last_run_at: at, last_ok_at: at, last_error: null, last_count: clean.length }, $inc: { runs: 1 } })
    } catch (e) {
      const msg = ((e as Error)?.message || 'failed').slice(0, 300)
      report.sources.push({ id: state.id, ok: false, count: 0, error: msg })
      await sCol.updateOne({ id: state.id }, { $set: { last_run_at: at, last_error: msg }, $inc: { runs: 1, failures: 1 } })
    }
  }))

  const col = await feedCol()
  // Candidates for matching: everything not long-archived.
  const horizon = new Date(now.getTime() - 120 * 24 * 3600_000).toISOString()
  const existing = (await col.find({ $or: [{ status: { $in: ['published', 'hidden'] } }, { last_seen_at: { $gte: horizon } }] }, { projection: { _id: 0 } }).limit(20_000).toArray()) as FeedEventDoc[]

  const changed: string[] = []
  const newPerSource = new Map<string, number>()
  const aiQueue: { id: string; event: ExternalEvent }[] = []
  for (const group of dedupeBatch(fetched)) {
    const hit = matchExisting(group, existing)
    if (hit) {
      const patch = refreshPatch(hit, group.event, group.aliases, at)
      if (Object.keys(patch).length > 1) { await col.updateOne({ id: hit.id }, { $set: patch }); report.updated++; changed.push(hit.id) }
      else await col.updateOne({ id: hit.id }, { $set: { last_seen_at: at } })
      Object.assign(hit, patch)
      if (!hit.ai_summary && !hit.edited_fields.includes('description_summary') && shouldSummarise(group.event)) aiQueue.push({ id: hit.id, event: group.event })
      continue
    }
    const doc = toDoc(group.event, group.aliases, at)
    try {
      await col.insertOne(doc)
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) continue // a parallel run inserted it
      throw e
    }
    existing.push(doc)
    report.inserted++
    changed.push(doc.id)
    emitNewFeedEvent(doc, now)
    newPerSource.set(doc.source, (newPerSource.get(doc.source) || 0) + 1)
    if (shouldSummarise(group.event)) aiQueue.push({ id: doc.id, event: group.event })
  }
  for (const [id, n] of newPerSource) await sCol.updateOne({ id }, { $set: { last_new: n } })

  if (opts.ai !== false) {
    for (const { id, event } of aiQueue.slice(0, MAX_AI_PER_RUN)) {
      const r = await aiSummarise(event)
      if (!r) continue
      const doc = existing.find((d) => d.id === id)
      const themes = [...new Set([...r.themes, ...(doc?.themes || event.themes)])].slice(0, 8)
      const set: Partial<FeedEventDoc> = { description_summary: r.summary, ai_summary: true, updated_at: at }
      if (!doc?.edited_fields.includes('themes')) set.themes = themes
      await col.updateOne({ id, edited_fields: { $ne: 'description_summary' } }, { $set: set })
      report.ai++
      changed.push(id)
    }
  }

  report.archived = await archiveEnded(now)
  knowledgeOnExternalEvent([...new Set(changed)])
  // /events and the landing strip are ISR (no-op when run outside a request).
  if (changed.length || report.archived) await revalidateContent('events')
  return report
}

export async function archiveEnded(now: Date): Promise<number> {
  const col = await feedCol()
  const rows = (await col.find({ status: 'published' }, { projection: { _id: 0, id: 1, status: 1, ends_at: 1, starts_at: 1, last_seen_at: 1, internal: 1 } }).limit(50_000).toArray()) as FeedEventDoc[]
  const ids = rows.filter((d) => shouldArchive(d, now)).map((d) => d.id)
  if (!ids.length) return 0
  const r = await col.updateMany({ id: { $in: ids }, status: 'published' }, { $set: { status: 'archived', archived_at: now.toISOString() } })
  knowledgeOnExternalEvent(ids)
  return r.modifiedCount || 0
}
