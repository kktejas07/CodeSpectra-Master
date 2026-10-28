/**
 * Hack Club hackathons — the public JSON API behind hackathons.hackclub.com
 * (open source, documented in github.com/hackclub/hackathons; a curated list
 * of high-school / student hackathons). robots.txt is still honoured.
 * Enabled by default; admins can turn it off.
 */
import { jsonOf } from '../http'
import { countryCode, httpUrl, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export const HACKCLUB_API = 'https://hackathons.hackclub.com/api/events/upcoming'

export function parseHackClub(payload: unknown): ExternalEvent[] {
  const list = Array.isArray(payload) ? payload : (payload as Record<string, unknown> | null)?.events
  return asArray(list).map((e) => {
    const virtual = e.virtual === true
    const hybrid = e.hybrid === true
    const mode = hybrid ? 'hybrid' : virtual ? 'online' : 'in_person'
    const id = str(e.id) || str(e.slug) || str(e.website)
    return buildEvent({
      source: 'hackclub', source_id: id, title: str(e.name),
      url: httpUrl(e.website) || `https://hackathons.hackclub.com/#${encodeURIComponent(id)}`,
      organiser: str(e.organizer) || null, kind: 'hackathon', mode,
      city: mode === 'online' ? null : str(e.city) || null,
      country: mode === 'online' ? null : countryCode(str(e.countryCode)) || countryCode(str(e.country)),
      starts_at: toUtcIso(str(e.start)), ends_at: toUtcIso(str(e.end)),
      // Every listing on this site is for students; MLH-associated ones say so.
      tags: ['students', 'beginner-friendly', ...(e.mlhAssociated === true ? ['mlh'] : [])],
      image: httpUrl(e.banner) || httpUrl(e.logo),
    })
  }).filter((e) => e.title && e.url)
}

export const hackclub: Connector = {
  id: 'hackclub', label: 'Hack Club hackathons', homepage: 'https://hackathons.hackclub.com', access: 'public_feed',
  terms: 'Public JSON API of an open-source listing (MIT); robots.txt honoured; we link back to each event.', defaultEnabled: true, needsPermission: false,
  async fetch(ctx) {
    const r = await ctx.get(ctx.config?.url || HACKCLUB_API, { timeoutMs: 15_000 })
    return parseHackClub(jsonOf(r))
  },
}
