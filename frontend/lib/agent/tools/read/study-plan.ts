/** Read tool: a learner's study plan (target, weak areas, this week, progress). */
import { readTool } from '../define'
import { argsObject, reqString } from '../args'
import { clip } from '../output'
import { resolveLearner } from '../study-plan-shared'

export const getStudyPlanTool = readTool({
  name: 'get_study_plan',
  description: "A learner's personalised study plan: goal, days left, weak areas (mastery from their results), this week's items with done state, streak and past weeks. Look up by user id or e-mail; company admins see their own organisation's learners only.",
  parameters: { type: 'object', properties: { learner: { type: 'string', description: 'User id or e-mail.' } }, required: ['learner'] },
  parse(raw) {
    const r = argsObject(raw, ['learner'])
    return { learner: reqString(r, 'learner', { max: 200 }) }
  },
  async run(a, ctx) {
    const who = await resolveLearner(ctx.caller, a.learner)
    const { planView } = await import('@/lib/study-plan/service')
    const v = await planView(who.id)
    if (!v) return { data: { learner: who.name, plan: null, note: 'This learner has no study plan yet.' } }
    const p = v.plan
    return {
      data: {
        learner: who.name,
        target: { label: p.target.label, kind: p.target.kind, days: p.target.days, hours_per_week: p.target.hours_per_week, start_date: p.target.start_date },
        status: p.status, days_left: v.days_left, week_no: p.week.week_no, progress: v.progress, streak: v.streak,
        weak_areas: p.weak_areas.slice(0, 8).map((w) => ({ area: w.label, mastery_percent: Math.round(w.mastery * 100), evidence: w.evidence, next_difficulty: w.next_difficulty })),
        week: p.week.items.map((i) => ({ day: i.day, kind: i.kind, title: clip(i.title, 100), minutes: i.minutes, done: !!i.done_at })),
        past_weeks: p.history.slice(-6),
        link: '/dashboard/study-plan',
      },
    }
  },
})
