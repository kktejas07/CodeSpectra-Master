/**
 * Read tool: employer hiring analytics (lib/ats/hiring-insights-server.ts) —
 * funnel with conversion / drop-off and time in stage, source effectiveness,
 * offer acceptance, test question quality (difficulty p, discrimination r),
 * interviewer calibration, and assessment-vs-on-the-job correlation. Same
 * tenant-scoped pipelines as the dashboard; aggregates only, no candidate
 * names (the performance section omits the people list).
 */
import { readTool } from '../define'
import { argsObject, optEnum, optString, reqId } from '../args'
import { atsActorFor } from '../ats-shared'
import { INSIGHT_SECTIONS } from '@/lib/ats/hiring-insights'

export const getHiringAnalyticsTool = readTool({
  name: 'get_hiring_analytics',
  description: 'Hiring analytics for your organisation. section: funnel (conversion, drop-off, median days per stage, time to hire per job), sources (hire rate per source), offers (acceptance rate), tests (score distribution + per-question difficulty p and discrimination r for one test), interviewers (rating spread and leniency per interviewer), performance (assessment score vs 30/90-day on-the-job rating correlation). Optional job_id, from / to (YYYY-MM-DD), exam_id for tests.',
  parameters: {
    type: 'object',
    properties: {
      section: { type: 'string', enum: [...INSIGHT_SECTIONS] },
      job_id: { type: 'string' },
      exam_id: { type: 'string' },
      from: { type: 'string', description: 'YYYY-MM-DD' },
      to: { type: 'string', description: 'YYYY-MM-DD' },
    },
    required: ['section'],
  },
  parse(raw) {
    const r = argsObject(raw, ['section', 'job_id', 'exam_id', 'from', 'to'])
    const day = (k: string) => { const v = optString(r, k, { max: 10 }); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined }
    return {
      section: optEnum(r, 'section', INSIGHT_SECTIONS) ?? 'funnel',
      job_id: r.job_id ? reqId(r, 'job_id') : undefined,
      exam_id: r.exam_id ? reqId(r, 'exam_id') : undefined,
      from: day('from'),
      to: day('to'),
    }
  },
  async run(a, ctx) {
    const actor = atsActorFor(ctx.caller)
    const [{ runInsight, InsightError }, { parseFilters }] = await Promise.all([import('@/lib/ats/hiring-insights-server'), import('@/lib/ats/hiring-insights')])
    const sp = new URLSearchParams()
    if (a.job_id) sp.set('job_id', a.job_id)
    if (a.from) sp.set('from', a.from)
    if (a.to) sp.set('to', a.to)
    try {
      const data = await runInsight(actor, a.section, parseFilters(sp), { examId: a.exam_id ?? null, withPeople: false })
      return { data: { section: a.section, job_id: a.job_id ?? null, from: a.from ?? null, to: a.to ?? null, ...(data as object) } }
    } catch (e) {
      if (e instanceof InsightError) return { data: { error: e.message } }
      throw e
    }
  },
})
