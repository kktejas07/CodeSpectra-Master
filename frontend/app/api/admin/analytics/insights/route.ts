/**
 * GET /api/admin/analytics/insights?section=…&preset=30d | from=YYYY-MM-DD&to=YYYY-MM-DD
 *   [&compare=1] [&format=csv]
 *
 * Superadmin, platform-wide. Sections: kpis, traffic, content, usage, funnels,
 * retention, revenue, ai, vitals. CSV export flattens the section's main table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { parseRange } from '@/lib/analytics/range'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SECTIONS = ['kpis', 'traffic', 'content', 'usage', 'funnels', 'retention', 'revenue', 'ai', 'vitals'] as const
type Section = (typeof SECTIONS)[number]
const NO_STORE = { 'Cache-Control': 'private, no-store' }

type Row = Record<string, unknown>

function csvRows(section: Section, data: any): Row[] {
  const fromCounter = (label: string, list: { key: string; count: number }[]) => list.map((r) => ({ dimension: label, value: r.key, count: r.count }))
  switch (section) {
    case 'kpis': return (data as any[]).map((k) => ({ metric: k.label, value: k.value, previous: k.previous ?? '', change_pct: k.change ?? '', unit: k.unit, currency: k.currency ?? '' }))
    case 'traffic': return [
      ...data.series.map((s: Row) => ({ dimension: 'day', value: s.day, pageviews: s.pageviews, visitors: s.visitors, sessions: s.sessions })),
      ...fromCounter('source', data.sources), ...fromCounter('campaign', data.campaigns), ...fromCounter('landing_page', data.landings),
      ...fromCounter('country', data.countries), ...fromCounter('device', data.devices), ...fromCounter('page', data.pages),
    ]
    case 'content': return [
      ...data.top_pages.map((r: any) => ({ type: 'page', key: r.key, views: r.count })),
      ...data.learn.views_in_range.map((r: any) => ({ type: 'learn_post', key: r.slug, title: r.title, views: r.views, shares_all_time: r.shares_all_time })),
      ...data.events.views_in_range.map((r: any) => ({ type: 'event', key: r.id, title: r.title, views: r.views })),
    ]
    case 'usage': return [
      ...data.series.map((s: Row) => ({ type: 'daily_active_users', key: s.day, value: s.users })),
      ...data.adoption.map((a: any) => ({ type: 'feature_adoption', key: a.feature, value: a.users })),
    ]
    case 'funnels': return (data as any[]).flatMap((f) => f.steps.map((s: any) => ({ funnel: f.label, step: s.label, count: s.count, step_conversion_pct: s.step_conversion ?? '', overall_conversion_pct: s.overall_conversion ?? '' })))
    case 'retention': return data.cohorts.map((c: any) => ({ cohort_week: c.cohort, size: c.size, ...Object.fromEntries(c.weeks.map((w: number | null, i: number) => [`week_${i}`, w ?? ''])) }))
    case 'revenue': return data.series.map((s: Row) => ({ day: s.day, plan_revenue: s.revenue, currency: data.currency }))
    case 'ai': return [
      ...data.by_feature.map((r: any) => ({ group: 'feature', key: r.key, requests: r.requests, tokens: r.tokens, cost_usd: r.cost_usd })),
      ...data.by_model.map((r: any) => ({ group: 'model', key: r.key, requests: r.requests, tokens: r.tokens, cost_usd: r.cost_usd })),
      ...data.by_tenant.map((r: any) => ({ group: 'organisation', key: r.key, requests: r.requests, tokens: r.tokens, cost_usd: r.cost_usd })),
    ]
    case 'vitals': return data.pages.map((p: any) => ({ route: p.route, samples: p.samples, lcp_ms_p75: p.LCP ?? '', inp_ms_p75: p.INP ?? '', cls_p75: p.CLS ?? '', ttfb_ms_p75: p.TTFB ?? '' }))
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const sp = new URL(req.url).searchParams
  const section = (sp.get('section') || 'kpis') as Section
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  const range = parseRange({ from: sp.get('from'), to: sp.get('to'), preset: sp.get('preset') })
  const compare = sp.get('compare') === '1'
  const platform = { kind: 'platform' as const }
  try {
    const q = await import('@/lib/analytics/query')
    const { rows } = await import('@/lib/analytics/rollup')
    let data: unknown
    switch (section) {
      case 'kpis': data = await q.getKpis(range, platform, { compare }); break
      case 'traffic': {
        const t = await q.getTraffic(range)
        let prev: Awaited<ReturnType<typeof q.getTraffic>> | null = null
        if (compare) { const { previousRange } = await import('@/lib/analytics/range'); prev = await q.getTraffic(previousRange(range)) }
        data = {
          pageviews: t.pageviews, visitors: t.visitors, sessions: t.sessions, bounce_rate: t.bounce_rate, private_pageviews: t.private_pageviews,
          previous: prev ? { pageviews: prev.pageviews, visitors: prev.visitors, sessions: prev.sessions, bounce_rate: prev.bounce_rate } : null,
          series: t.series, previous_series: prev?.series ?? null,
          sources: rows(t.sources, 25), mediums: rows(t.mediums, 15), campaigns: rows(t.campaigns, 25), landings: rows(t.landings, 25),
          countries: rows(t.countries, 30), devices: rows(t.devices, 5), browsers: rows(t.browsers, 8), pages: rows(t.paths, 50),
          private_pages: rows(t.private_paths, 20), events: rows(t.events, 30),
        }
        break
      }
      case 'content': data = await q.getContent(range); break
      case 'usage': data = await q.getUsage(range, platform); break
      case 'funnels': data = await q.getFunnels(range, platform); break
      case 'retention': data = await q.getRetention(Number(sp.get('weeks')) || 8, platform); break
      case 'revenue': data = await q.getRevenue(range); break
      case 'ai': data = await q.getAiUsage(range); break
      case 'vitals': data = await q.getVitals(range); break
    }
    if (sp.get('format') === 'csv') {
      const { toCsv } = await import('@/lib/marketplace/reports')
      const name = `analytics-${section}-${range.from.toISOString().slice(0, 10)}-to-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}.csv`
      return new NextResponse(toCsv(csvRows(section, data)), {
        headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
      })
    }
    return NextResponse.json({ section, range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days }, data }, { headers: NO_STORE })
  } catch (e) {
    console.error('[analytics] insights failed:', section, (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500, headers: NO_STORE })
  }
}
