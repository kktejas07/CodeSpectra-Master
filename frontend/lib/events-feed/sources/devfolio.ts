/**
 * Devfolio — the search API behind devfolio.co/hackathons (undocumented).
 * Terms: Devfolio's terms don't grant automated access → OFF by default
 * ("needs permission").
 */
import { jsonOf } from '../http'
import { httpUrl, inferKind, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseDevfolio(payload: unknown): ExternalEvent[] {
  const hits = asArray((payload as { hits?: { hits?: unknown } })?.hits?.hits)
  return hits.map((h) => {
    const s = (h._source || {}) as Record<string, unknown>
    const setting = (s.hackathon_setting || {}) as Record<string, unknown>
    const slug = str(s.slug) || str(setting.subdomain)
    const title = str(s.name)
    const online = s.is_online === true
    return buildEvent({
      source: 'devfolio', source_id: slug || str(s.uuid), title, url: `https://${slug}.devfolio.co/`,
      organiser: null, kind: inferKind(title, 'hackathon'), mode: online ? 'online' : 'in_person',
      city: online ? null : str(s.city) || str(s.location) || null, country: online ? null : str(s.country) || null,
      starts_at: toUtcIso(str(s.starts_at)), ends_at: toUtcIso(str(s.ends_at)),
      registration_deadline: toUtcIso(str(setting.reg_ends_at)),
      tags: asArray(s.themes).map((t) => str(t.name)), image: httpUrl(str(s.cover_img)),
      raw_description: str(s.tagline) + ' ' + str(s.desc),
    })
  }).filter((e) => e.url !== 'https://.devfolio.co/')
}

export const devfolio: Connector = {
  id: 'devfolio', label: 'Devfolio', homepage: 'https://devfolio.co/hackathons', access: 'public_listing',
  terms: 'Undocumented API; terms don’t grant automated access. Needs Devfolio’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const r = await ctx.get('https://api.devfolio.co/api/search/hackathons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'application_open', from: 0, size: 50 }),
    })
    return parseDevfolio(jsonOf(r))
  },
}
