/**
 * Codeforces — official API (https://codeforces.com/apiHelp).
 * Terms: public API meant for programmatic use; docs ask for at most one call
 * every 2 seconds. robots.txt does not cover /api. Enabled by default.
 */
import { jsonOf } from '../http'
import { toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseCodeforces(payload: unknown): ExternalEvent[] {
  const p = payload as { status?: string; result?: unknown }
  if (p?.status !== 'OK') return []
  return asArray(p.result)
    .filter((c) => c.phase === 'BEFORE' && Number.isFinite(Number(c.startTimeSeconds)))
    .map((c) => {
      const start = toUtcIso(Number(c.startTimeSeconds))
      const end = start ? new Date(new Date(start).getTime() + Number(c.durationSeconds || 0) * 1000).toISOString() : null
      return buildEvent({
        source: 'codeforces', source_id: str(c.id), title: str(c.name), url: `https://codeforces.com/contests/${str(c.id)}`,
        organiser: 'Codeforces', kind: 'codeathon', mode: 'online', starts_at: start, ends_at: end,
        // Registration closes when the round starts.
        registration_deadline: start, tags: ['algorithms', str(c.type)],
      })
    })
}

export const codeforces: Connector = {
  id: 'codeforces', label: 'Codeforces', homepage: 'https://codeforces.com/contests', access: 'official_api',
  terms: 'Official public API; max 1 request / 2 s per their docs.', defaultEnabled: true, needsPermission: false,
  async fetch(ctx) {
    const r = await ctx.get('https://codeforces.com/api/contest.list?gym=false', { officialApi: true, minGapMs: 2500 })
    return parseCodeforces(jsonOf(r))
  },
}
