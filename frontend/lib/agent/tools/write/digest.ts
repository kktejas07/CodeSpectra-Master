/**
 * Write tool: run the daily digest now (superadmin). The proposal shows what
 * the pure ranking would pick right now (no AI, no publishing); on confirm it
 * runs the same lib/digest/service the admin "Run now" button and the
 * schedule use — curator + verifier loop, publish (or review-first), share
 * entries and subscriber messages. One digest per date: a re-run replaces
 * that date's digest, never adds a second one.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject, optInt } from '../args'

const SUPER = ['superadmin'] as const

export const runDailyDigestTool = writeTool<{ n?: number }>({
  name: 'run_daily_digest',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Run the daily digest now: the curator picks the top N open events, news, Learn posts and contests by score within category quotas, writes 1–2 line summaries from each item’s own data (AI within the caps, else templates), the verifier rejects closed deadlines, broken links, duplicates and invented facts, and the digest is published to /digest/<today> with share cards and subscriber messages (or held for review if auto-publish is off).',
  parameters: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 60, description: 'Items (default: the configured N, 25).' } } },
  parse(raw) {
    const r = argsObject(raw, ['n'])
    const n = optInt(r, 'n', 1, 60)
    return n === undefined ? {} : { n }
  },
  async propose(a) {
    const [{ getDigestConfig, getDigest }, { collectCandidates }, { scoreAll, selectDigest }, { localDay }] = await Promise.all([
      import('@/lib/digest/store'), import('@/lib/digest/collect'), import('@/lib/digest/rank'), import('@/lib/digest/schedule'),
    ])
    const { settings } = await getDigestConfig()
    const now = new Date()
    const date = localDay(now, settings.timezone)
    const { candidates } = await collectCandidates(now, { sync: false })
    const sel = selectDigest(scoreAll(candidates, settings.weights, now), settings, { n: a.n ?? settings.n })
    if (!sel.items.length) throw new ToolInputError('Nothing open to pick right now: the events feed, news and Learn queues are empty.')
    const existing = await getDigest(date)
    return {
      title: `${existing ? 'Re-run' : 'Publish'} the ${date} daily digest with up to ${a.n ?? settings.n} items`,
      preview: {
        date,
        replaces_existing: !!existing,
        auto_publish: settings.auto_publish,
        likely_picks: sel.items.slice(0, 10).map((i) => ({ category: i.category, title: i.title, score: i.score })),
        candidates: candidates.length,
        effect: settings.auto_publish ? 'Publishes /digest, share entries in the Social studio and the subscriber email / WhatsApp.' : 'Saves the digest for review; nothing is public until an admin publishes it.',
      },
    }
  },
  async execute(a, ctx) {
    const { runDailyDigest } = await import('@/lib/digest/service')
    const r = await runDailyDigest({ trigger: 'agent', n: a.n, by: ctx.caller.userId })
    return { ok: r.ok && r.status !== 'empty', message: r.message, link: r.status === 'published' ? `/digest/${r.date}` : '/dashboard/admin/digest', data: { run_id: r.run_id, status: r.status, items: r.digest?.items.length ?? 0 } }
  },
})
