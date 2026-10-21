/**
 * Write tool: run the question bot now (superadmin). Proposes first (shows the
 * plan + budget); on confirm runs the same lib/question-bot/run.ts the admin
 * "Run now" button uses — drafts only, inside the daily + monthly caps.
 */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject } from '../args'

const SUPER = ['superadmin'] as const

export const runQuestionBotTool = writeTool<Record<string, never>>({
  name: 'run_question_bot',
  risk: 'create',
  roles: [...SUPER],
  description: 'Run the question bank bot now: it writes AI draft questions for the biggest coverage gaps (see get_question_coverage), checks them (MCQ answer key, coding reference solution run in the sandbox) and queues them for SME review. Within the daily question cap and monthly AI cap; nothing is published.',
  parameters: { type: 'object', properties: {} },
  parse(raw) {
    argsObject(raw, [])
    return {}
  },
  async propose() {
    const [{ botOverview }, { planRun, countKey }] = await Promise.all([import('@/lib/question-bot/http'), import('@/lib/question-bot/planner')])
    const o = await botOverview()
    if (o.running) throw new ToolInputError('A question bot run is already in progress. Try again in a few minutes.')
    if (o.budget.questions <= 0) throw new ToolInputError(o.budget.blocked || 'Nothing left in today’s budget.')
    const counts: Record<string, number> = {}
    for (const d of o.domains) for (const c of d.cells) counts[countKey(d.id, c.type, c.difficulty)] = c.current
    const plan = planRun(o.domains, counts, { budget: o.budget.questions, perCellMax: o.settings.per_cell_cap })
    if (!plan.length) throw new ToolInputError('Every coverage target is met. Raise targets or add domains first.')
    return {
      title: `Write up to ${plan.reduce((n, c) => n + c.take, 0)} draft questions`,
      preview: {
        batches: plan.map((c) => ({ domain: c.domain, type: c.type, difficulty: c.difficulty, questions: c.take, gap: c.gap })),
        spend_this_month_usd: o.usage.spentThisMonth,
        monthly_cap_usd: o.settings.monthly_cost_cap_usd,
        effect: 'Saves drafts for SME review. Nothing reaches a test until it is approved.',
      },
    }
  },
  async execute(_a, ctx) {
    const { runQuestionBot } = await import('@/lib/question-bot/run')
    const r = await runQuestionBot({ trigger: 'agent', by: ctx.caller.userId, timeBudgetMs: 200_000 })
    return { ok: r.ok && r.status !== 'blocked', message: r.message, link: '/dashboard/admin/sme-review?tab=drafts', data: { run_id: r.runId, inserted: r.inserted, dropped: r.dropped, cost_usd: r.costUsd } }
  },
})
