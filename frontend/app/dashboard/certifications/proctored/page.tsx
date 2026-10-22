'use client'

/**
 * Proctored CodeSpectra certifications for the learner: the catalog with their
 * status per certification, their credentials (verify link, expiry) and open
 * attempts. Buying and taking an attempt happen on the detail page.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, BadgeCheck, Clock, ShieldCheck } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import type { PublicProgram } from '@/lib/pro-certs/types'

interface Overview {
  programs: PublicProgram[]
  credentials: Array<{ id: string; program_slug: string; program_title: string; issued_at: string; expires_at: string; state: string }>
  open_attempts: Array<{ id: string; program_slug: string; status: string; created_at: string }>
}

export default function ProctoredCertificationsPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/pro-certs', { credentials: 'include', cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(apiError(body))
      setData(body as Overview)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [apiError])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])
  if (!gate.ready) return null

  const price = (p: PublicProgram) => (['INR', 'USD'] as const).filter((c) => p.price[c] !== null).map((c) => fmt.currency((p.price[c] as number) / 100, c)).join(' / ')
  const stateLabel = (s: string) => t(s === 'valid' ? 'learning.proCertStateValid' : s === 'expired' ? 'learning.proCertStateExpired' : s === 'renewed' ? 'learning.proCertStateRenewed' : 'learning.proCertStateRevoked')

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader title={t('learning.proctoredCertifications')} description={t('learning.proCertPageDescription')} icon={<ShieldCheck />} />
      {error && !data && (
        <EmptyState illustration="error" title={t('learning.proCertLoadFailed')} description={error} actionLabel={t('learning.proCertRetry')} onAction={() => void load()} />
      )}
      {!data && !error && <p className="text-sm text-muted-foreground" role="status">{t('learning.proCertLoading')}</p>}
      {data && (
        <>
          {data.credentials.length > 0 && (
            <Panel>
              <Section title={t('learning.proCertMyCredentials')}>
                <ul className="divide-y divide-border">
                  {data.credentials.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-foreground"><BadgeCheck className="h-4 w-4 text-primary" aria-hidden />{c.program_title}</p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-mono">{c.id}</span> · {stateLabel(c.state)} · {t('learning.proCertValidUntil', { date: fmt.date(c.expires_at) })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm" className="rounded-full"><Link href={`/verify/${c.id}`}>{t('learning.proCertVerifyPage')}</Link></Button>
                        <Button asChild size="sm" className="rounded-full"><Link href={`/dashboard/certifications/proctored/${c.program_slug}`}>{t('learning.proCertOpen')}</Link></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            </Panel>
          )}
          {data.open_attempts.length > 0 && (
            <Panel>
              <Section title={t('learning.proCertOpenAttempts')}>
                <ul className="divide-y divide-border">
                  {data.open_attempts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="flex items-center gap-2 text-foreground"><Clock className="h-4 w-4 text-primary" aria-hidden />{data.programs.find((p) => p.slug === a.program_slug)?.title ?? a.program_slug}</span>
                      <Link href={`/dashboard/certifications/proctored/${a.program_slug}`} className="font-medium text-primary hover:underline">
                        {a.status === 'ready' ? t('learning.proCertContinue') : t('learning.proCertUnderReview')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </Panel>
          )}
          <Section title={t('learning.proCertCatalog')} description={t('learning.proCertCatalogDescription')}>
            {data.programs.length === 0 ? (
              <EmptyState illustration="certificate" title={t('learning.proCertNoneYet')} description={t('learning.proCertNoneYetBody')} />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.programs.map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/certifications/proctored/${p.slug}`} className="flex h-full flex-col rounded-3xl border border-border/70 bg-card p-5 transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
                      <span className="flex items-center gap-2 text-xs font-medium text-primary"><Award className="h-4 w-4" aria-hidden />{td(`learning.proCertLevel_${p.level}`, p.level)}</span>
                      <span className="mt-2 font-semibold text-foreground">{p.title}</span>
                      <span className="mt-1 flex-1 text-sm text-muted-foreground">{p.summary}</span>
                      <span className="mt-3 text-sm tabular-nums text-muted-foreground">{t('learning.proCertFacts', { questions: p.questions, minutes: p.duration_min, pass: p.pass_percent })}</span>
                      {price(p) && <span className="mt-1 text-sm font-semibold tabular-nums text-foreground">{t('learning.proCertPricePerAttempt', { price: price(p) })}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
