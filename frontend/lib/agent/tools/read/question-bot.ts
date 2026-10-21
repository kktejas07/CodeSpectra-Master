/**
 * Read tool: question bank coverage per domain (the question bot's targets
 * vs approved + draft counts), caps, spend and the last runs. Superadmin
 * only — the bank is platform-wide.
 */
import { readTool } from '../define'
import { argsObject, optString } from '../args'

const SUPER = ['superadmin'] as const

export const getQuestionCoverageTool = readTool({
  name: 'get_question_coverage',
  roles: [...SUPER],
  description: 'Question bank coverage per domain (branches + skills): target vs current (approved + drafts) per type and difficulty, the biggest gaps, the question bot caps, this month’s AI spend and the last runs. Pass `domain` for one domain.',
  parameters: { type: 'object', properties: { domain: { type: 'string', description: 'Domain id, e.g. java, cse, aptitude.' } } },
  parse(raw) {
    const r = argsObject(raw, ['domain'])
    const domain = optString(r, 'domain', { max: 40 })?.toLowerCase()
    return { domain: domain && /^[a-z0-9_]{2,40}$/.test(domain) ? domain : undefined }
  },
  async run(a) {
    const [{ botOverview }, { coverageGaps, countKey }] = await Promise.all([import('@/lib/question-bot/http'), import('@/lib/question-bot/planner')])
    const o = await botOverview()
    const domains = a.domain ? o.domains.filter((d) => d.id === a.domain) : o.domains
    const counts: Record<string, number> = {}
    for (const d of o.domains) for (const c of d.cells) counts[countKey(d.id, c.type, c.difficulty)] = c.current
    return {
      data: {
        settings: o.settings,
        usage: o.usage,
        next_run_budget: o.budget,
        domains: domains.map((d) => ({
          id: d.id, label: d.label, active: d.active, coverage: d.coverage,
          cells: d.cells.filter((c) => c.target > 0 || c.current > 0).map((c) => ({ type: c.type, difficulty: c.difficulty, target: c.target, current: c.current, approved: c.approved })),
        })),
        biggest_gaps: coverageGaps(domains, counts).slice(0, 10).map((g) => ({ domain: g.domain, type: g.type, difficulty: g.difficulty, gap: g.gap })),
        last_runs: o.runs.slice(0, 5).map((r) => ({ id: r.id, status: r.status, started_at: r.started_at, trigger: r.trigger, inserted: r.inserted, dropped: r.dropped, cost_usd: r.cost_usd, message: r.message })),
        link: '/dashboard/admin/question-bot',
      },
    }
  },
})
