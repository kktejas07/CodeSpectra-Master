/**
 * LeetCode — GraphQL `upcomingContests` (no official public API). LeetCode's
 * terms prohibit automated access → OFF by default ("needs permission").
 */
import { jsonOf } from '../http'
import { toUtcIso } from '../normalize'
import type { ExternalEvent } from '../types'
import { asArray, buildEvent, str, type Connector } from './base'

export function parseLeetCode(payload: unknown): ExternalEvent[] {
  const rows = asArray((payload as { data?: { upcomingContests?: unknown } })?.data?.upcomingContests)
  return rows.map((c) => {
    const start = toUtcIso(Number(c.startTime))
    const end = start ? new Date(new Date(start).getTime() + Number(c.duration || 0) * 1000).toISOString() : null
    const slug = str(c.titleSlug)
    return buildEvent({
      source: 'leetcode', source_id: slug, title: str(c.title), url: `https://leetcode.com/contest/${slug}/`,
      organiser: 'LeetCode', kind: 'codeathon', mode: 'online', starts_at: start, ends_at: end, registration_deadline: start, tags: ['algorithms'],
    })
  })
}

export const leetcode: Connector = {
  id: 'leetcode', label: 'LeetCode', homepage: 'https://leetcode.com/contest/', access: 'public_listing',
  terms: 'No public API; terms prohibit automated access. Needs LeetCode’s permission.', defaultEnabled: false, needsPermission: true,
  async fetch(ctx) {
    const r = await ctx.get('https://leetcode.com/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ upcomingContests { title titleSlug startTime duration } }' }),
    })
    return parseLeetCode(jsonOf(r))
  },
}
