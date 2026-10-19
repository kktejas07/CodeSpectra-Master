/**
 * Events feed — hackathons, codeathons, buildathons, CTFs and contests from
 * around the world, normalised from many sources, plus our own events.
 * Client-safe (types only).
 */
import type { EventKind, EventMode } from '@/lib/subscriptions/types'

export type { EventKind, EventMode }
export { EVENT_KINDS, EVENT_MODES } from '@/lib/subscriptions/types'

export interface Prize {
  /** Short display text, e.g. "$10,000 in prizes" (our wording / the amount only). */
  text: string | null
  /** Integer minor units in `currency`. */
  amount_minor: number | null
  currency: string | null
  /** Rough USD equivalent (minor units) for filtering / sorting only. */
  usd_minor: number | null
}

/** What every connector returns. Times are UTC ISO strings (or null). */
export interface ExternalEvent {
  source: string
  source_id: string
  title: string
  /** Canonical link to the organiser's page (where people register). */
  url: string
  organiser: string | null
  kind: EventKind
  mode: EventMode
  location: { city: string | null; country: string | null }
  starts_at: string | null
  ends_at: string | null
  registration_deadline: string | null
  prize: Prize | null
  themes: string[]
  image: string | null
  /** Our own short summary — never copied organiser text. */
  description_summary: string
  /**
   * Source description, used ONLY transiently for AI summary / tagging. Never
   * stored or shown.
   */
  raw_description?: string | null
  /** Our own events are featured and link to our pages. */
  featured?: boolean
  internal?: boolean
}

export type FeedStatus = 'published' | 'hidden' | 'archived'

export interface FeedEventDoc extends Omit<ExternalEvent, 'raw_description'> {
  id: string
  /** Canonical URL key used for dedupe. */
  url_key: string
  /** Every source that listed this event (after cross-source dedupe). */
  sources: { source: string; source_id: string; url: string }[]
  status: FeedStatus
  featured: boolean
  internal: boolean
  /** Fields an admin edited — later pulls never overwrite them. */
  edited_fields: string[]
  ai_summary: boolean
  first_seen_at: string
  last_seen_at: string
  updated_at: string
  archived_at: string | null
}

/** Shape sent to the browser. */
export interface PublicFeedEvent {
  id: string
  title: string
  url: string
  organiser: string | null
  kind: EventKind
  mode: EventMode
  city: string | null
  country: string | null
  starts_at: string | null
  ends_at: string | null
  registration_deadline: string | null
  prize_text: string | null
  prize_usd_minor: number | null
  themes: string[]
  image: string | null
  summary: string
  featured: boolean
  internal: boolean
  source: string
}

export interface SourceState {
  id: string
  enabled: boolean
  /** Admin confirmed they have permission to pull a source whose terms need it. */
  permission_confirmed_by: string | null
  permission_confirmed_at: string | null
  /** For admin-added generic feeds (rss:* / ical:*). */
  config: { url?: string; name?: string; kind?: EventKind; mode?: EventMode; country?: string } | null
  last_run_at: string | null
  last_ok_at: string | null
  last_error: string | null
  last_count: number
  last_new: number
  runs: number
  failures: number
}
