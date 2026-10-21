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
import { useT } from '@/lib/i18n/client'

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
  const { t, td } = useT()
  const levelLabel = (l: PracticeLevel) => td(`dashboard.practiceLevel:${l}`, LEVEL_LABEL[l])
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
        title={t('dashboard.companyTestsTitle')}
        description={t('dashboard.companyTestsDesc')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/mock-tests">{t('dashboard.aiMockTests')}</Link>
          </Button>
        }
      />

      {error ? (
        <EmptyState
          illustration="error"
          title={t('dashboard.companyTestsLoadFailed')}
          description={t('errors.checkConnection')}
          actionLabel={t('common.tryAgain')}
          onAction={() => { setItems(null); setReload((k) => k + 1) }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          illustration="courses"
          title={t('dashboard.noCompanyTests')}
          description={t('dashboard.noCompanyTestsDesc')}
          actionLabel={t('dashboard.browseCompanies')}
          actionHref="/companies"
        />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="rounded-xl pl-9" aria-label={t('dashboard.searchCompanyTests')} placeholder={t('dashboard.searchCompanyTestsPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <Panel className="p-4">
              <EmptyState
                variant="search"
                title={t('dashboard.noTestsMatch')}
                description={t('dashboard.noTestsMatchDesc')}
                actionLabel={t('common.clearSearch')}
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
                    {!p.verified ? <Badge variant="outline" title={t('dashboard.unverifiedHint')}>{t('dashboard.unverified')}</Badge> : null}
                  </div>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" aria-hidden />{t('assessment.questionsCount', { count: p.totals.questions })}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{t('assessment.minutesShort', { count: p.totals.minutes })}</span>
                    <span>{t('dashboard.sectionsCount', { count: p.sections.length })}</span>
                    <span>{t('dashboard.cutoff', { percent: `${p.cutoffPercent}%` })}</span>
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4" role="group" aria-label={t('dashboard.practiseAtLevel', { company: p.companyName, exam: p.examName })}>
                    {p.levels.map((l) => l.ready ? (
                      <Button key={l.level} asChild size="sm" className="min-h-10 rounded-full">
                        <Link href={`/dashboard/company-tests/${encodeURIComponent(p.id)}?level=${l.level}`}>{levelLabel(l.level)}</Link>
                      </Button>
                    ) : (
                      <span key={l.level} className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-xs text-muted-foreground" title={t('dashboard.beingPrepared')}>
                        {levelLabel(l.level)} · {t('dashboard.comingSoon')}
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
