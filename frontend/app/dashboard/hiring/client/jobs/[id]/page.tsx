'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ClipboardList, Loader2, MessageSquare, X } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { useApiError } from '@/lib/i18n/use-api-error'

interface ReviewComment { id: string; author_name: string; author_role: string; body: string; created_at: string }
interface ReviewApp {
  id: string
  stage: { id: string; name: string; type: string }
  status: string
  stage_entered_at: string
  can_review: boolean
  pending_move: { to: string } | null
  candidate: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    parsed?: { summary?: string; skills?: string[]; titles?: string[]; companies?: string[]; total_years?: number | null; location?: string; education?: { degree?: string; field?: string; institution?: string }[] } | null
    resume?: { file_name: string } | null
  }
  match: { score: number; reasons: string[]; missing_must: string[] } | null
  results: { stage_name: string; outcome: string; score: number | null; summary: string | null; at: string }[]
  scorecards: { stage_name: string; mode: string; count: number; avg_rating: number | null; recommendations: Record<string, number>; lean: 'yes' | 'no' | 'mixed' }[]
  comments: ReviewComment[]
}
interface ReviewData {
  job: { id: string; title: string; location: string | null; work_mode: string | null; openings: number; skills?: string[] }
  stages: { id: string; name: string; type: string }[]
  applications: ReviewApp[]
  contacts_visible: boolean
}

const OUTCOME = (t: Translator): Record<string, { label: string; cls: string }> => ({
  pass: { label: t('hiring.passed'), cls: 'text-green-700 dark:text-green-400' },
  fail: { label: t('hiring.didNotPass'), cls: 'text-red-700 dark:text-red-400' },
  pending: { label: t('hiring.inProgress'), cls: 'text-muted-foreground' },
  skipped: { label: t('hiring.skipped'), cls: 'text-muted-foreground' },
})

