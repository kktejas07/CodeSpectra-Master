'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Briefcase, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface PortalJob {
  id: string
  title: string
  location: string | null
  work_mode: string | null
  status: string
  openings: number
  stages: { id: string; name: string; type: string; count: number }[]
  awaiting_review: number
  total_visible: number
}

const STATUS_LABEL = (t: Translator): Record<string, string> => ({ open: t('hiring.open'), on_hold: t('hiring.onHold'), closed: t('hiring.closed'), filled: t('hiring.filled') })

function PortalInner() {
  const { t } = useT()
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const [jobs, setJobs] = useState<PortalJob[] | null>(null)
  const [client, setClient] = useState<{ name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/ats/client/jobs${q}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, json: await r.json() }))
      .then(({ ok, json }) => {
        if (cancelled) return
        if (!ok) setError(json.error || t('hiring.couldNotLoadYourJobs'))
        else { setJobs(json.jobs || []); setClient(json.client || null) }
      })
      .catch(() => { if (!cancelled) setError(t('hiring.couldNotLoadYourJobs')) })
    return () => { cancelled = true }
  }, [q])

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState illustration="locked" title={t('hiring.theClientPortalIsntAvailableTo9df')} description={t('hiring.errorThePortalIsForClient638', { error })} actionLabel={t('hiring.backToHiring')} actionHref="/dashboard/hiring" />
      </div>
    )
  }
  if (!jobs) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loadingJobs')} /></div>
  }

  const waiting = jobs.reduce((a, j) => a + j.awaiting_review, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        icon={<Briefcase />}
        title={client?.name ? t('hiring.nameClientPortal', { name: client.name }) : t('hiring.clientPortal')}
        description={waiting ? t('hiring.countCandidatesAreWaitingForYour1f8', { count: waiting }) : t('hiring.reviewShortlistedCandidatesForYourOpen949')}
      />
      {jobs.length === 0 ? (
        <EmptyState illustration="jobs" title={t('hiring.noRolesSharedWithYouYet')} description={t('hiring.whenTheHiringTeamShortlistsCandidates505')} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label={t('hiring.yourJobs')}>
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/dashboard/hiring/client/jobs/${j.id}${q}`} className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Panel interactive className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-foreground">{j.title}</h2>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                        {(j.location || j.work_mode) && <MapPin className="h-3.5 w-3.5" aria-hidden />}
                        {[j.location, j.work_mode].filter(Boolean).join(' · ') || t('hiring.countOpenings', { count: j.openings })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {j.awaiting_review > 0 ? <Badge className="border-primary/20 bg-primary/10 text-primary">{t('hiring.awaitingReviewToReview', { awaiting_review: j.awaiting_review })}</Badge> : <Badge variant="outline">{STATUS_LABEL(t)[j.status] || j.status}</Badge>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </div>
                  </div>
                  {j.stages.length > 0 && (
                    <dl className="mt-4 flex flex-wrap gap-2">
                      {j.stages.map((s) => (
                        <div key={s.id} className="rounded-xl border border-border/70 bg-muted/30 px-3 py-1.5">
                          <dt className="text-xs text-muted-foreground">{s.name}</dt>
                          <dd className="text-sm font-semibold tabular-nums text-foreground">{s.count}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ClientPortalPage() {
  const { t } = useT()
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loading')} /></div>}>
      <PortalInner />
    </Suspense>
  )
}
