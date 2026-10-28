/**
 * CTFtime — official API (https://ctftime.org/api/). Requires a real
 * User-Agent (we send one). Terms: free public API; link back to the event /
 * CTFtime and don't hammer it. Enabled by default.
 */
import { jsonOf } from '../http'
import { httpUrl, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseCtftime(payload: unknown): ExternalEvent[] {
  return asArray(payload).map((e) => {
    const onsite = e.onsite === true
    const orgs = asArray(e.organizers).map((o) => str(o.name)).filter(Boolean)
    const loc = str(e.location)
    const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
    return buildEvent({
      source: 'ctftime', source_id: str(e.id), title: str(e.title),
      // Organiser site when given, else the CTFtime page.
      url: httpUrl(e.url) || httpUrl(e.ctftime_url) || `https://ctftime.org/event/${str(e.id)}`,
      organiser: orgs[0] || null, kind: 'ctf', mode: onsite ? 'in_person' : 'online',
      city: onsite ? parts[0] || null : null, country: onsite ? parts[parts.length - 1] || null : null,
      starts_at: toUtcIso(str(e.start)), ends_at: toUtcIso(str(e.finish)), registration_deadline: null,
      tags: ['security', str(e.format)], image: httpUrl(e.logo), raw_description: str(e.description),
    })
  })
}

export const ctftime: Connector = {
  id: 'ctftime', label: 'CTFtime', homepage: 'https://ctftime.org/event/list/upcoming', access: 'official_api',
  terms: 'Official public API; needs an identifying User-Agent; link back to the event.', defaultEnabled: true, needsPermission: false,
  async fetch(ctx) {
    const start = Math.floor(ctx.now.getTime() / 1000)
    const finish = start + 120 * 24 * 3600
    const r = await ctx.get(`https://ctftime.org/api/v1/events/?limit=100&start=${start}&finish=${finish}`, { officialApi: true })
    return parseCtftime(jsonOf(r))
  },
}
