/**
 * CodeChef — contest list JSON used by codechef.com/contests. CodeChef's
 * official developer API was retired and this endpoint is undocumented →
 * OFF by default ("needs permission").
 */
import { jsonOf } from '../http'
import { toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseCodeChef(payload: unknown): ExternalEvent[] {
  const p = (payload || {}) as Record<string, unknown>
  if (p.status !== 'success') return []
  return [...asArray(p.future_contests), ...asArray(p.present_contests)].map((c) => {
    const code = str(c.contest_code)
    const start = toUtcIso(str(c.contest_start_date_iso))
    return buildEvent({
      source: 'codechef', source_id: code, title: str(c.contest_name), url: `https://www.codechef.com/${code}`,
      organiser: 'CodeChef', kind: 'codeathon', mode: 'online',
      starts_at: start, ends_at: toUtcIso(str(c.contest_end_date_iso)), registration_deadline: start, tags: ['algorithms'],
    })
  })
}

export const codechef: Connector = {
  id: 'codechef', label: 'CodeChef', homepage: 'https://www.codechef.com/contests', access: 'public_listing',
  terms: 'Official API retired; this endpoint is undocumented. Needs CodeChef’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const r = await ctx.get('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all')
    return parseCodeChef(jsonOf(r))
  },
}
