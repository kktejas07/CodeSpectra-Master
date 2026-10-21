/** Write tool: rebuild a learner's current study-plan week from their latest results (same service as the "Refresh plan" button). */
import { ToolInputError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import { argsObject, reqString } from '../args'
import { resolveLearner } from '../study-plan-shared'

export const regenerateStudyPlanTool = writeTool<{ learner: string }>({
  name: 'regenerate_study_plan',
  risk: 'update',
  description: "Rebuild a learner's current study-plan week from their latest test results (weak areas recomputed; items already checked off stay done). Does not change the goal or length.",
  parameters: { type: 'object', properties: { learner: { type: 'string', description: 'User id or e-mail.' } }, required: ['learner'] },
  parse(raw) {
    const r = argsObject(raw, ['learner'])
    return { learner: reqString(r, 'learner', { max: 200 }) }
  },
  async propose(a, ctx) {
    const who = await resolveLearner(ctx.caller, a.learner)
    const { getPlan } = await import('@/lib/study-plan/service')
    const p = await getPlan(who.id)
    if (!p) throw new ToolInputError('This learner has no study plan yet.')
    if (p.status !== 'active') throw new ToolInputError('This plan has finished. The learner can set a new goal.')
    return { title: `Rebuild ${who.name || 'learner'}'s study plan (week ${p.week.week_no})`, preview: { target: p.target.label, week: p.week.week_no, items_now: p.week.items.length, done_now: p.week.items.filter((i) => i.done_at).length, effect: 'Recomputes weak areas and this week’s items. Check-offs of unchanged items are kept.' } }
  },
  async execute(a, ctx) {
    const who = await resolveLearner(ctx.caller, a.learner)
    const { regeneratePlan } = await import('@/lib/study-plan/service')
    const p = await regeneratePlan(who.id, 'rebuild')
    return { ok: true, message: `Rebuilt week ${p.week.week_no}: ${p.week.items.length} items.`, link: '/dashboard/study-plan', data: { week: p.week.week_no, items: p.week.items.length } }
  },
})
