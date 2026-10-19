/**
 * Devpost — public JSON behind devpost.com/hackathons (/api/hackathons).
 * Terms: Devpost's Terms of Service restrict automated access/scraping and the
 * endpoint is undocumented → OFF by default ("needs permission"). Turn on only
 * with Devpost's written permission or a partner feed.
 */
import { jsonOf } from '../http'
import { httpUrl, inferKind, parseLocation, parsePrizeText, toUtcIso, endOfDayIfDateOnly } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Oct 01 - 30, 2026" | "Sep 28 - Oct 05, 2026" | "Dec 28, 2026 - Jan 05, 2027" → date-only ISO pair. */
export function parseDateRange(text: string): { start: string | null; end: string | null } {
  const s = text.replace(/\s+/g, ' ').trim()
  const iso = (y: number, m: number, d: number) => (m >= 1 && d >= 1 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null)
  const mi = (x: string) => MON.indexOf(x.slice(0, 3).toLowerCase()) + 1
  let m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})\s*[-–]\s*([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) return { start: iso(+m[3], mi(m[1]), +m[2]), end: iso(+m[6], mi(m[4]), +m[5]) }
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2})\s*[-–]\s*([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const y = +m[5]
    const sm = mi(m[1]), em = mi(m[3])
    return { start: iso(em < sm ? y - 1 : y, sm, +m[2]), end: iso(y, em, +m[4]) }
  }
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})$/)
  if (m) return { start: iso(+m[4], mi(m[1]), +m[2]), end: iso(+m[4], mi(m[1]), +m[3]) }
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) return { start: iso(+m[3], mi(m[1]), +m[2]), end: iso(+m[3], mi(m[1]), +m[2]) }
  return { start: null, end: null }
}

export function parseDevpost(payload: unknown): ExternalEvent[] {
  const list = asArray((payload as { hackathons?: unknown })?.hackathons)
  return list
    .filter((h) => h.invite_only !== true && str(h.open_state) !== 'ended')
    .map((h) => {
      const loc = (h.displayed_location || {}) as Record<string, unknown>
      const online = str(loc.icon) === 'globe' || /online/i.test(str(loc.location))
      const place = online ? { city: null, country: null } : parseLocation(str(loc.location))
      const range = parseDateRange(str(h.submission_period_dates))
      const thumb = str(h.thumbnail_url)
      const title = str(h.title)
      return buildEvent({
        source: 'devpost', source_id: str(h.id), title, url: str(h.url),
        organiser: str(h.organization_name) || null, kind: inferKind(title, 'hackathon'),
        mode: online ? 'online' : 'in_person', city: place.city, country: place.country,
        starts_at: toUtcIso(range.start), ends_at: endOfDayIfDateOnly(range.end, toUtcIso(range.end)),
        // Devpost: you can register until submissions close.
        registration_deadline: endOfDayIfDateOnly(range.end, toUtcIso(range.end)),
        prize: parsePrizeText(str(h.prize_amount)),
        tags: asArray(h.themes).map((t) => str(t.name)),
        image: httpUrl(thumb.startsWith('//') ? `https:${thumb}` : thumb),
        featured: false,
      })
    })
}

export const devpost: Connector = {
  id: 'devpost', label: 'Devpost', homepage: 'https://devpost.com/hackathons', access: 'public_listing',
  terms: 'Terms restrict automated access; undocumented endpoint. Needs Devpost’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const out: ExternalEvent[] = []
    for (let page = 1; page <= 3; page++) {
      const r = await ctx.get(`https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=${page}`)
      const batch = parseDevpost(jsonOf(r))
      out.push(...batch)
      if (batch.length < 9) break
    }
    return out
  },
}
