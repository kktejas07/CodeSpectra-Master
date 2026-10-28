/**
 * Read tool: the daily digest — one date's digest (items, sections, how it was
 * written) or, with no date, the latest digests, the schedule and the last
 * runs (status, rejected picks and why). Superadmin only.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { readTool } from '../define'
import { argsObject, optString } from '../args'

const SUPER = ['superadmin'] as const

export const getDigestTool = readTool({
  name: 'get_digest',
  roles: [...SUPER],
  description: 'The daily digest (top events, news, Learn posts and contests picked by the digest curator and checked by the verifier). Pass `date` (YYYY-MM-DD) for that day’s items with their summaries, scores and links; without it, the latest digests, the schedule, AI caps and the last runs with rejected picks and reasons.',
  parameters: { type: 'object', properties: { date: { type: 'string', description: 'Digest date, YYYY-MM-DD (local date in the digest time zone).', maxLength: 10 } } },
  parse(raw) {
    const r = argsObject(raw, ['date'])
    const date = optString(r, 'date', { max: 10 })
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolInputError('date must be YYYY-MM-DD.')
    return { date }
  },
  async run(a) {
    const store = await import('@/lib/digest/store')
    if (a.date) {
      const d = await store.getDigest(a.date)
      if (!d) return { data: { found: false, date: a.date, link: '/dashboard/admin/digest' } }
      return {
        data: {
          found: true, date: d.date, status: d.status, mode: d.mode, sections: d.sections, link: `/digest/${d.date}`,
          items: [...d.items].sort((x, y) => x.rank - y.rank).map((i) => ({
            rank: i.rank, category: i.category, title: i.title, summary: i.summaries?.en?.text || i.summary, score: i.score,
            deadline: i.deadline, starts_at: i.starts_at, prize: i.prize_text, mode: i.mode, source: i.source_name, url: i.url.replace(/^https?:\/\/[^/]+/, ''),
          })),
        },
      }
    }
    const { nextRunLabel, localDay } = await import('@/lib/digest/schedule')
    const [{ settings }, list, runs] = await Promise.all([store.getDigestConfig(), store.listDigests({ limit: 10 }), store.listRuns(5)])
    const today = localDay(new Date(), settings.timezone)
    return {
      data: {
        settings: { n: settings.n, quotas: settings.quotas, publish_time: settings.publish_time, timezone: settings.timezone, auto_publish: settings.auto_publish, ai_enabled: settings.ai_enabled, daily_ai_cap: settings.daily_ai_cap, monthly_cost_cap_usd: settings.monthly_cost_cap_usd },
        next_run: nextRunLabel(new Date(), settings, list.rows.some((r) => r.date === today)),
        digests: list.rows.map((r) => ({ date: r.date, status: r.status, items: r.count, mode: r.mode, top: r.top.map((x) => x.title) })),
        last_runs: runs.map((r) => ({ id: r.id, date: r.date, trigger: r.trigger, status: r.status, mode: r.mode, iterations: r.iterations, verified: r.verified, selected: r.selected, rejected: r.rejected.slice(0, 10), ai_calls: r.ai_calls, fallback: r.fallback_reason, message: r.message })),
        link: '/dashboard/admin/digest',
      },
    }
  },
})
