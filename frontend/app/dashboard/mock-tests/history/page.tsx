'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { formatDate } from '@/lib/format-datetime'
import { formatDuration, resumeHref } from './_format'

interface HistoryRow {
  id: string
  company: string
  role: string
  difficulty: string
  status: 'submitted' | 'in_progress'
  score: number | null
  total: number
  percentage: number | null
  created_at: string
  submitted_at: string | null
  time_taken_sec: number | null
}

interface HistoryResponse {
  items: HistoryRow[]
  page: number
  page_size: number
  total: number
  total_pages: number
  facets: { companies: string[]; roles: string[] }
  trend: { id: string; percentage: number; submitted_at: string }[]
}

type SortKey = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc'

const PAGE_SIZE = 10
const selectCls =
  'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Small score trend line (0–100 %), theme tokens only, with a text alternative. */
function ScoreTrend({ points }: { points: HistoryResponse['trend'] }) {
  const W = 600
  const H = 160
  const PAD = { l: 32, r: 12, t: 12, b: 20 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const xy = points.map((p, i) => ({
    x: PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw),
    y: PAD.t + ih - (Math.max(0, Math.min(100, p.percentage)) / 100) * ih,
    p,
  }))
  const path = xy.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const first = points[0]?.percentage ?? 0
  const last = points[points.length - 1]?.percentage ?? 0
  const avg = Math.round(points.reduce((s, p) => s + p.percentage, 0) / Math.max(1, points.length))
  const summary = `Score trend over your last ${points.length} submitted attempts: from ${first}% to ${last}%, average ${avg}%.`

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">Score trend</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Last {points.length} · average {avg}%
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label={summary} preserveAspectRatio="none">
        <g className="text-border" stroke="currentColor" strokeWidth={1}>
          {[0, 50, 100].map((v) => {
            const y = PAD.t + ih - (v / 100) * ih
            return <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} strokeDasharray={v === 0 ? undefined : '3 4'} />
          })}
        </g>
        <g className="fill-muted-foreground text-[11px]">
          {[0, 50, 100].map((v) => (
            <text key={v} x={PAD.l - 6} y={PAD.t + ih - (v / 100) * ih + 4} textAnchor="end">{v}%</text>
          ))}
        </g>
        <path d={path} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {xy.map((c) => (
          <circle key={c.p.id} cx={c.x} cy={c.y} r={3.5} className="fill-card stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke">
            <title>{`${formatDate(c.p.submitted_at)}: ${c.p.percentage}%`}</title>
          </circle>
        ))}
      </svg>
      <ol className="sr-only">
        {points.map((p) => <li key={p.id}>{formatDate(p.submitted_at)}: {p.percentage}%</li>)}
      </ol>
    </figure>
  )
}

