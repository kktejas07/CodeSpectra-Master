'use client'

/**
 * One placement drive: status (open notifies eligible students once), edit,
 * applicants with their company-test result, application status, offers.
 * Server checks the caller is on the college's placement team.
 */
import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Briefcase } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { APPLICATION_STATUSES, type CollegeDoc, type DriveDoc, type OfferDoc } from '@/lib/campus/types'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { ConsoleContext, batchName, deptName, scopedUrl, type ConsoleCtx } from '@/components/campus/console-context'
import { DriveForm } from '@/components/campus/drive-form'
import { Field, StatusPill, ctcRange, errorOf, fieldClass, fmtDate, fmtDateTime, money } from '@/components/campus/shared'
import { useT } from '@/lib/i18n/client'

interface Applicant {
  application_id: string; student_id: string; name: string; email: string; roll_no: string | null
  department_id: string | null; batch_id: string | null; cgpa: number | null; status: string; applied_at: string
  test: { percent: number; passed: boolean; at: string } | null
}

export default function DrivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>}>
      <DriveInner id={id} />
    </Suspense>
  )
}

function DriveInner({ id }: { id: string }) {
  const { t } = useT()
  const gate = usePageGuard('user')
  const addToast = useToast()
  const collegeParam = useSearchParams().get('college')
  const url = useCallback((p: string) => scopedUrl(p, collegeParam), [collegeParam])
  const [college, setCollege] = useState<{ college: CollegeDoc; role: ConsoleCtx['role'] } | null>(null)
  const [drive, setDrive] = useState<DriveDoc | null>(null)
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [offers, setOffers] = useState<OfferDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [offerFor, setOfferFor] = useState<Applicant | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    Promise.all([
      fetch(url('/api/campus/college'), { credentials: 'include' }).then((r) => r.json()),
      fetch(url(`/api/campus/drives/${id}`), { credentials: 'include' }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(await errorOf(r))))),
      fetch(url('/api/campus/offers'), { credentials: 'include' }).then((r) => (r.ok ? r.json() : { items: [] })),
    ]).then(([c, d, o]) => {
      if (!live) return
      if (c.college) setCollege({ college: c.college, role: c.role })
      setDrive(d.drive); setApplicants(d.applicants || [])
      setOffers((o.items || []).filter((x: OfferDoc) => x.drive_id === id))
    }).catch((e) => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [gate.ready, id, url, reload])

  const ctx = useMemo<ConsoleCtx | null>(() => (college ? { college: college.college, role: college.role, url, reloadCollege: () => setReload((n) => n + 1) } : null), [college, url])
  const refresh = () => setReload((n) => n + 1)

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true)
    try {
      const r = await csrfFetch(url(`/api/campus/drives/${id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      addToast({ type: 'success', title: ok })
      setEditing(false)
      refresh()
    } finally { setBusy(false) }
  }

  const setAppStatus = async (a: Applicant, status: string) => {
    const r = await csrfFetch(url(`/api/campus/applications/${a.application_id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
    setApplicants((list) => list.map((x) => (x.application_id === a.application_id ? { ...x, status } : x)))
  }

  if (!gate.ready || (!drive && !error)) return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>
  if (error || !drive || !ctx) return <EmptyState illustration="not-found" title={t('career.driveNotFound')} description={error || t('career.itMayHaveBeenRemovedOr18b')} actionLabel={t('career.backToDrives')} actionHref="/dashboard/placement?tab=drives" />

  const back = `/dashboard/placement?tab=drives${collegeParam ? `&college=${encodeURIComponent(collegeParam)}` : ''}`
  return (
    <ConsoleContext.Provider value={ctx}>
      <div className="w-full space-y-6">
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden />{t('career.drives')}</Link>
        <PageHeader
          icon={<Briefcase aria-hidden />}
          title={drive.title}
          description={`${drive.company.name} · ${drive.role_title}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={drive.status} />
              {drive.status === 'draft' && <Button disabled={busy} onClick={() => patch({ status: 'open' }, 'Drive is open — eligible students are being notified')} className="min-h-11">{t('career.openToStudents')}</Button>}
              {drive.status === 'open' && <Button variant="outline" disabled={busy} onClick={() => patch({ status: 'closed' }, 'Applications closed')} className="min-h-11">{t('career.closeApplications')}</Button>}
              {drive.status === 'closed' && <Button variant="outline" disabled={busy} onClick={() => patch({ status: 'completed' }, 'Drive marked complete')} className="min-h-11">{t('career.markComplete')}</Button>}
              {!editing && drive.status !== 'completed' && <Button variant="ghost" onClick={() => setEditing(true)} className="min-h-11">{t('career.edit')}</Button>}
            </div>
          }
        />
        {editing ? (
          <Panel>
            <DriveForm initial={drive} busy={busy} submitLabel={t('career.saveChanges')} onSubmit={(body) => patch({ drive: body }, 'Drive updated')} />
            <Button variant="ghost" className="mt-2" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          </Panel>
        ) : (
          <Panel className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-muted-foreground">{t('career.applyBy')}</p><p className="text-foreground">{fmtDateTime(drive.schedule.apply_by)}</p></div>
            <div><p className="text-muted-foreground">{t('career.test')}</p><p className="text-foreground">{fmtDateTime(drive.schedule.test_at)}</p></div>
            <div><p className="text-muted-foreground">CTC</p><p className="tabular-nums text-foreground">{ctcRange(drive.ctc_minor_min, drive.ctc_minor_max, drive.currency) ?? '—'}</p></div>
            <div><p className="text-muted-foreground">{t('career.eligibility')}</p><p className="text-foreground">{[
              drive.eligibility.min_cgpa !== null ? `CGPA ≥ ${drive.eligibility.min_cgpa}` : null,
              drive.eligibility.max_backlogs !== null ? `≤ ${drive.eligibility.max_backlogs} backlogs` : null,
              drive.eligibility.department_ids.length ? drive.eligibility.department_ids.map((d) => ctx.college.departments.find((x) => x.id === d)?.code ?? '?').join(', ') : 'All departments',
              drive.eligibility.graduation_years.length ? drive.eligibility.graduation_years.join(', ') : null,
            ].filter(Boolean).join(' · ')}</p></div>
          </Panel>
        )}

        <Section title={t('career.applicants')} description={t('career.countApplied', { count: applicants.length })}>
          {applicants.length === 0 ? (
            <EmptyState compact illustration="inbox" title={t('career.noApplicationsYet')} description={drive.status === 'draft' ? t('career.openTheDriveSoEligibleStudents482') : t('career.eligibleStudentsWereNotifiedApplications651')} />
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('career.student')}</th><th className="px-4 py-3 font-medium">{t('career.departmentBatch')}</th><th className="px-4 py-3 font-medium">CGPA</th>
                  <th className="px-4 py-3 font-medium">{t('career.test')}</th><th className="px-4 py-3 font-medium">{t('career.status')}</th><th className="px-4 py-3 font-medium"><span className="sr-only">{t('career.offer')}</span></th>
                </tr></thead>
                <tbody>
                  {applicants.map((a) => (
                    <tr key={a.application_id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3"><p className="font-medium text-foreground">{a.name}</p><p className="text-xs text-muted-foreground">{a.roll_no || a.email}</p></td>
                      <td className="px-4 py-3 text-muted-foreground">{deptName(ctx.college, a.department_id)} · {batchName(ctx.college, a.batch_id)}</td>
                      <td className="px-4 py-3 tabular-nums">{a.cgpa ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{a.test ? <span className={a.test.passed ? 'text-green-700 dark:text-green-400' : 'text-foreground'}>{a.test.percent}%{a.test.passed ? t('career.passed') : ''}</span> : drive.process.mode === 'company_test' ? <span className="text-muted-foreground">{t('career.notTaken')}</span> : '—'}</td>
                      <td className="px-4 py-3">
                        {a.status === 'withdrawn' ? <StatusPill status="withdrawn" /> : (
                          <select aria-label={t('career.statusForName', { name: a.name })} className={`${fieldClass} h-9 w-36`} value={a.status} onChange={(e) => setAppStatus(a, e.target.value)}>
                            {APPLICATION_STATUSES.filter((s) => s !== 'withdrawn').map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{a.status !== 'withdrawn' && <Button size="sm" variant="outline" onClick={() => setOfferFor(a)}>{t('career.recordOffer')}</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>

        {offerFor && <OfferForm drive={drive} a={offerFor} onClose={(changed) => { setOfferFor(null); if (changed) refresh() }} />}

        <Section title={t('career.offersFromThisDrive')}>
          {offers.length === 0 ? <p className="text-sm text-muted-foreground">{t('career.noOffersRecordedYet')}</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {offers.map((o) => (
                <Panel key={o.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{(o as OfferDoc & { student_name?: string }).student_name ?? t('career.student')}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">{t('career.amountJoiningDate', { amount: money(o.ctc_minor, o.currency), date: fmtDate(o.joining_date) })}</p>
                  </div>
                  <select aria-label={t('career.offerStatus')} className={`${fieldClass} h-9 w-32`} value={o.status} onChange={async (e) => {
                    const r = await csrfFetch(url(`/api/campus/offers/${o.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) })
                    if (!r.ok) addToast({ type: 'error', title: await errorOf(r) })
                    refresh()
                  }}>
                    {['offered', 'accepted', 'declined', 'revoked'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Panel>
              ))}
            </div>
          )}
        </Section>
      </div>
    </ConsoleContext.Provider>
  )
}

