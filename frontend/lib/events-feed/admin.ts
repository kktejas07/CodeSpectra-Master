/**
 * Admin operations: sources (enable / permission / feeds), events (hide,
 * feature, edit — edits are pinned so pulls don't overwrite them).
 */
import { EVENT_KINDS, EVENT_MODES } from '@/lib/subscriptions/types'
import { countryCode, httpUrl, prizeFromAmount, slugTag, toUtcIso } from './normalize'
import { blankSourceState, ensureSources } from './pipeline'
import { BUILTIN_CONNECTORS, connectorFor, isFeedSourceId } from './sources'
import { feedCol, nowIso, sourcesCol } from './store'
import type { EventKind, EventMode, FeedEventDoc, FeedStatus, SourceState } from './types'

export async function listSourcesForAdmin() {
  const states = await ensureSources()
  return states.map((s) => {
    const c = connectorFor(s)
    return {
      ...s,
      label: c?.label || s.id,
      homepage: c?.homepage || s.config?.url || '',
      access: c?.access || 'public_feed',
      terms: c?.terms || '',
      needs_permission: Boolean(c?.needsPermission),
      requires: c?.requires || null,
      configurable: c?.configurable || null,
      builtin: BUILTIN_CONNECTORS.some((b) => b.id === s.id),
    }
  }).sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.id.localeCompare(b.id))
}

export async function setSourceEnabled(id: string, enabled: boolean, actor: string, confirmPermission: boolean): Promise<{ ok: boolean; error?: string }> {
  const states = await ensureSources()
  const s = states.find((x) => x.id === id)
  const c = s ? connectorFor(s) : null
  if (!s || !c) return { ok: false, error: 'Unknown source' }
  const set: Partial<SourceState> = { enabled }
  if (enabled && c.needsPermission && !s.permission_confirmed_at) {
    if (!confirmPermission) return { ok: false, error: 'This source’s terms need the owner’s permission. Confirm you have it to turn it on.' }
    set.permission_confirmed_by = actor
    set.permission_confirmed_at = nowIso()
  }
  await (await sourcesCol()).updateOne({ id }, { $set: set })
  return { ok: true }
}

/** Pure: validate the feed URL for a configurable built-in source (https only; empty clears it). */
export function validateSourceConfig(b: Record<string, unknown>): { ok: true; url: string | null } | { ok: false; error: string } {
  if (b.url === '' || b.url === null) return { ok: true, url: null }
  const url = httpUrl(b.url)
  if (!url || !url.startsWith('https://')) return { ok: false, error: 'Enter an https:// feed URL.' }
  return { ok: true, url }
}

/** Set (or clear) the feed URL of a configurable built-in source. */
export async function setSourceConfig(id: string, b: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const c = BUILTIN_CONNECTORS.find((x) => x.id === id)
  if (!c?.configurable) return { ok: false, error: 'This source has no feed URL to set.' }
  const v = validateSourceConfig(b)
  if (!v.ok) return v
  await ensureSources()
  await (await sourcesCol()).updateOne({ id }, { $set: { config: v.url ? { url: v.url } : null, last_error: null } })
  return { ok: true }
}

export function validateFeedInput(b: Record<string, unknown>): { ok: true; id: string; config: NonNullable<SourceState['config']> } | { ok: false; error: string } {
  const type = b.type === 'ical' ? 'ical' : b.type === 'rss' ? 'rss' : null
  if (!type) return { ok: false, error: 'Pick RSS / Atom or iCal.' }
  const url = httpUrl(b.url)
  if (!url || !url.startsWith('https://')) return { ok: false, error: 'Enter an https:// feed URL.' }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : ''
  if (!name) return { ok: false, error: 'Give the feed a name.' }
  const slug = slugTag(name).slice(0, 40) || 'feed'
  const kind = (EVENT_KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as EventKind) : undefined
  const mode = (EVENT_MODES as readonly string[]).includes(String(b.mode)) ? (b.mode as EventMode) : undefined
  const country = countryCode(b.country) || undefined
  return { ok: true, id: `${type}:${slug}`, config: { url, name, kind, mode, country } }
}

export async function addFeed(b: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string }> {
  const v = validateFeedInput(b)
  if (!v.ok) return v
  const col = await sourcesCol()
  if (await col.findOne({ id: v.id })) return { ok: false, error: 'A feed with this name already exists.' }
  await col.insertOne({ ...blankSourceState({ id: v.id, defaultEnabled: true }, v.config) })
  return { ok: true, id: v.id }
}

export async function removeFeed(id: string): Promise<boolean> {
  if (!isFeedSourceId(id)) return false
  const r = await (await sourcesCol()).deleteOne({ id })
  return r.deletedCount > 0
}

