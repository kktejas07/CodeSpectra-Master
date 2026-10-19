/**
 * GET /api/ats/analytics/assessments?preset=30d | from=&to= [&compare=1]
 *
 * The organisation's own numbers only (tenant from the signed-in hiring
 * actor, never from the request): headline KPIs with previous-period change,
 * candidate invite → started → submitted funnel, job view → applied → hired
 * funnel, per-test results and score distribution.
 */
import { NextRequest } from 'next/server'
import { errorResponse, gate, json } from '@/lib/ats/http'
import { parseRange } from '@/lib/analytics/range'

export async function GET(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  try {
    if (!g.actor.tenantId) return json({ error: 'Not allowed' }, 403)
    const sp = new URL(req.url).searchParams
    const range = parseRange({ from: sp.get('from'), to: sp.get('to'), preset: sp.get('preset') })
    const scope = { kind: 'tenant' as const, tenantId: g.actor.tenantId }
    const { getKpis, getFunnel, getAssessmentAnalytics } = await import('@/lib/analytics/query')
    const [kpis, assessments, hiring] = await Promise.all([
      getKpis(range, scope, { compare: sp.get('compare') !== '0' }),
      getAssessmentAnalytics(range, scope),
      getFunnel('hiring', range, scope),
    ])
    return json({ range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days }, kpis, assessments, hiring_funnel: hiring })
  } catch (e) {
    return errorResponse(e, 'analytics assessments GET')
  }
}
