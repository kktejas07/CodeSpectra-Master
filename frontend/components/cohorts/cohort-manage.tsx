'use client'

/** Cohort staff tools: settings, mentors / TAs, live sessions + attendance, assignments, certificates. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, CalendarPlus, ClipboardCheck, Plus, Trash2, UserPlus } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { call, ErrorNote, Field, areaClass, fieldClass, useErrorText } from '@/components/community/client-api'
import { CohortForm } from './cohort-form'
import type { CohortView, LearnerAssignment } from './types'
import type { AssignmentDoc, CohortMemberDoc } from '@/lib/cohorts/types'

const toLocal = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function StaffPanel({ view, onChange }: { view: CohortView; onChange: () => void }) {
  const { t, td } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [who, setWho] = useState('')
  const [role, setRole] = useState<'mentor' | 'ta'>('ta')
  const [members, setMembers] = useState<CohortMemberDoc[]>([])
  const load = useCallback(() => { call<{ members: CohortMemberDoc[] }>(`/api/cohorts/${view.cohort.id}/staff`).then((r) => setMembers(r.members)).catch(() => setMembers([])) }, [view.cohort.id])
  useEffect(load, [load])
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = who.trim()
    const slug = v.includes('/mentors/') ? v.split('/mentors/')[1].split(/[?#/]/)[0] : null
    try {
      await call(`/api/cohorts/${view.cohort.id}/staff`, { body: slug ? { mentor_slug: slug, role } : { email: v, role } })
      setWho('')
      load()
      onChange()
    } catch (e2) { toast({ type: 'error', title: errText(e2) }) }
  }
  const remove = async (uid: string) => {
    try { await call(`/api/cohorts/${view.cohort.id}/staff?user_id=${encodeURIComponent(uid)}`, { method: 'DELETE' }); load(); onChange() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  const learners = members.filter((m) => m.role === 'learner')
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('community.peopleTitle')}</h2>
      {view.can_manage && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <Field id="st-who" label={t('community.staffWho')} hint={t('community.staffWhoHint')} className="min-w-[240px] flex-1"><input id="st-who" className={fieldClass} value={who} onChange={(e) => setWho(e.target.value)} required /></Field>
          <Field id="st-role" label={t('community.staffRole')}>
            <select id="st-role" className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as 'mentor' | 'ta')}><option value="ta">{t('community.role_ta')}</option><option value="mentor">{t('community.role_mentor')}</option></select>
          </Field>
          <Button type="submit" className="min-h-[44px] rounded-full"><UserPlus className="h-4 w-4" aria-hidden />{t('community.add')}</Button>
        </form>
      )}
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {members.filter((m) => m.role !== 'learner').map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{m.name} <span className="text-muted-foreground">· {td(`community.role_${m.role}`, m.role)}</span></span>
            {view.can_manage && <Button variant="ghost" size="icon-lg" aria-label={t('community.removePerson', { name: m.name })} onClick={() => remove(m.user_id)}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{t('community.learnerCount', { count: learners.length })}</p>
    </Panel>
  )
}

function AttendanceSheet({ cohortId, sessionId }: { cohortId: string; sessionId: string }) {
  const { t, td } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [rows, setRows] = useState<{ user_id: string; name: string; status: string | null }[] | null>(null)
  useEffect(() => { call<{ rows: { user_id: string; name: string; status: string | null }[] }>(`/api/cohorts/${cohortId}/sessions/${sessionId}/attendance`).then((r) => setRows(r.rows)).catch((e) => toast({ type: 'error', title: errText(e) })) }, [cohortId, sessionId, toast, errText])
  const save = async () => {
    try {
      await call(`/api/cohorts/${cohortId}/sessions/${sessionId}/attendance`, { method: 'PUT', body: { entries: (rows || []).filter((r) => r.status).map((r) => ({ user_id: r.user_id, status: r.status })) } })
      toast({ type: 'success', title: t('community.saved') })
    } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  if (!rows) return <p className="text-sm text-muted-foreground">{t('community.loading')}</p>
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t('community.noLearnersYet')}</p>
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-foreground">{r.name}</span>
            <select aria-label={t('community.attendanceFor', { name: r.name })} className="h-11 rounded-xl border border-border bg-background px-2 text-sm text-foreground" value={r.status || ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, status: e.target.value || null } : x)))}>
              <option value="">{t('community.notMarked')}</option>
              {(['present', 'late', 'absent', 'excused'] as const).map((s) => <option key={s} value={s}>{td(`community.att_${s}`, s)}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <Button className="min-h-[44px] rounded-full" onClick={save}>{t('community.saveAttendance')}</Button>
    </div>
  )
}

function SessionsPanel({ view, onChange }: { view: CohortView; onChange: () => void }) {
  const { t, td, fmt } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [f, setF] = useState({ title: '', starts_at: '', duration_min: '60', provider: view.cohort.schedule.provider as string, join_url: '' })
  const [sheet, setSheet] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = view.cohort.id
  const generate = async () => {
    setBusy(true)
    try {
      const r = await call<{ created: number }>(`/api/cohorts/${id}/sessions`, { body: { generate: true } })
      toast({ type: 'success', title: t('community.sessionsCreated', { count: r.created }) })
      onChange()
    } catch (e) { toast({ type: 'error', title: errText(e) }) } finally { setBusy(false) }
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await call(`/api/cohorts/${id}/sessions`, { body: { ...f, starts_at: new Date(f.starts_at).toISOString(), duration_min: Number(f.duration_min) } })
      setF({ ...f, title: '', starts_at: '' })
      onChange()
    } catch (e2) { toast({ type: 'error', title: errText(e2) }) } finally { setBusy(false) }
  }
  const patch = async (sid: string, body: Record<string, unknown>) => {
    try { await call(`/api/cohorts/${id}/sessions/${sid}`, { method: 'PATCH', body }); onChange() } catch (e) { toast({ type: 'error', title: errText(e) }) }
  }
  return (
    <Panel className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{t('community.tabSessions')}</h2>
        <Button variant="outline" className="min-h-[44px] rounded-full" disabled={busy || !view.cohort.schedule.weekly.length} onClick={generate}><CalendarPlus className="h-4 w-4" aria-hidden />{t('community.createWeekly')}</Button>
      </div>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="s-title" label={t('community.fieldTitle')}><input id="s-title" className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field id="s-start" label={t('community.fieldStarts')}><input id="s-start" type="datetime-local" className={fieldClass} value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} required /></Field>
        <Field id="s-min" label={t('community.minutes')}><input id="s-min" type="number" min={15} max={240} className={fieldClass} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></Field>
        <Field id="s-prov" label={t('community.fieldProvider')}>
          <select id="s-prov" className={fieldClass} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{(['livekit', 'zoom', 'google_meet', 'teams', 'manual'] as const).map((p) => <option key={p} value={p}>{td(`community.provider_${p}`, p)}</option>)}</select>
        </Field>
        {f.provider === 'manual' && <Field id="s-url" label={t('community.fieldMeetingLink')} className="sm:col-span-2"><input id="s-url" type="url" className={fieldClass} value={f.join_url} onChange={(e) => setF({ ...f, join_url: e.target.value })} required /></Field>}
        <div className="flex items-end"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full"><Plus className="h-4 w-4" aria-hidden />{t('community.addSession')}</Button></div>
      </form>
      <ul className="space-y-2">
        {view.sessions.map((s) => (
          <li key={s.id} className="space-y-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground"><span className="font-medium">{s.title}</span> · <span className="tabular-nums">{fmt.dateTime(s.starts_at, view.cohort.timezone)}</span> {s.status === 'cancelled' && <Badge variant="danger">{t('community.cancelled')}</Badge>}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-[44px] rounded-full" aria-expanded={sheet === s.id} onClick={() => setSheet(sheet === s.id ? null : s.id)}><ClipboardCheck className="h-4 w-4" aria-hidden />{t('community.attendance')}</Button>
                <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={() => patch(s.id, { status: s.status === 'cancelled' ? 'scheduled' : 'cancelled' })}>{s.status === 'cancelled' ? t('community.restore') : t('community.cancelSession')}</Button>
                <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={() => { const u = window.prompt(t('community.recordingPrompt'), s.recording_url || ''); if (u !== null) void patch(s.id, { recording_url: u }) }}>{t('community.recordingLink')}</Button>
              </div>
            </div>
            {sheet === s.id && <AttendanceSheet cohortId={id} sessionId={s.id} />}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

type RubricRow = { id?: string; label: string; points: string; description: string }

function AssignmentEditor({ cohortId, initial, onSaved }: { cohortId: string; initial?: AssignmentDoc; onSaved: () => void }) {
  const { t, td } = useT()
  const errText = useErrorText()
  const [f, setF] = useState(() => ({
    title: initial?.title ?? '', instructions: initial?.instructions ?? '', kind: (initial?.kind ?? 'code') as 'code' | 'file',
    due_at: initial ? toLocal(initial.due_at) : '', late_hours: String(initial?.late_hours ?? 0), late_penalty_pct: String(initial?.late_penalty_pct ?? 10),
    language: initial?.language ?? 'python', starter_code: initial?.starter_code ?? '', tests: initial ? JSON.stringify(initial.tests, null, 2) : '[\n  { "input": "1 2", "output": "3" },\n  { "input": "5 7", "output": "12", "hidden": true }\n]',
    autograde_weight_pct: String(initial?.autograde_weight_pct ?? 70), file_types: initial?.file_types ?? ['pdf', 'zip'],
    rubric: (initial?.rubric ?? []).map((r) => ({ id: r.id, label: r.label, points: String(r.points), description: r.description })) as RubricRow[],
    published: initial?.published ?? false,
  }))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    let tests: unknown = []
    if (f.kind === 'code') {
      try { tests = JSON.parse(f.tests || '[]') } catch { setErr(t('community.testsJsonInvalid')); return }
    }
    setBusy(true)
    const body = {
      title: f.title, instructions: f.instructions, kind: f.kind, due_at: f.due_at ? new Date(f.due_at).toISOString() : '',
      late_hours: Number(f.late_hours), late_penalty_pct: Number(f.late_penalty_pct), language: f.kind === 'code' ? f.language : null,
      starter_code: f.starter_code, tests, autograde_weight_pct: Number(f.autograde_weight_pct), file_types: f.file_types,
      rubric: f.rubric.filter((r) => r.label.trim()).map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label, points: Number(r.points), description: r.description })),
      published: f.published,
    }
    try {
      await call(initial ? `/api/cohorts/${cohortId}/assignments/${initial.id}` : `/api/cohorts/${cohortId}/assignments`, { method: initial ? 'PATCH' : 'POST', body })
      onSaved()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <Field id="a-title" label={t('community.fieldTitle')} className="sm:col-span-2"><input id="a-title" className={fieldClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
      <Field id="a-ins" label={t('community.instructions')} hint={t('community.markdownHint')} className="sm:col-span-2"><textarea id="a-ins" className={areaClass} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
      <Field id="a-kind" label={t('community.kind')}>
        <select id="a-kind" className={fieldClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'code' | 'file' })}><option value="code">{t('community.kind_code')}</option><option value="file">{t('community.kind_file')}</option></select>
      </Field>
      <Field id="a-due" label={t('community.due')}><input id="a-due" type="datetime-local" className={fieldClass} value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} required /></Field>
      <Field id="a-lh" label={t('community.lateHours')}><input id="a-lh" type="number" min={0} max={336} className={fieldClass} value={f.late_hours} onChange={(e) => setF({ ...f, late_hours: e.target.value })} /></Field>
      <Field id="a-lp" label={t('community.latePenalty')}><input id="a-lp" type="number" min={0} max={100} className={fieldClass} value={f.late_penalty_pct} onChange={(e) => setF({ ...f, late_penalty_pct: e.target.value })} /></Field>
      {f.kind === 'code' ? (
        <>
          <Field id="a-lang" label={t('community.language')}><input id="a-lang" className={fieldClass} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} /></Field>
          <Field id="a-w" label={t('community.autogradeWeight')} hint={t('community.autogradeWeightHint')}><input id="a-w" type="number" min={0} max={100} className={fieldClass} value={f.autograde_weight_pct} onChange={(e) => setF({ ...f, autograde_weight_pct: e.target.value })} /></Field>
          <Field id="a-starter" label={t('community.starterCode')} className="sm:col-span-2"><textarea id="a-starter" spellCheck={false} className={`${areaClass} font-mono`} value={f.starter_code} onChange={(e) => setF({ ...f, starter_code: e.target.value })} /></Field>
          <Field id="a-tests" label={t('community.testCases')} hint={t('community.testCasesHint')} className="sm:col-span-2"><textarea id="a-tests" spellCheck={false} className={`${areaClass} font-mono`} value={f.tests} onChange={(e) => setF({ ...f, tests: e.target.value })} /></Field>
        </>
      ) : (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-foreground">{t('community.allowedFiles')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['pdf', 'zip', 'docx', 'pptx', 'xlsx', 'image', 'text'] as const).map((k) => (
              <label key={k} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-sm text-foreground">
                <input type="checkbox" checked={f.file_types.includes(k)} onChange={(e) => setF({ ...f, file_types: e.target.checked ? [...f.file_types, k] : f.file_types.filter((x) => x !== k) })} />
                {td(`community.fileType_${k}`, k)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium text-foreground">{t('community.rubric')}</legend>
        {f.rubric.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field id={`r-l-${i}`} label={t('community.rubricLine')} className="min-w-[180px] flex-1"><input id={`r-l-${i}`} className={fieldClass} value={r.label} onChange={(e) => setF({ ...f, rubric: f.rubric.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
            <Field id={`r-p-${i}`} label={t('community.pointsLabel')}><input id={`r-p-${i}`} type="number" min={1} max={100} className={`${fieldClass} w-24`} value={r.points} onChange={(e) => setF({ ...f, rubric: f.rubric.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)) })} /></Field>
            <Field id={`r-d-${i}`} label={t('community.rubricDescription')} className="min-w-[180px] flex-1"><input id={`r-d-${i}`} className={fieldClass} value={r.description} onChange={(e) => setF({ ...f, rubric: f.rubric.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} /></Field>
            <Button type="button" variant="ghost" size="icon-lg" aria-label={t('community.removeRubricLine')} onClick={() => setF({ ...f, rubric: f.rubric.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={() => setF({ ...f, rubric: [...f.rubric, { label: '', points: '10', description: '' }] })}><Plus className="h-4 w-4" aria-hidden />{t('community.addRubricLine')}</Button>
      </fieldset>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground sm:col-span-2"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />{t('community.publishToLearners')}</label>
      <div className="sm:col-span-2"><ErrorNote text={err} /></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? t('community.saving') : initial ? t('community.saveChanges') : t('community.createAssignment')}</Button></div>
    </form>
  )
}

export function CohortManage({ view, onChange }: { view: CohortView; onChange: () => void }) {
  const { t, fmt } = useT()
  const toast = useToast()
  const errText = useErrorText()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const issue = async () => {
    setBusy(true)
    try {
      const r = await call<{ issued: number; checked: number }>(`/api/cohorts/${view.cohort.id}/certificates`, { body: {} })
      toast({ type: 'success', title: t('community.certsIssued', { issued: r.issued, checked: r.checked }) })
      onChange()
    } catch (e) { toast({ type: 'error', title: errText(e) }) } finally { setBusy(false) }
  }
  const list = view.assignments as LearnerAssignment[]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-[44px] rounded-full"><Link href="/dashboard/cohorts/grading"><ClipboardCheck className="h-4 w-4" aria-hidden />{t('community.gradingQueue')}</Link></Button>
        <Button variant="outline" className="min-h-[44px] rounded-full" disabled={busy} onClick={issue}><Award className="h-4 w-4" aria-hidden />{t('community.issueCertificates')}</Button>
      </div>
      <StaffPanel view={view} onChange={onChange} />
      <SessionsPanel view={view} onChange={onChange} />
      <Panel className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t('community.tabAssignments')}</h2>
          <Button variant="outline" className="min-h-[44px] rounded-full" onClick={() => setEditing(editing === 'new' ? null : 'new')}><Plus className="h-4 w-4" aria-hidden />{t('community.newAssignment')}</Button>
        </div>
        {editing === 'new' && <AssignmentEditor cohortId={view.cohort.id} onSaved={() => { setEditing(null); onChange() }} />}
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="space-y-3 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-foreground"><span className="font-medium">{a.title}</span> · <span className="tabular-nums">{fmt.dateTime(a.due_at, view.cohort.timezone)}</span> {!a.published && <Badge variant="warning">{t('community.draft')}</Badge>}</p>
                <Button variant="ghost" className="min-h-[44px] rounded-full" onClick={() => setEditing(editing === a.id ? null : a.id)}>{editing === a.id ? t('community.close') : t('community.edit')}</Button>
              </div>
              {editing === a.id && <AssignmentEditor cohortId={view.cohort.id} initial={a as unknown as AssignmentDoc} onSaved={() => { setEditing(null); onChange() }} />}
            </li>
          ))}
        </ul>
      </Panel>
      {view.can_manage && (
        <Panel className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">{t('community.cohortSettings')}</h2>
          <CohortForm initial={view.cohort} onSaved={() => { toast({ type: 'success', title: t('community.saved') }); onChange() }} />
        </Panel>
      )}
    </div>
  )
}
