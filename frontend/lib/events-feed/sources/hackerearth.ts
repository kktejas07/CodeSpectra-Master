/**
 * HackerEarth — the events JSON used by their browser extension.
 * Terms: HackerEarth's terms don't grant automated access to site data → OFF
 * by default ("needs permission").
 */
import { jsonOf } from '../http'
import { httpUrl, toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseHackerEarth(payload: unknown): ExternalEvent[] {
  return asArray((payload as { response?: unknown })?.response)
    .filter((e) => /upcoming|ongoing/i.test(str(e.status)) && !/hiring/i.test(str(e.challenge_type)))
    .map((e) => {
      const hack = /hackathon/i.test(str(e.challenge_type))
      return buildEvent({
        source: 'hackerearth', source_id: str(e.url) || str(e.title), title: str(e.title), url: str(e.url),
        organiser: 'HackerEarth', kind: hack ? 'hackathon' : 'codeathon', mode: 'online',
        starts_at: toUtcIso(str(e.start_utc_tz) || str(e.start_tz)), ends_at: toUtcIso(str(e.end_utc_tz) || str(e.end_tz)),
        tags: [hack ? 'hackathon' : 'algorithms'], image: httpUrl(str(e.cover_image)) || httpUrl(str(e.thumbnail)),
        raw_description: str(e.description),
      })
    })
}

export const hackerearth: Connector = {
  id: 'hackerearth', label: 'HackerEarth', homepage: 'https://www.hackerearth.com/challenges/', access: 'public_listing',
  terms: 'Extension endpoint; terms don’t grant automated access. Needs HackerEarth’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const r = await ctx.get('https://www.hackerearth.com/chrome-extension/events/')
    return parseHackerEarth(jsonOf(r))
  },
}