export async function listAdminEvents(q: { status?: string; search?: string; source?: string; limit?: number }): Promise<FeedEventDoc[]> {
  const filter: Record<string, unknown> = {}
  if (q.status && ['published', 'hidden', 'archived'].includes(q.status)) filter.status = q.status
  if (q.source) filter.source = q.source
  let rows = (await (await feedCol()).find(filter, { projection: { _id: 0 } }).sort({ first_seen_at: -1 }).limit(Math.min(2000, q.limit || 500)).toArray()) as FeedEventDoc[]
  const s = (q.search || '').trim().toLowerCase()
  if (s) rows = rows.filter((r) => `${r.title} ${r.organiser || ''} ${r.source}`.toLowerCase().includes(s))
  return rows
}

/** Pure: validate an admin edit into a $set + the field names it pins. */
export function buildEventEdit(b: Record<string, unknown>, now: string): { set: Record<string, unknown>; pinned: string[] } | { error: string } {
  const set: Record<string, unknown> = {}
  const pinned: string[] = []
  if (b.status !== undefined) {
    if (!['published', 'hidden', 'archived'].includes(String(b.status))) return { error: 'Invalid status' }
    set.status = b.status as FeedStatus
    set.archived_at = b.status === 'archived' ? now : null
  }
  if (b.featured !== undefined) { set.featured = b.featured === true; pinned.push('featured') }
  const f = (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Record<string, unknown>
  if (f.title !== undefined) {
    const t = String(f.title).replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!t) return { error: 'Title can’t be empty' }
    set.title = t; pinned.push('title')
  }
  if (f.url !== undefined) {
    const u = httpUrl(f.url)
    if (!u) return { error: 'Enter a valid http(s) link' }
    set.url = u; pinned.push('url')
  }
  if (f.organiser !== undefined) { set.organiser = String(f.organiser || '').trim().slice(0, 120) || null; pinned.push('organiser') }
  if (f.description_summary !== undefined) { set.description_summary = String(f.description_summary || '').replace(/<[^>]*>/g, '').trim().slice(0, 600); pinned.push('description_summary') }
  if (f.kind !== undefined) { if (!(EVENT_KINDS as readonly string[]).includes(String(f.kind))) return { error: 'Invalid kind' }; set.kind = f.kind; pinned.push('kind') }
  if (f.mode !== undefined) { if (!(EVENT_MODES as readonly string[]).includes(String(f.mode))) return { error: 'Invalid mode' }; set.mode = f.mode; pinned.push('mode') }
  for (const k of ['starts_at', 'ends_at', 'registration_deadline'] as const) {
    if (f[k] !== undefined) {
      const iso = f[k] === null || f[k] === '' ? null : toUtcIso(f[k])
      if (f[k] && !iso) return { error: `Invalid ${k.replace('_', ' ')}` }
      set[k] = iso; pinned.push(k)
    }
  }
  if (f.city !== undefined || f.country !== undefined) {
    set.location = { city: String(f.city || '').trim().slice(0, 80) || null, country: countryCode(f.country) }
    pinned.push('location')
  }
  if (f.themes !== undefined) {
    set.themes = Array.isArray(f.themes) ? [...new Set(f.themes.map((t) => slugTag(String(t))).filter(Boolean))].slice(0, 8) : []
    pinned.push('themes')
  }
  if (f.prize_amount !== undefined || f.prize_currency !== undefined) {
    const amt = f.prize_amount === '' || f.prize_amount == null ? null : Number(f.prize_amount)
    if (amt != null && (!Number.isFinite(amt) || amt < 0)) return { error: 'Invalid prize amount' }
    set.prize = amt ? prizeFromAmount(amt, String(f.prize_currency || 'USD').toUpperCase().slice(0, 3)) : null
    pinned.push('prize')
  }
  if (set.starts_at && set.ends_at && String(set.ends_at) < String(set.starts_at)) return { error: 'End must be after start' }
  if (!Object.keys(set).length) return { error: 'Nothing to change' }
  set.updated_at = now
  return { set, pinned }
}

export async function editEvent(id: string, b: Record<string, unknown>): Promise<{ ok: boolean; error?: string; event?: FeedEventDoc }> {
  const col = await feedCol()
  const doc = (await col.findOne({ id }, { projection: { _id: 0 } })) as FeedEventDoc | null
  if (!doc) return { ok: false, error: 'Event not found' }
  const r = buildEventEdit(b, nowIso())
  if ('error' in r) return { ok: false, error: r.error }
  const edited = [...new Set([...(doc.edited_fields || []), ...r.pinned])]
  await col.updateOne({ id }, { $set: { ...r.set, edited_fields: edited } })
  const { knowledgeOnExternalEvent } = await import('@/lib/rag/hooks')
  knowledgeOnExternalEvent(id)
  return { ok: true, event: { ...doc, ...r.set, edited_fields: edited } as FeedEventDoc }
}

export async function feedCounts() {
  const rows = (await (await feedCol()).find({}, { projection: { _id: 0, status: 1, featured: 1, source: 1 } }).limit(100_000).toArray()) as FeedEventDoc[]
  const by = (s: string) => rows.filter((r) => r.status === s).length
  return { total: rows.length, published: by('published'), hidden: by('hidden'), archived: by('archived'), featured: rows.filter((r) => r.featured && r.status === 'published').length }
}
