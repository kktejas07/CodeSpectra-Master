/**
 * GET /api/ats/analytics/export?section=…&(same filters as insights) — CSV of
 * the aggregated numbers. No candidate personal data: funnel stages, sources,
 * offers per job, interviewer calibration (team members), question statistics
 * and the performance correlation summary.
 */
import { NextRequest, NextResponse } from 'next/server'
import { gate, json } from '@/lib/ats/http'
import { INSIGHT_SECTIONS, parseFilters, toCsv, type InsightSection } from '@/lib/ats/hiring-insights'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

export const dynamic = 'force-dynamic'

type Any = Record<string, any>

function rowsFor(section: InsightSection, d: Any): { headers: string[]; rows: Array<Array<string | number | null>> } {
  switch (section) {
    case 'funnel':
      return { headers: ['stage', 'type', 'reached', 'conversion_pct', 'dropoff_pct', 'median_days_in_stage'], rows: (d.stages as Any[]).map((r) => [r.name, r.type, r.reached, r.conversion_pct, r.dropoff_pct, r.median_days]) }
    case 'sources':
      return { headers: ['source', 'applications', 'share_pct', 'hired', 'hire_rate_pct', 'interview_rate_pct', 'rejected', 'active', 'avg_match'], rows: (d.sources as Any[]).map((r) => [r.source, r.total, r.share_pct, r.hired, r.hire_rate_pct, r.interview_rate_pct, r.rejected, r.active, r.avg_match]) }
    case 'offers':
      return { headers: ['job', 'offered', 'accepted', 'declined', 'pending', 'acceptance_pct'], rows: [['All jobs', d.offers.offered, d.offers.accepted, d.offers.declined, d.offers.pending, d.offers.acceptance_pct], ...(d.by_job as Any[]).map((r) => [r.title, r.offered, r.accepted, r.declined, r.pending, r.acceptance_pct])] }
    case 'interviewers':
      return { headers: ['interviewer', 'scorecards', 'mean_rating', 'sd', 'offset_vs_panel', 'yes_rate_pct', 'flag'], rows: (d.interviewers as Any[]).map((r) => [r.name, r.scorecards, r.mean, r.sd, r.offset, r.yes_rate_pct, r.flag]) }
    case 'tests':
      return { headers: ['question_no', 'question', 'type', 'responses', 'difficulty_p', 'discrimination_r', 'flags'], rows: (d.items as Any[]).map((r) => [r.n_order, r.title, r.type, r.n, r.p, r.r, (r.flags as string[]).join(' ')]) }
    case 'performance':
      return {
        headers: ['measure', 'pairs', 'correlation_r', 'enough_data'],
        rows: [['assessment_score_vs_rating', d.assessment_vs_performance.n, d.assessment_vs_performance.r, String(d.assessment_vs_performance.enough)], ['resume_match_vs_rating', d.match_vs_performance.n, d.match_vs_performance.r, String(d.match_vs_performance.enough)]],
      }
  }
}

export async function GET(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  const rl = rateLimitSlidingWindow(`ats-insights-export:${g.actor.userId}`, 30, 60_000)
  if (!rl.ok) return json({ error: 'Too many requests. Please try again shortly.', code: 'rate_limited_shortly' }, 429)
  const sp = new URL(req.url).searchParams
  const section = sp.get('section') as InsightSection
  if (!(INSIGHT_SECTIONS as readonly string[]).includes(section)) return json({ error: 'Unknown analytics section.', code: 'ats_insight_unknown_section' }, 400)
  const examId = sp.get('exam_id')
  try {
    const { runInsight, InsightError } = await import('@/lib/ats/hiring-insights-server')
    let data: Any
    try {
      data = (await runInsight(g.actor, section, parseFilters(sp), { examId: examId && /^[A-Za-z0-9_-]{1,128}$/.test(examId) ? examId : null, withPeople: false })) as Any
    } catch (e) {
      if (e instanceof InsightError) return json({ error: e.message, code: e.code }, e.status)
      throw e
    }
    const { headers, rows } = rowsFor(section, data)
    return new NextResponse(toCsv(headers, rows), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="hiring-${section}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store' },
    })
  } catch (e) {
    console.error('[ats insights] export:', (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
}
