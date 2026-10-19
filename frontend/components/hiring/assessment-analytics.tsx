'use client'

/**
 * Organisation analytics (GET /api/ats/analytics/assessments): KPIs with
 * previous-period change, candidate invite → started → submitted and
 * job view → applied → hired funnels, per-test results and score spread.
 * Only the signed-in organisation's data (scope set on the server).
 */
import { useEffect, useMemo, useState } from 'react'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { DEFAULT_RANGE, FunnelView, KpiGrid, RangePicker, formatValue, rangeQuery, type FunnelData, type KpiItem, type RangeValue } from '@/components/analytics/kit'
import { BarList } from './ui'

interface Resp {
  kpis: KpiItem[]
  hiring_funnel: FunnelData
  assessments: {
    funnel: FunnelData
    tests: { exam_id: string; title: string; invited: number; started: number; submitted: number; completion_rate: number | null; avg_score: number | null; auto_submitted: number }[]
    score_distribution: { label: string; count: number }[]
    totals: { tests: number; submissions: number }
  }
}

export function AssessmentAnalytics() {
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE)
  const q = useMemo(() => rangeQuery(range), [range])
  const [data, setData] = useState<Resp | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setError(null)
    fetch(`/api/ats/analytics/assessments?${q}${range.compare ? '' : '&compare=0'}`, { credentials: 'include' })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not load analytics'); return j as Resp })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [q, range.compare])

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5"><RangePicker value={range} onChange={setRange} /></Panel>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <div className="h-48 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" aria-label="Loading" />}
      {data && (
        <>
          <KpiGrid items={data.kpis} compare={range.compare} />
          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelView funnel={data.assessments.funnel} />
            <FunnelView funnel={data.hiring_funnel} />
          </div>
          {data.assessments.tests.length === 0 ? (
            <EmptyState illustration="analytics" title="No test activity in this period" description="Invite candidates to a test and their progress shows up here." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel className="overflow-x-auto lg:col-span-2">
                <h3 className="mb-3 text-base font-semibold text-foreground">Tests</h3>
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Results per test in this period</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">Test</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Invited</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Started</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Submitted</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Completion</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Avg score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assessments.tests.map((t) => (
                      <tr key={t.exam_id} className="border-t border-border/60">
                        <th scope="row" className="max-w-[16rem] truncate py-1.5 pr-3 text-left font-normal" title={t.title}>{t.title}</th>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(t.invited)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(t.started)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(t.submitted)}{t.auto_submitted ? <span className="text-xs text-muted-foreground"> ({t.auto_submitted} auto)</span> : null}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(t.completion_rate, 'percent')}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(t.avg_score, 'percent')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Panel>
                <h3 className="mb-3 text-base font-semibold text-foreground">Score spread</h3>
                <BarList caption="Submissions by score band" rows={data.assessments.score_distribution.map((b) => ({ label: b.label, value: b.count }))} />
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  )
}
