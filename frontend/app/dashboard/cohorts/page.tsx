'use client'

/** Cohort courses: the learner's cohorts and the ones open to join; admins create new cohorts. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarRange, ClipboardCheck, Plus, Users } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { call, ErrorNote, Skeleton, useErrorText } from '@/components/community/client-api'
import type { CohortDoc } from '@/lib/cohorts/types'

type Row = Omit<CohortDoc, 'created_by'> & { my_role: string | null; my_status: string | null; can_manage: boolean }

export default function CohortsPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const errText = useErrorText()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    call<{ cohorts: Row[] }>('/api/cohorts').then((r) => setRows(r.cohorts)).catch((e) => setErr(errText(e)))
  }, [gate.ready, errText])

  if (!gate.ready) return null
  const role = gate.user?.role
  const isAdmin = role === 'superadmin' || role === 'tenant_admin'
  const mine = (rows || []).filter((r) => r.my_role)
  const staffing = mine.some((r) => r.my_role !== 'learner') || isAdmin
  const open = (rows || []).filter((r) => !r.my_role && (r.status === 'open' || r.status === 'running'))
  const managed = (rows || []).filter((r) => r.can_manage && !r.my_role)

  const card = (c: Row) => (
    <Link key={c.id} href={`/dashboard/cohorts/${c.id}`} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Panel interactive className="h-full space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={c.status === 'running' ? 'success' : c.status === 'open' ? 'info' : 'outline'}>{td(`community.cohortStatus_${c.status}`, c.status)}</Badge>
          {c.my_role && <Badge variant="secondary">{td(`community.role_${c.my_role}`, c.my_role)}</Badge>}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{c.summary}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="h-4 w-4" aria-hidden /><span className="tabular-nums">{fmt.date(c.starts_at, { dateStyle: 'medium' })} – {fmt.date(c.ends_at, { dateStyle: 'medium' })}</span></p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" aria-hidden /><span className="tabular-nums">{t('community.seatsTaken', { taken: c.enrolled_count, capacity: c.capacity })}</span></p>
      </Panel>
    </Link>
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        title={t('community.cohortsTitle')}
        description={t('community.cohortsLead')}
        icon={<Users />}
        actions={<>
          {staffing && <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/dashboard/cohorts/grading"><ClipboardCheck className="h-4 w-4" aria-hidden />{t('community.gradingQueue')}</Link></Button>}
          {isAdmin && <Button asChild className="min-h-[44px] rounded-full"><Link href="/dashboard/cohorts/new"><Plus className="h-4 w-4" aria-hidden />{t('community.newCohort')}</Link></Button>}
        </>}
      />
      <ErrorNote text={err} />
      {!rows && !err && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton /><Skeleton /><Skeleton /></div>}
      {rows && (
        <>
          <Section title={t('community.myCohorts')}>
            {mine.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</div> : <EmptyState compact title={t('community.noMyCohorts')} description={t('community.noMyCohortsHint')} />}
          </Section>
          <Section title={t('community.openCohorts')}>
            {open.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{open.map(card)}</div> : <EmptyState compact title={t('community.noOpenCohorts')} description={t('community.noOpenCohortsHint')} />}
          </Section>
          {managed.length > 0 && (
            <Section title={t('community.managedCohorts')}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{managed.map(card)}</div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}
