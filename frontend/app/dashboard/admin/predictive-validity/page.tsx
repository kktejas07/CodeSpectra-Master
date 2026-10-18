'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart3, RefreshCw, Users, UserCheck, Star } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { SoftGlow } from '@/components/visuals'
import { OUTCOME_LABELS, OUTCOME_STATUSES, type CorrelationResult, type ValidityReport } from '@/lib/hiring-outcomes'

interface ApiResponse {
  exams: Array<{ id: string; title: string; outcomes: number }>
  selected: string | null
  report: ValidityReport
  excluded: { pending_grading: number; no_score: number }
}

/** Plain-words reading of a correlation (|r|: < 0.1 none, < 0.3 weak, < 0.5 moderate, else strong). */
function strength(r: number): string {
  const a = Math.abs(r)
  const dir = r >= 0 ? 'positive' : 'negative'
  if (a < 0.1) return 'No clear link'
  if (a < 0.3) return `Weak ${dir} link`
  if (a < 0.5) return `Moderate ${dir} link`
  return `Strong ${dir} link`
}

function CorrelationCard({ title, description, result, minSample }: { title: string; description: string; result: CorrelationResult; minSample: number }) {
  return (
    <Panel className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {!result.enough ? (
        <>
          <p className="text-2xl font-bold tracking-tight">Not enough data yet</p>
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">{result.n}</span> of the <span className="tabular-nums">{minSample}</span> candidates needed. {description}
          </p>
        </>
      ) : result.r === null ? (
        <>
          <p className="text-2xl font-bold tracking-tight">Can’t compute</p>
          <p className="text-sm text-muted-foreground">Everyone in the sample has the same score or the same outcome (n = <span className="tabular-nums">{result.n}</span>).</p>
        </>
      ) : (
        <>
          <p className="font-mono text-3xl font-bold tabular-nums">r = {result.r.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">{strength(result.r)} · n = <span className="tabular-nums">{result.n}</span>. {description}</p>
        </>
      )}
    </Panel>
  )
}

function corrCell(c: CorrelationResult) {
  if (!c.enough) return <span className="text-xs text-muted-foreground">Not enough data (<span className="tabular-nums">{c.n}</span>)</span>
  if (c.r === null) return <span className="text-xs text-muted-foreground">--</span>
  return <span className="font-mono tabular-nums">{c.r.toFixed(2)} <span className="font-sans text-xs text-muted-foreground">(n = {c.n})</span></span>
}

export default function PredictiveValidityPage() {
  const gate = usePageGuard('tenant_admin')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [examId, setExamId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = examId ? `?exam_id=${encodeURIComponent(examId)}` : ''
      const res = await fetch(`/api/admin/predictive-validity${qs}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not load predictive validity.')
      setData(json as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load predictive validity.')
    } finally {
      setLoading(false)
    }
  }, [examId])

  useEffect(() => { void fetchData() }, [fetchData])

  if (!gate.ready) return null
  const report = data?.report
  const hired = report?.counts.hired ?? 0
  const rated = report?.bands.reduce((a, b) => a + b.rated, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="analytics"
          title="Predictive validity"
          description="Do higher test scores go with hiring and with how people perform after they join? Built from the outcomes your team records on each test's results page."
          icon={<BarChart3 />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="pv-exam" className="sr-only">Test</label>
              <select
                id="pv-exam"
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="h-9 max-w-[16rem] rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All tests</option>
                {data?.exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.outcomes})</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={() => void fetchData()} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>
            </div>
          }
        />
      </div>

      {loading && !data ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <EmptyState illustration="analytics" title="Couldn’t load this page" description={error} actionLabel="Try again" onAction={() => void fetchData()} />
      ) : !report || report.total === 0 ? (
        <EmptyState
          illustration="analytics"
          title="No hiring outcomes yet"
          description={`Open a test's results, select candidates and choose "Record outcome" (shortlisted, interviewed, offered, hired, rejected or withdrew). Add 30, 90 and 180-day ratings for people you hire. Results appear here once at least ${report?.minSample ?? 30} candidates have an outcome.`}
          actionLabel="Go to assessments"
          actionHref="/dashboard/admin/assessments"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Candidates with an outcome" value={report.total.toLocaleString()} icon={<Users />} />
            <StatCard label="Hired" value={hired.toLocaleString()} icon={<UserCheck />} />
            <StatCard label="Hired with a performance rating" value={rated.toLocaleString()} icon={<Star />} />
          </div>

          <Panel className="flex flex-wrap gap-2">
            {OUTCOME_STATUSES.map((s) => (
              <Badge key={s} variant="outline" className="text-xs">{OUTCOME_LABELS[s]}: <span className="ml-1 tabular-nums">{report.counts[s]}</span></Badge>
            ))}
            {(data!.excluded.pending_grading > 0 || data!.excluded.no_score > 0) && (
              <span className="text-xs text-muted-foreground">
                Left out: <span className="tabular-nums">{data!.excluded.pending_grading}</span> still being graded, <span className="tabular-nums">{data!.excluded.no_score}</span> without a score.
              </span>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <CorrelationCard
              title="Test score vs hired"
              description="Hired = 1, rejected = 0; candidates still in progress or who withdrew are left out."
              result={report.hire}
              minSample={report.minSample}
            />
            <CorrelationCard
              title="Test score vs performance after hire"
              description="Average of the 30, 90 and 180-day ratings (1–5) of hired candidates."
              result={report.performance}
              minSample={report.minSample}
            />
          </div>

          <Section title="Score bands" description="Hire rate counts hired out of hired + rejected in each band.">
            <Panel className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Candidates</th>
                    <th className="px-4 py-3 font-medium">Hired / decided</th>
                    <th className="px-4 py-3 font-medium">Hire rate</th>
                    <th className="px-4 py-3 font-medium">Rated</th>
                    <th className="px-4 py-3 font-medium">Average performance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bands.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium tabular-nums">{b.label}</td>
                      <td className="px-4 py-3 tabular-nums">{b.candidates}</td>
                      <td className="px-4 py-3 tabular-nums">{b.hired} / {b.decided}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {b.hireRate === null ? '--' : (
                          <div className="flex items-center gap-2">
                            <span className="w-10">{Math.round(b.hireRate * 100)}%</span>
                            <span className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(b.hireRate * 100)}%` }} />
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{b.rated}</td>
                      <td className="px-4 py-3 tabular-nums">{b.avgPerformance === null ? '--' : `${b.avgPerformance.toFixed(2)} / 5`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            {report.total < report.minSample && (
              <p className="text-xs text-muted-foreground">Small numbers: with fewer than <span className="tabular-nums">{report.minSample}</span> candidates, band rates can swing a lot. Treat them as a first look.</p>
            )}
          </Section>

          {data!.selected ? (
            report.sections.length > 0 && (
              <Section title="By section" description="Which parts of the test track hiring and performance best.">
                <Panel className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Section</th>
                        <th className="px-4 py-3 font-medium">Score vs hired</th>
                        <th className="px-4 py-3 font-medium">Score vs performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sections.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">{s.title}</td>
                          <td className="px-4 py-3">{corrCell(s.hire)}</td>
                          <td className="px-4 py-3">{corrCell(s.performance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </Section>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Choose a single test above to see results by section.</p>
          )}
        </>
      )}
    </div>
  )
}
