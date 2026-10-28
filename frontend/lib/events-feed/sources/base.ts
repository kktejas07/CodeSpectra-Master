/**
 * Connector contract. Each source exports a pure `parse…(payload)` (unit-tested
 * against fixtures) and a Connector whose fetch() does the HTTP via ctx.get
 * (polite client: UA, robots, spacing, timeout). Connectors never throw past
 * the pipeline — a failure is recorded on that source only.
 */
import type { HttpGet } from '../http'
import { fallbackSummary, tagThemes } from '../normalize'
import type { EventKind, EventMode, ExternalEvent, Prize, SourceState } from '../types'

export interface ConnectorCtx {
  get: HttpGet
  now: Date
  config: SourceState['config']
}

export interface Connector {
  id: string
  label: string
  homepage: string
  /** How we read it — official APIs and feeds are preferred. */
  access: 'official_api' | 'public_feed' | 'public_listing' | 'internal' | 'demo'
  /** Our reading of the source's robots.txt / terms, shown to admins. */
  terms: string
  defaultEnabled: boolean
  /** Terms don't clearly allow automated access → off until an admin confirms permission. */
  needsPermission: boolean
  /** Credentials / config it needs before it can run (shown in admin). */
  requires?: string
  /** Built-in source that reads a feed URL an admin sets (Admin → Sources). */
  configurable?: { hint: string }
  fetch(ctx: ConnectorCtx): Promise<ExternalEvent[]>
}

export interface EventInput {
  source: string
  source_id: string | number
  title: string
  url: string
  organiser?: string | null
  kind: EventKind
  mode: EventMode
  city?: string | null
  country?: string | null
  starts_at?: string | null
  ends_at?: string | null
  registration_deadline?: string | null
  prize?: Prize | null
  tags?: string[]
  image?: string | null
  raw_description?: string | null
  featured?: boolean
  internal?: boolean
}

/** Build an ExternalEvent: our themes vocabulary + our own summary. */
export function buildEvent(i: EventInput): ExternalEvent {
  const raw = i.raw_description ? String(i.raw_description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null
  const themes = tagThemes(i.tags || [], `${i.title} ${raw || ''}`)
  const base: ExternalEvent = {
    source: i.source,
    source_id: String(i.source_id),
    title: i.title.replace(/\s+/g, ' ').trim(),
    url: i.url,
    organiser: i.organiser?.trim() || null,
    kind: i.kind,
    mode: i.mode,
    location: { city: i.city?.trim() || null, country: i.country || null },
    starts_at: i.starts_at || null,
    ends_at: i.ends_at || null,
    registration_deadline: i.registration_deadline || null,
    prize: i.prize || null,
    themes,
    image: i.image || null,
    description_summary: '',
    raw_description: raw,
    featured: i.featured,
    internal: i.internal,
  }
  base.description_summary = fallbackSummary(base)
  return base
}

export const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [])
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
