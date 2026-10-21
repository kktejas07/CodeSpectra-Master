'use client'

/**
 * Company tests: every active company exam pattern with its Easy / Moderate /
 * Tough practice runs (replaces the old Quizzes catalogue). Same data as the
 * practice block on /companies/<slug> (GET /api/company-tests?all=1).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, ListChecks, Search } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { LEVEL_LABEL, type PracticeLevel } from '@/lib/company-tests/types'

interface PatternCard {
  id: string
  examName: string
  companyName: string
  companySlug: string
  verified: boolean
  negativeMarking: number
  cutoffPercent: number
  totals: { questions: number; minutes: number }
  sections: { name: string }[]
  levels: { level: PracticeLevel; ready: boolean }[]
}

export default function CompanyTestsPage() {
  const gate = usePageGuard('user')
  const [items, setItems] = useState<PatternCard[] | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    setError(false)
    fetch('/api/company-tests?all=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setItems(Array.isArray(d.items) ? d.items : []) })
      .catch(() => { if (live) { setItems([]); setError(true) } })
    return () => { live = false }
  }, [gate.ready, reload])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!items || !query) return items ?? []
    return items.filter((p) => `${p.companyName} ${p.examName} ${p.sections.map((s) => s.name).join(' ')}`.toLowerCase().includes(query))
  }, [items, q])

  if (!gate.ready || items === null) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonList count={6} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        illustration="assessment"
        className="mb-0"
        icon={<ListChecks aria-hidden />}
        title="Company tests"
        description="Practise each company's real test pattern: timed sections, cut-offs and marking, at three levels."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/mock-tests">AI mock tests</Link>
          </Button>
        }
      />

      {error ? (
        <EmptyState
          illustration="error"
          title="Couldn't load company tests"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => { setItems(null); setReload((k) => k + 1) }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          illustration="courses"
          title="No company tests yet"
          description="Company test patterns are being prepared. Browse company pages or take an AI mock test meanwhile."
          actionLabel="Browse companies"
          actionHref="/companies"
        />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="rounded-xl pl-9" aria-label="Search company tests" placeholder="Search by company or test" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <Panel className="p-4">
              <EmptyState
                variant="search"
                title="No tests match your search"
                description="Try another company name, or clear the search."
                actionLabel="Clear search"
                onAction={() => setQ('')}
              />
            </Panel>
          ) : (
            <BentoGrid>
              {filtered.map((p) => (
                <Panel key={p.id} className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/companies/${encodeURIComponent(p.companySlug)}`} className="font-semibold text-foreground hover:text-primary">
                        {p.companyName}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">{p.examName}</p>
                    </div>
                    {!p.verified ? <Badge variant="outline" title="Based on commonly reported public information">Unverified</Badge> : null}
                  </div>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{p.totals.questions}</span> questions</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{p.totals.minutes}</span> min</span>
                    <span><span className="tabular-nums">{p.sections.length}</span> {p.sections.length === 1 ? 'section' : 'sections'}</span>
                    <span>Cut-off <span className="tabular-nums">{p.cutoffPercent}%</span></span>
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4" role="group" aria-label={`Practise ${p.companyName} ${p.examName} at a level`}>
                    {p.levels.map((l) => l.ready ? (
                      <Button key={l.level} asChild size="sm" className="min-h-10 rounded-full">
                        <Link href={`/dashboard/company-tests/${encodeURIComponent(p.id)}?level=${l.level}`}>{LEVEL_LABEL[l.level]}</Link>
                      </Button>
                    ) : (
                      <span key={l.level} className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-xs text-muted-foreground" title="Being prepared">
                        {LEVEL_LABEL[l.level]} · coming soon
                      </span>
                    ))}
                  </div>
                </Panel>
              ))}
            </BentoGrid>
          )}
        </>
      )}
    </div>
  )
}
