/**
 * GET /api/ats/analytics/insights?section=funnel|sources|offers|tests|interviewers|performance
 *   &job_id=&client_id=&from=YYYY-MM-DD&to=YYYY-MM-DD|preset=30d&exam_id=
 * Employer analytics for the signed-in hiring actor's organisation (tenant and
 * job scope from the session, never the request). Aggregates only; the
 * performance section also lists the tenant's own hires for rating.
 */
import { NextRequest } from 'next/server'
import { gate, json } from '@/lib/ats/http'
import { INSIGHT_SECTIONS, parseFilters, type InsightSection } from '@/lib/ats/hiring-insights'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  const rl = rateLimitSlidingWindow(`ats-insights:${g.actor.userId}`, 120, 60_000)
  if (!rl.ok) return json({ error: 'Too many requests. Please try again shortly.', code: 'rate_limited_shortly' }, 429)
  const sp = new URL(req.url).searchParams
  const section = sp.get('section') as InsightSection
  if (!(INSIGHT_SECTIONS as readonly string[]).includes(section)) return json({ error: 'Unknown analytics section.', code: 'ats_insight_unknown_section' }, 400)
  const examId = sp.get('exam_id')
  try {
    const { runInsight, InsightError } = await import('@/lib/ats/hiring-insights-server')
    try {
      const data = await runInsight(g.actor, section, parseFilters(sp), { examId: examId && /^[A-Za-z0-9_-]{1,128}$/.test(examId) ? examId : null, withPeople: true })
      return json({ section, data })
    } catch (e) {
      if (e instanceof InsightError) return json({ error: e.message, code: e.code }, e.status)
      throw e
    }
  } catch (e) {
    console.error('[ats insights] GET:', (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
}
