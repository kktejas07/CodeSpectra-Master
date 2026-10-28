'use client'

/**
 * Cohort page: overview + enrolment for everyone; the learner dashboard
 * (progress, sessions, assignments, certificate) for members; a manage tab
 * for the cohort's admins, mentors and TAs.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Award, CalendarRange, GraduationCap, MessagesSquare, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { call, ErrorNote, Skeleton, useErrorText } from '@/components/community/client-api'
import { CohortSessions } from '@/components/cohorts/cohort-sessions'
import { CohortAssignments } from '@/components/cohorts/cohort-assignments'
import { CohortManage } from '@/components/cohorts/cohort-manage'
import type { CohortView } from '@/components/cohorts/types'

export default function CohortPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const { id = '' } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const errText = useErrorText()
  const [v, setV] = useState<CohortView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    call<CohortView>(`/api/cohorts/${encodeURIComponent(id)}`).then(setV).catch((e) => setErr(errText(e)))
  }, [id, errText])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])

  const enrol = async () => {
    setBusy(true)
    try {
      const r = await call<{ enrolled: boolean; payment_required?: boolean; product_slug?: string | null }>(`/api/cohorts/${id}/enrol`, { body: {} })
      if (r.payment_required) {
        if (r.product_slug) router.push(`/marketplace/p/${encodeURIComponent(r.product_slug)}`)
        else toast({ type: 'info', title: t('community.paymentNeeded') })
        return
      }
      toast({ type: 'success', title: t('community.enrolled'), message: t('community.enrolledHint') })
      load()
    } catch (e) {
      toast({ type: 'error', title: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    if (!window.confirm(t('community.leaveConfirm'))) return
    try {
      await call(`/api/cohorts/${id}/enrol`, { method: 'DELETE' })
      load()
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title={t('community.cohortUnavailable')} description={err} actionLabel={t('community.backToCohorts')} actionHref="/dashboard/cohorts" />
  if (!v) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const c = v.cohort
  const member = !!v.my
  const learner = v.my?.role === 'learner'
  const priceLabel = c.access.price_minor != null ? fmt.currency(c.access.price_minor / 100, c.access.currency) : null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={c.title}
        icon={<GraduationCap />}
        description={<span className="flex flex-wrap items-center gap-2"><Badge variant="outline">{td(`community.cohortStatus_${c.status}`, c.status)}</Badge><span className="tabular-nums">{fmt.date(c.starts_at, { dateStyle: 'medium' })} – {fmt.date(c.ends_at, { dateStyle: 'medium' })}</span></span>}
        actions={<>
          {member && <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href={`/dashboard/community/new?category=cohort-${c.id.toLowerCase().replace(/_/g, '-')}`}><MessagesSquare className="h-4 w-4" aria-hidden />{t('community.askTheCohort')}</Link></Button>}
          {!member && <Button className="min-h-[44px] rounded-full" disabled={busy || c.enrolled_count >= c.capacity} onClick={enrol}>{c.enrolled_count >= c.capacity ? t('community.cohortFull') : c.access.free ? t('community.enrolFree') : priceLabel ? t('community.enrolPaid', { price: priceLabel }) : t('community.enrol')}</Button>}
          {learner && v.my?.status === 'active' && <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={leave}>{t('community.leaveCohort')}</Button>}
        </>}
      />

      {learner && v.progress && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('community.progress')} value={<span className="tabular-nums">{fmt.percent(v.progress.progress_pct / 100)}</span>} />
          <StatCard label={t('community.attendance')} value={<span className="tabular-nums">{fmt.percent(v.progress.attendance_pct / 100)}</span>} hint={t('community.sessionsAttended', { done: v.progress.sessions_attended, total: v.progress.sessions_total })} />
          <StatCard label={t('community.assignmentsGraded')} value={<span className="tabular-nums">{v.progress.assignments_graded} / {v.progress.assignments_total}</span>} />
          <StatCard label={t('community.averageScore')} value={<span className="tabular-nums">{fmt.percent(v.progress.assignment_pct / 100)}</span>} hint={t('community.passMark', { pct: c.completion.min_assignment_pct })} />
        </div>
      )}
      {v.my?.certificate_id && (
        <Panel className="flex flex-col gap-3 border-green-500/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-medium text-foreground"><Award className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden />{t('community.certificateEarned')}</p>
          <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/dashboard/passport">{t('community.viewInPassport')}</Link></Button>
        </Panel>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">{t('community.tabOverview')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('community.tabSessions')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('community.tabAssignments')}</TabsTrigger>
          {v.is_staff && <TabsTrigger value="manage">{t('community.tabManage')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Panel className="space-y-3 p-5 sm:p-6">
            {c.summary ? <p className="whitespace-pre-line text-foreground">{c.summary}</p> : <p className="text-muted-foreground">{t('community.noSummary')}</p>}
            {v.course && <p className="text-sm text-muted-foreground">{t('community.basedOnCourse')} <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/dashboard/courses/${encodeURIComponent(String(v.course.id))}`}>{String(v.course.title)}</Link></p>}
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" aria-hidden /><span className="tabular-nums">{t('community.seatsTaken', { taken: c.enrolled_count, capacity: c.capacity })}</span></p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="h-4 w-4" aria-hidden />{t('community.completionRule', { att: c.completion.min_attendance_pct, score: c.completion.min_assignment_pct })}</p>
          </Panel>
          <Panel className="space-y-3 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">{t('community.mentorsAndTas')}</h2>
            {v.staff.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {v.staff.map((s) => (
                  <li key={s.user_id} className="flex items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3">
                    <span className="min-w-0"><span className="block truncate font-medium text-foreground">{s.name}</span><span className="text-xs text-muted-foreground">{td(`community.role_${s.role}`, s.role)}</span></span>
                    {s.mentor_slug && <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/mentors/${encodeURIComponent(s.mentor_slug)}`}>{t('community.mentorProfile')}</Link>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t('community.noStaffYet')}</p>}
          </Panel>
          {learner && v.progress && !v.progress.eligible && v.progress.missing.length > 0 && (
            <Panel className="p-5 text-sm text-muted-foreground">{t('community.toFinish')} {v.progress.missing.map((m) => td(`community.missing_${m}`, m)).join(' · ')}</Panel>
          )}
        </TabsContent>
        <TabsContent value="sessions" className="mt-4"><CohortSessions view={v} onChange={load} /></TabsContent>
        <TabsContent value="assignments" className="mt-4"><CohortAssignments view={v} onChange={load} /></TabsContent>
        {v.is_staff && <TabsContent value="manage" className="mt-4"><CohortManage view={v} onChange={load} /></TabsContent>}
      </Tabs>
      <ErrorNote text={null} />
    </div>
  )
}