function OfferForm({ drive, a, onClose }: { drive: DriveDoc; a: Applicant; onClose: (changed: boolean) => void }) {
  const { t } = useT()
  const addToast = useToast()
  const collegeParam = useSearchParams().get('college')
  const [ctc, setCtc] = useState(drive.ctc_minor_min !== null ? String(drive.ctc_minor_min / 100) : '')
  const [joining, setJoining] = useState('')
  const [role, setRole] = useState(drive.role_title)
  const [busy, setBusy] = useState(false)
  return (
    <Panel role="dialog" aria-label={t('career.recordOfferForName', { name: a.name })}>
      <h3 className="text-base font-semibold text-foreground">{t('career.offerForName', { name: a.name })}</h3>
      <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          const body = { student_id: a.student_id, drive_id: drive.id, company_name: drive.company.name, role_title: role, ctc_minor: Math.round(Number(ctc) * 100), currency: drive.currency, joining_date: joining || null }
          const r = await csrfFetch(scopedUrl('/api/campus/offers', collegeParam), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
          addToast({ type: 'success', title: t('career.offerRecordedTheStudentIsNotified') })
          onClose(true)
        } finally { setBusy(false) }
      }}>
        <Field id="o-role" label={t('career.role')}><Input id="o-role" value={role} onChange={(e) => setRole(e.target.value)} required maxLength={160} /></Field>
        <Field id="o-ctc" label={t('career.ctcPerYearCurrency', { currency: drive.currency })}><Input id="o-ctc" type="number" min={0} step="1" value={ctc} onChange={(e) => setCtc(e.target.value)} required /></Field>
        <Field id="o-join" label={t('career.joiningDate')}><Input id="o-join" type="date" value={joining} onChange={(e) => setJoining(e.target.value)} /></Field>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" disabled={busy || ctc === ''} className="min-h-11">{t('career.saveOffer')}</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)} className="min-h-11">{t('common.cancel')}</Button>
        </div>
      </form>
    </Panel>
  )
}
