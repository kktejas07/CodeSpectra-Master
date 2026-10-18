/**
 * Calendar feed date mapping (audit C36): turns the hackathons and codeathons a
 * user takes part in into read-only entries for /dashboard/calendar, and
 * describes a single published event for the public "Add to calendar" export.
 *
 * Pure: no DB access. Callers pass only published docs the user is on.
 */
import { googleCalendarUrl, type CalendarEvent } from './ics'

export type FeedSource = 'hackathon' | 'codeathon'

export type FeedEntry = {
  id: string
  title: string
  description: string
  start: string
  end: string | null
  url: string
  source: FeedSource
  /** Derived from a registration — cannot be deleted from the calendar. */
  readOnly: true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>

function iso(v: unknown): string | null {
  if (v == null || v === '') return null
  const d = new Date(v as string)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

function addMinutes(isoStr: string, mins: number): string {
  return new Date(new Date(isoStr).getTime() + mins * 60_000).toISOString()
}

/** Published = visible on the public listing / detail page. */
export function isPublishedHackathon(h: Doc | null | undefined): boolean {
  return !!h && typeof h.status === 'string' && h.status !== 'draft'
}

export function isPublishedCodeathon(c: Doc | null | undefined): boolean {
  return !!c && typeof c.status === 'string' && c.status !== 'draft'
}

export function hackathonUrl(h: Doc): string {
  return `/hackathons/${encodeURIComponent(String(h.slug || h.id))}`
}

export function codeathonUrl(c: Doc): string {
  return `/dashboard/codeathons/${encodeURIComponent(String(c.id))}`
}

/**
 * Hackathon → entries. The model has no separate registration-close or
 * scheduled-results field: registration (team creation) stays open until the
 * event is closed, and results only get a date once released. So we emit:
 * start, submission deadline (ends_at, plus grace when late submissions are
 * allowed), and "results released" once `released_at` exists.
 */
export function hackathonEntries(h: Doc): FeedEntry[] {
  if (!isPublishedHackathon(h)) return []
  const name = String(h.name || 'Hackathon')
  const url = hackathonUrl(h)
  const base = `hackathon:${h.id}`
  const out: FeedEntry[] = []
  const start = iso(h.starts_at)
  const end = iso(h.ends_at)
  if (start) {
    out.push({ id: `${base}:start`, title: `${name} starts`, description: String(h.description || ''), start, end: end && end > start ? end : null, url, source: 'hackathon', readOnly: true })
  }
  if (end) {
    const grace = h.allow_late_submissions ? Math.max(0, Number(h.grace_period_minutes) || 0) : 0
    out.push({ id: `${base}:deadline`, title: `${name}: submission deadline`, description: grace ? `Includes a ${grace}-minute grace period.` : 'Submissions close.', start: grace ? addMinutes(end, grace) : end, end: null, url, source: 'hackathon', readOnly: true })
  }
  const results = h.results_released ? iso(h.released_at) : null
  if (results) {
    out.push({ id: `${base}:results`, title: `${name}: results`, description: 'Results are out.', start: results, end: null, url: `${url}/results`, source: 'hackathon', readOnly: true })
  }
  return out
}

/** Codeathon → start (spanning to the end) and the submission deadline (endDate). */
export function codeathonEntries(c: Doc): FeedEntry[] {
  if (!isPublishedCodeathon(c)) return []
  const name = String(c.title || 'Codeathon')
  const url = codeathonUrl(c)
  const base = `codeathon:${c.id}`
  const out: FeedEntry[] = []
  const start = iso(c.startDate)
  const end = iso(c.endDate)
  if (start) out.push({ id: `${base}:start`, title: `${name} starts`, description: String(c.description || ''), start, end: end && end > start ? end : null, url, source: 'codeathon', readOnly: true })
  if (end) out.push({ id: `${base}:deadline`, title: `${name}: submission deadline`, description: 'The codeathon ends and submissions close.', start: end, end: null, url, source: 'codeathon', readOnly: true })
  return out
}

/** Builds the full feed; de-duplicates docs and sorts by start. */
export function buildFeed(input: { hackathons: Doc[]; codeathons: Doc[] }): FeedEntry[] {
  const seen = new Set<string>()
  const out: FeedEntry[] = []
  const push = (list: FeedEntry[]) => {
    for (const e of list) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      out.push(e)
    }
  }
  for (const h of input.hackathons) push(hackathonEntries(h))
  for (const c of input.codeathons) push(codeathonEntries(c))
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * A single published event as one calendar entry (start → end), for the
 * public .ics download and Google link. Returns null for drafts / bad dates.
 */
export function eventForExport(kind: FeedSource, doc: Doc, origin: string): (CalendarEvent & { uid: string }) | null {
  const published = kind === 'hackathon' ? isPublishedHackathon(doc) : isPublishedCodeathon(doc)
  if (!published) return null
  const start = iso(kind === 'hackathon' ? doc.starts_at : doc.startDate)
  if (!start) return null
  let end = iso(kind === 'hackathon' ? doc.ends_at : doc.endDate)
  if (!end || end <= start) end = addMinutes(start, 60)
  const title = String((kind === 'hackathon' ? doc.name : doc.title) || (kind === 'hackathon' ? 'Hackathon' : 'Codeathon'))
  const path = kind === 'hackathon' ? hackathonUrl(doc) : codeathonUrl(doc)
  const url = `${origin.replace(/\/+$/, '')}${path}`
  const desc = String(doc.description || '').slice(0, 1000)
  return {
    uid: `${kind}-${doc.id}@codespectra.ai`,
    title,
    description: desc ? `${desc}\n\n${url}` : url,
    start,
    end,
    url,
    location: 'CodeSpectra (online)',
  }
}

/** Client-side links for the "Add to calendar" button (no DB). */
export function addToCalendarLinks(kind: FeedSource, id: string, ev: CalendarEvent): { icsHref: string; googleHref: string } {
  return {
    icsHref: `/api/calendar/ics?type=${kind}&id=${encodeURIComponent(id)}`,
    googleHref: googleCalendarUrl(ev),
  }
}