function CandidateCard({ app, q, onChanged }: { app: ReviewApp; q: string; onChanged: () => Promise<void> }) {
  const apiError = useApiError()
  const { formatDate } = useLocaleDates()
  const { t } = useT()
  const addToast = useToast()
  const confirm = useConfirm()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'comment'>(null)
  const p = app.candidate.parsed

  async function decide(accept: boolean) {
    if (!accept) {
      const ok = await confirm({ title: t('hiring.rejectName', { name: app.candidate.name }), description: t('hiring.theHiringTeamWillBeTold7d8'), confirmText: t('hiring.reject'), destructive: true })
      if (!ok) return
    }
    setBusy(accept ? 'approve' : 'reject')
    try {
      const res = await csrfFetch(`/api/ats/applications/${app.id}/client-decision${q}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: accept ? 'approve' : 'reject' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) addToast({ type: 'error', title: apiError(json, t('hiring.couldNotSaveYourDecision')) })
      else { addToast({ type: 'success', title: accept ? t('hiring.nameApproved', { name: app.candidate.name }) : t('hiring.nameRejected', { name: app.candidate.name }) }); await onChanged() }
    } catch {
      addToast({ type: 'error', title: t('hiring.networkErrorTryAgain') })
    } finally {
      setBusy(null)
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setBusy('comment')
    try {
      const res = await csrfFetch(`/api/ats/applications/${app.id}/comments${q}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: comment, visibility: 'client' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) addToast({ type: 'error', title: apiError(json, t('hiring.couldNotPostYourComment')) })
      else { setComment(''); await onChanged() }
    } catch {
      addToast({ type: 'error', title: t('hiring.networkErrorTryAgain') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{app.candidate.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[p?.titles?.[0], p?.total_years != null ? `${p.total_years} yrs` : null, p?.location].filter(Boolean).join(' · ') || t('hiring.rSumSummaryBelow')}
          </p>
          {(app.candidate.email || app.candidate.phone) && (
            <p className="mt-0.5 text-sm text-muted-foreground">{[app.candidate.email, app.candidate.phone].filter(Boolean).join(' · ')}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{app.stage.name}</Badge>
            {app.status === 'hired' && <Badge variant="success">{t('hiring.hired')}</Badge>}
            {app.pending_move && <Badge variant="secondary">{t('hiring.suggestedTo', { to: app.pending_move.to })}</Badge>}
          </div>
        </div>
        {app.match && (
          <div className="shrink-0 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">{t('hiring.match')}</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{Math.round(app.match.score)}</p>
          </div>
        )}
      </div>

      {(p?.summary || p?.skills?.length) && (
        <section aria-label={t('hiring.rSumSummary')} className="space-y-2">
          {p?.summary && <p className="text-sm leading-relaxed text-foreground">{p.summary}</p>}
          {!!p?.skills?.length && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t('hiring.skills')}>
              {p.skills.slice(0, 16).map((s) => <li key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{s}</li>)}
            </ul>
          )}
          {!!p?.education?.length && (
            <p className="text-xs text-muted-foreground">{p.education.slice(0, 2).map((e) => [e.degree, e.field, e.institution].filter(Boolean).join(', ')).join(' · ')}</p>
          )}
        </section>
      )}

      {app.match && (app.match.reasons.length > 0 || app.match.missing_must.length > 0) && (
        <section aria-label={t('hiring.whyThisMatch')} className="text-sm">
          {app.match.reasons.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{app.match.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {app.match.missing_must.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-400">{t('hiring.missingValue2', { value: app.match.missing_must.join(', ') })}</p>}
        </section>
      )}

      {(app.results.length > 0 || app.scorecards.length > 0) && (
        <section aria-label={t('hiring.stageResults')} className="grid gap-3 sm:grid-cols-2">
          {app.results.map((r, i) => (
            <div key={`r${i}`} className="rounded-2xl border border-border/70 p-3">
              <p className="text-sm font-medium text-foreground">{r.stage_name}</p>
              <p className={cn('text-sm', OUTCOME(t)[r.outcome]?.cls)}>
                {OUTCOME(t)[r.outcome]?.label || r.outcome}{r.score != null && <span className="tabular-nums"> · {Math.round(r.score)}/100</span>}
              </p>
              {r.summary && <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>}
            </div>
          ))}
          {app.scorecards.map((s, i) => (
            <div key={`s${i}`} className="rounded-2xl border border-border/70 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><ClipboardList className="h-4 w-4 text-primary" aria-hidden />{s.stage_name}</p>
              <p className="text-sm text-muted-foreground">
                {s.count} {s.count === 1 ? t('hiring.scorecard') : t('hiring.scorecards')}{s.avg_rating != null && <>{' '}{t('hiring.avg')}{' '}<span className="tabular-nums">{s.avg_rating}</span>/5</>}
              </p>
              <p className="text-xs text-muted-foreground">
                {(['strong_yes', 'yes', 'no', 'strong_no'] as const).filter((k) => s.recommendations[k]).map((k) => `${s.recommendations[k]} ${k.replace('_', ' ')}`).join(', ')}
              </p>
            </div>
          ))}
        </section>
      )}

      <section aria-label={t('hiring.comments')} className="space-y-3 border-t border-border/70 pt-4">
        {app.comments.length > 0 && (
          <ul className="space-y-2">
            {app.comments.map((c) => (
              <li key={c.id} className="rounded-2xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{c.author_name}</span> · {formatDate(c.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={postComment} className="space-y-2">
          <label htmlFor={`c-${app.id}`} className="sr-only">{t('hiring.commentForTheHiringTeam')}</label>
          <Textarea id={`c-${app.id}`} value={comment} maxLength={4000} onChange={(e) => setComment(e.target.value)} placeholder={t('hiring.shareFeedbackWithTheHiringTeam')} rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="outline" size="sm" disabled={busy !== null || !comment.trim()}>
              {busy === 'comment' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1 h-4 w-4" />}{t('hiring.comment')}</Button>
            {app.can_review && (
              <>
                <span className="flex-1" />
                <Button type="button" variant="outline" className="min-h-11" disabled={busy !== null} onClick={() => void decide(false)}>
                  {busy === 'reject' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}{t('hiring.reject')}</Button>
                <Button type="button" className="min-h-11" disabled={busy !== null} onClick={() => void decide(true)}>
                  {busy === 'approve' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}{t('hiring.approve')}</Button>
              </>
            )}
          </div>
        </form>
      </section>
    </Panel>
  )
}

function ReviewInner() {
  const apiError = useApiError()
  const { t } = useT()
  const params = useParams<{ id: string }>()
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'review' | 'all'>('review')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ats/client/jobs/${encodeURIComponent(params.id)}${q}`, { credentials: 'include', cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) setError(apiError(json, t('hiring.couldNotLoadCandidates')))
      else { setData(json); setError(null) }
    } catch {
      setError(t('hiring.couldNotLoadCandidates'))
    }
  }, [params.id, q])

  useEffect(() => { void load() }, [load])

  const toReview = useMemo(() => (data?.applications || []).filter((a) => a.can_review), [data])
  useEffect(() => { if (data && toReview.length === 0) setFilter('all') }, [data, toReview.length])

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <EmptyState illustration="not-found" title={t('hiring.thisRoleIsntAvailable')} description={error} actionLabel={t('hiring.backToYourRoles')} actionHref={`/dashboard/hiring/client${q}`} />
      </div>
    )
  }
  if (!data) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loadingCandidates')} /></div>

  const list = filter === 'review' ? toReview : data.applications

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <Link href={`/dashboard/hiring/client${q}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('hiring.yourRoles')}</Link>
      <PageHeader
        title={data.job.title}
        description={[data.job.location, data.job.work_mode, `${data.job.openings} ${data.job.openings === 1 ? 'opening' : 'openings'}`].filter(Boolean).join(' · ')}
      />
      <div role="tablist" aria-label={t('hiring.filterCandidates')} className="inline-flex rounded-full border border-border/70 bg-muted/30 p-1">
        {([['review', `To review (${toReview.length})`], ['all', `All shared (${data.applications.length})`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
            className={cn('min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', filter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState illustration="resume" title={filter === 'review' ? t('hiring.nothingWaitingForYou') : t('hiring.noCandidatesSharedYet')} description={filter === 'review' ? t('hiring.youreAllCaughtUpNewShortlisted38d') : t('hiring.theHiringTeamWillShareCandidatesff7')} />
      ) : (
        <div className="space-y-4">{list.map((a) => <CandidateCard key={a.id} app={a} q={q} onChanged={load} />)}</div>
      )}
      {!data.contacts_visible && data.applications.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('hiring.contactDetailsAreKeptWithTheca7')}</p>
      )}
    </div>
  )
}

export default function ClientReviewPage() {
  const { t } = useT()
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loading')} /></div>}>
      <ReviewInner />
    </Suspense>
  )
}
