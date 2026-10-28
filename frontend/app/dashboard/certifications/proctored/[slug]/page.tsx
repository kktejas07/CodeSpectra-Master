'use client'

/**
 * One proctored certification for the learner: what the exam covers, whether
 * they can buy an attempt now (and why not), payment, the personal start link
 * for an open attempt, past attempts, and the credential with its verify page,
 * expiry and LinkedIn "add to profile". All rules are enforced server-side.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Award, BadgeCheck, Clock, ExternalLink, ListChecks, PlayCircle, ShieldCheck, Target } from 'lucide-react'
import { Linkedin } from '@/components/ui/brand-icons'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel, Section, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { NativePurchaseGate } from '@/components/native/native-purchase-gate'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import type { PublicProgram } from '@/lib/pro-certs/types'

interface State {
  program: PublicProgram
  eligibility: { ok: true; renewal: string | null } | { ok: false; reason: string; retry_at: string | null }
  attempts: Array<{ id: string; status: string; score_pct: number | null; created_at: string; decided_at: string | null; submitted_at: string | null; start_url: string | null; start_by: string | null }>
  credential: { id: string; issued_at: string; expires_at: string; status: string; state: string } | null
  pending_order: { id: string; status: string; created_at: string } | null
  verify_url: string | null
  linkedin_url: string | null
}

export default function ProctoredCertificationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const search = useSearchParams()
  const [data, setData] = useState<State | null>(null)
  const [error, setError] = useState<{ msg: string; status: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/pro-certs/${encodeURIComponent(slug)}`, { credentials: 'include', cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError({ msg: apiError(body), status: res.status }); return }
      const s = body as State
      setData(s)
      setCurrency((c) => (s.program.price[c] !== null ? c : s.program.price.INR !== null ? 'INR' : 'USD'))
    } catch {
      setError({ msg: t('learning.proCertLoadFailed'), status: 0 })
    }
  }, [slug, apiError, t])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  // Back from the payment page: the server settles from the gateway; refresh a few times while it confirms.
  const payment = search.get('payment')
  useEffect(() => {
    if (!gate.ready || payment !== 'success' && payment !== 'pending') return
    let n = 0
    const id = setInterval(() => { n++; void load(); if (n >= 5) clearInterval(id) }, 4000)
    return () => clearInterval(id)
  }, [gate.ready, payment, load])

  const buy = async () => {
    setBusy(true)
    try {
      const res = await csrfFetch(`/api/pro-certs/${encodeURIComponent(slug)}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) { addToast({ type: 'error', title: apiError(body) }); return }
      window.location.assign(String((body as { redirect_url: string }).redirect_url))
    } finally {
      setBusy(false)
    }
  }

  if (!gate.ready) return null
  if (error) {
    return error.status === 404
      ? <EmptyState illustration="certificate" title={t('learning.proCertNotFound')} description={t('learning.proCertNotFoundBody')} actionLabel={t('learning.proCertBackToList')} actionHref="/dashboard/certifications/proctored" />
      : <EmptyState illustration="error" title={t('learning.proCertLoadFailed')} description={error.msg} actionLabel={t('learning.proCertRetry')} onAction={() => void load()} />
  }
  if (!data) return <p className="text-sm text-muted-foreground" role="status">{t('learning.proCertLoading')}</p>

  const p = data.program
  const open = data.attempts.find((a) => a.status === 'ready' && a.start_url)
  const reviewing = data.attempts.find((a) => a.status === 'in_review')
  const cred = data.credential
  const currencies = (['INR', 'USD'] as const).filter((c) => p.price[c] !== null)
  const why = !data.eligibility.ok ? data.eligibility : null
  const statusLabel = (s: string) => td(`learning.proCertAttempt_${s}`, s)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={p.title}
        description={p.summary}
        icon={<ShieldCheck />}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/certifications/proctored">{t('learning.proCertBackToList')}</Link></Button>}
      />
      {payment === 'success' && !open && !cred && (
        <p role="status" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">{t('learning.proCertPaymentConfirming')}</p>
      )}
      {(payment === 'failed' || payment === 'canceled') && (
        <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">{t('learning.proCertPaymentFailed')}</p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('learning.proCertQuestions')} value={p.questions} icon={<ListChecks />} />
        <StatCard label={t('learning.proCertDuration')} value={t('learning.proCertMinutes', { count: p.duration_min })} icon={<Clock />} />
        <StatCard label={t('learning.proCertPassMark')} value={`${p.pass_percent}%`} icon={<Target />} />
        <StatCard label={t('learning.proCertValidity')} value={t('learning.proCertMonths', { count: p.validity_months })} icon={<Award />} />
      </div>

      {cred && (
        <Panel>
          <Section title={t('learning.proCertYourCredential')}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground"><BadgeCheck className="h-5 w-5 text-primary" aria-hidden /><span className="font-mono">{cred.id}</span></p>
                <p className="text-muted-foreground">{t('learning.proCertIssuedOn', { date: fmt.date(cred.issued_at) })} · {t('learning.proCertValidUntil', { date: fmt.date(cred.expires_at) })}</p>
                {cred.state !== 'valid' && <p className="text-amber-800 dark:text-amber-300">{td(`learning.proCertState_${cred.state}`, cred.state)}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.verify_url && <Button asChild variant="outline" className="rounded-full"><Link href={`/verify/${cred.id}`}><ExternalLink className="h-4 w-4" aria-hidden />{t('learning.proCertVerifyPage')}</Link></Button>}
                {data.linkedin_url && <Button asChild className="rounded-full"><a href={data.linkedin_url} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" aria-hidden />{t('learning.proCertAddToLinkedIn')}</a></Button>}
              </div>
            </div>
          </Section>
        </Panel>
      )}

      <Panel>
        <Section title={open ? t('learning.proCertYourAttempt') : t('learning.proCertGetCertified')}>
          {open ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('learning.proCertStartHint', { date: open.start_by ? fmt.date(open.start_by) : '' })}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t('learning.proCertCheckCamera')}</li>
                <li>{t('learning.proCertCheckId')}</li>
                <li>{t('learning.proCertCheckQuiet')}</li>
              </ul>
              <Button asChild className="h-11 rounded-full px-6"><Link href={open.start_url as string}><PlayCircle className="h-4 w-4" aria-hidden />{t('learning.proCertStartTest')}</Link></Button>
            </div>
          ) : reviewing ? (
            <p className="text-sm text-muted-foreground">{t('learning.proCertReviewing')}</p>
          ) : why ? (
            <p className="text-sm text-muted-foreground">
              {td(`learning.proCertWhy_${why.reason}`, why.reason, { date: why.retry_at ? fmt.date(why.retry_at) : '' })}
            </p>
          ) : (
            // CORE-038: no price or Buy button inside the phone apps (store rules).
            <NativePurchaseGate compact>
            <div className="space-y-3">
              {data.eligibility.ok && data.eligibility.renewal && <p className="text-sm text-muted-foreground">{t('learning.proCertRenewalHint')}</p>}
              {currencies.length > 1 && (
                <fieldset className="flex gap-2">
                  <legend className="sr-only">{t('learning.proCertCurrency')}</legend>
                  {currencies.map((c) => (
                    <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}
                      className={`h-9 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${currency === c ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                      {c}
                    </button>
                  ))}
                </fieldset>
              )}
              {p.price[currency] !== null && (
                <p className="text-lg font-semibold tabular-nums text-foreground">{t('learning.proCertPricePerAttempt', { price: fmt.currency((p.price[currency] as number) / 100, currency) })}</p>
              )}
              <p className="text-sm text-muted-foreground">{t('learning.proCertRules', { days: p.attempts.cooldown_days, max: p.attempts.max_per_year })}</p>
              <Button onClick={() => void buy()} disabled={busy || currencies.length === 0} className="h-11 rounded-full px-6">
                {busy ? t('learning.proCertRedirecting') : data.eligibility.ok && data.eligibility.renewal ? t('learning.proCertBuyRenewal') : t('learning.proCertBuy')}
              </Button>
            </div>
            </NativePurchaseGate>
          )}
        </Section>
      </Panel>

      <Panel>
        <Section title={t('learning.proCertWhatsInside')}>
          <ul className="divide-y divide-border text-sm">
            {p.sections.map((s) => (
              <li key={s.name} className="flex justify-between py-2"><span className="text-foreground">{s.name}</span><span className="tabular-nums text-muted-foreground">{t('learning.proCertQuestionsCount', { count: s.questions })}</span></li>
            ))}
          </ul>
        </Section>
      </Panel>

      {data.attempts.length > 0 && (
        <Panel>
          <Section title={t('learning.proCertPastAttempts')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('learning.proCertBought')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('learning.proCertStatus')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('learning.proCertScore')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {data.attempts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3">{fmt.date(a.created_at)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{statusLabel(a.status)}</td>
                      <td className="py-2 text-right">{a.score_pct != null ? `${Math.round(a.score_pct)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </Panel>
      )}
    </div>
  )
}