export default function MockTestHistoryPage() {
  const gate = usePageGuard('user')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<'all' | 'submitted' | 'in_progress'>('all')
  const [sort, setSort] = useState<SortKey>('date-desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const query = useMemo(() => {
    const [s, o] = sort.split('-')
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), status, sort: s, order: o })
    if (company) qs.set('company', company)
    if (role) qs.set('role', role)
    return qs.toString()
  }, [company, role, status, sort, page])

  useEffect(() => {
    if (!gate.ready) return
    const ac = new AbortController()
    setLoading(true)
    setError(false)
    fetch(`/api/mock-tests/attempts?${query}`, { cache: 'no-store', signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: HistoryResponse) => setData(d))
      .catch(() => { if (!ac.signal.aborted) setError(true) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [gate.ready, query])

  if (!gate.ready) return null

  const filtered = Boolean(company || role || status !== 'all')
  const resetTo1 = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  return (
    <div className="flex-1 space-y-6">
      <Link href="/dashboard/mock-tests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to mock tests
      </Link>
      <PageHeader
        className="mb-0"
        icon={<History aria-hidden />}
        title="Mock test history"
        description="Every test you've started or finished. Open a finished one to see the right answers."
      />

      {data && data.trend.length >= 2 && (
        <Panel>
          <ScoreTrend points={data.trend} />
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filter and sort attempts">
        <div className="space-y-1">
          <label htmlFor="mh-company" className="text-xs font-medium text-muted-foreground">Company</label>
          <select id="mh-company" className={selectCls} value={company} onChange={(e) => resetTo1(setCompany)(e.target.value)}>
            <option value="">All companies</option>
            {data?.facets.companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="mh-role" className="text-xs font-medium text-muted-foreground">Role</label>
          <select id="mh-role" className={selectCls} value={role} onChange={(e) => resetTo1(setRole)(e.target.value)}>
            <option value="">All roles</option>
            {data?.facets.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="mh-status" className="text-xs font-medium text-muted-foreground">Status</label>
          <select id="mh-status" className={selectCls} value={status} onChange={(e) => resetTo1(setStatus)(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="submitted">Submitted</option>
            <option value="in_progress">In progress</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="mh-sort" className="text-xs font-medium text-muted-foreground">Sort by</label>
          <select id="mh-sort" className={selectCls} value={sort} onChange={(e) => resetTo1(setSort)(e.target.value as SortKey)}>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="score-desc">Highest score</option>
            <option value="score-asc">Lowest score</option>
          </select>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">Couldn&apos;t load your attempts. Refresh to try again.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">Loading your attempts…</p>
      ) : data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            illustration="mock-test"
            title="No attempts match these filters"
            description="Try another company, role or status."
            actionLabel="Clear filters"
            onAction={() => { setCompany(''); setRole(''); setStatus('all'); setPage(1) }}
          />
        ) : (
          <EmptyState
            illustration="mock-test"
            title="No attempts yet"
            description="Start a mock test and it will show up here, with your score once you submit."
            actionLabel="Browse mock tests"
            actionHref="/dashboard/mock-tests"
          />
        )
      ) : (
        <Panel className="overflow-hidden p-0" aria-busy={loading}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Your mock test attempts, page {data.page} of {data.total_pages}</caption>
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-left text-muted-foreground">
                  <th scope="col" className="p-3 font-medium">Test</th>
                  <th scope="col" className="p-3 font-medium">Date</th>
                  <th scope="col" className="p-3 font-medium text-right">Score</th>
                  <th scope="col" className="p-3 font-medium text-right">Time taken</th>
                  <th scope="col" className="p-3 font-medium">Status</th>
                  <th scope="col" className="p-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="p-3">
                      <span className="font-medium text-foreground">{a.company}</span>
                      <span className="text-muted-foreground"> · {a.role}</span>
                      <span className="block text-xs capitalize text-muted-foreground">{a.difficulty}</span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(a.submitted_at ?? a.created_at)}</td>
                    <td className="p-3 text-right whitespace-nowrap tabular-nums">
                      {a.status === 'submitted' ? <>{a.percentage}% <span className="text-muted-foreground">({a.score}/{a.total})</span></> : '—'}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap tabular-nums text-muted-foreground">{formatDuration(a.time_taken_sec)}</td>
                    <td className="p-3">
                      {a.status === 'submitted'
                        ? <Badge variant="secondary">Submitted</Badge>
                        : <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">In progress</Badge>}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {a.status === 'submitted' ? (
                        <Link href={`/dashboard/mock-tests/history/${encodeURIComponent(a.id)}`} className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                          Review<span className="sr-only"> {a.company} {a.role}</span>
                        </Link>
                      ) : (
                        <Link href={resumeHref(a)} className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                          Resume<span className="sr-only"> {a.company} {a.role}</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total_pages > 1 && (
            <nav className="flex items-center justify-between gap-3 border-t border-border/60 p-3" aria-label="Pagination">
              <p className="text-xs text-muted-foreground tabular-nums">
                Page {data.page} of {data.total_pages} · {data.total} attempts
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.total_pages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </Panel>
      )}
    </div>
  )
}
