'use client'

/** Students: filters, bulk CSV invite (preview → import), verify, resend invite, edit officer fields. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, Search, Upload } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { validateStudentCsv } from '@/lib/campus/csv'
import type { StudentDoc } from '@/lib/campus/types'
import { Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { batchName, deptName, useConsole } from './console-context'
import { Field, StatusPill, errorOf, fieldClass } from './shared'
import { useT } from '@/lib/i18n/client'

const SAMPLE = 'name,email,roll_no,department,batch,cgpa,backlogs\nAsha Rao,asha@college.edu,21CS001,CSE,2027,8.4,0\n'

export function PlacementStudents() {
  const { t: tr } = useT()
  const { url, college } = useConsole()
  const addToast = useToast()
  const [rows, setRows] = useState<StudentDoc[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [batch, setBatch] = useState('')
  const [status, setStatus] = useState('')
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState<StudentDoc | null>(null)

  useEffect(() => {
    let live = true
    const p = new URLSearchParams({ page: String(page) })
    if (q.trim()) p.set('q', q.trim())
    if (dept) p.set('department', dept)
    if (batch) p.set('batch', batch)
    if (status) p.set('status', status)
    const t = setTimeout(() => {
      fetch(url(`/api/campus/students?${p}`), { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => { if (live) { setRows(d.items || []); setTotal(d.total || 0) } })
        .catch(() => { if (live) { setRows([]); addToast({ type: 'error', title: tr('career.couldntLoadStudents') }) } })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [url, page, q, dept, batch, status, reload, addToast])

  const act = async (s: StudentDoc, kind: 'invite' | 'verify') => {
    const r = kind === 'invite'
      ? await csrfFetch(url(`/api/campus/students/${s.id}`), { method: 'POST' })
      : await csrfFetch(url(`/api/campus/students/${s.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verify: true }) })
    if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
    addToast({ type: 'success', title: kind === 'invite' ? tr('career.inviteSentToEmail', { email: s.email }) : tr('career.nameIsVerified', { name: s.name }) })
    setReload((n) => n + 1)
  }

  return (
    <div className="space-y-6">
      <BulkImport onDone={() => { setPage(1); setReload((n) => n + 1) }} />
      <Section title={tr('career.students')} description={tr('career.totalOnRecord', { total })}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label={tr('career.searchStudents')} placeholder={tr('career.nameEmailOrRollNumber')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="pl-9" />
          </div>
          <select aria-label={tr('career.department')} className={fieldClass} value={dept} onChange={(e) => { setDept(e.target.value); setPage(1) }}>
            <option value="">{tr('career.allDepartments')}</option>
            {college.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label={tr('career.batch')} className={fieldClass} value={batch} onChange={(e) => { setBatch(e.target.value); setPage(1) }}>
            <option value="">{tr('career.allBatches')}</option>
            {college.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select aria-label={tr('career.status')} className={fieldClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">{tr('career.anyStatus')}</option>
            <option value="invited">{tr('career.invited')}</option>
            <option value="pending">{tr('career.needsVerification')}</option>
            <option value="verified">{tr('career.verified')}</option>
          </select>
        </div>
        {rows === null ? <SkeletonList count={5} /> : rows.length === 0 ? (
          <EmptyState compact illustration="team" title={tr('career.noStudentsMatch')} description={tr('career.uploadACsvAboveToInvitee90')} />
        ) : (
          <Panel className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{tr('career.student')}</th><th className="px-4 py-3 font-medium">{tr('career.rollNo')}</th><th className="px-4 py-3 font-medium">{tr('career.departmentBatch')}</th>
                <th className="px-4 py-3 font-medium">CGPA</th><th className="px-4 py-3 font-medium">{tr('career.status')}</th><th className="px-4 py-3 font-medium"><span className="sr-only">{tr('career.actions')}</span></th>
              </tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3"><p className="font-medium text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.email}</p></td>
                    <td className="px-4 py-3 font-mono text-xs">{s.roll_no || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deptName(college, s.department_id)} · {batchName(college, s.batch_id)}</td>
                    <td className="px-4 py-3 tabular-nums">{s.cgpa ?? '—'}{s.backlogs ? <span className="ml-1 text-xs text-muted-foreground">{tr('career.backlogsCountParen', { count: s.backlogs })}</span> : null}</td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {!s.user_id && <Button size="sm" variant="ghost" onClick={() => act(s, 'invite')} aria-label={tr('career.resendInviteToName', { name: s.name })}><Mail className="h-4 w-4" aria-hidden /></Button>}
                        {s.user_id && s.status !== 'verified' && <Button size="sm" variant="outline" onClick={() => act(s, 'verify')}>{tr('career.verify')}</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>{tr('career.edit')}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
        {total > 50 && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tr('common.previous')}</Button>
            <span className="text-sm tabular-nums text-muted-foreground">{tr('career.pagePageOfValue', { page, value: Math.ceil(total / 50) })}</span>
            <Button size="sm" variant="outline" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>{tr('common.next')}</Button>
          </div>
        )}
      </Section>
      {editing && <EditStudent s={editing} onClose={(changed) => { setEditing(null); if (changed) setReload((n) => n + 1) }} />}
    </div>
  )
}

function BulkImport({ onDone }: { onDone: () => void }) {
  const { t: tr } = useT()
  const { url, college } = useConsole()
  const addToast = useToast()
  const [text, setText] = useState('')
  const [sendInvites, setSendInvites] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ issues: { line: number; message: string }[]; valid: number; total: number } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const preview = useCallback((t: string) => {
    setText(t)
    if (!t.trim()) { setResult(null); return }
    const r = validateStudentCsv(t, college)
    setResult({ issues: r.issues, valid: r.rows.length, total: r.total })
  }, [college])

  const upload = async () => {
    setBusy(true)
    try {
      const r = await csrfFetch(url('/api/campus/students'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, send_invites: sendInvites }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 422) { setResult({ issues: d.issues || [], valid: d.valid || 0, total: d.total || 0 }); return }
      if (!r.ok) { addToast({ type: 'error', title: d.error || tr('career.importFailed') }); return }
      addToast({ type: 'success', title: tr('career.createdAddedUpdatedUpdatedValue', { created: d.created, updated: d.updated, value: d.invited ? `, ${d.invited} invites sending` : '' }) })
      if (d.skipped_invites) addToast({ type: 'warning', title: tr('career.skippedInvitesInvitesWereHeldBack46a', { skipped_invites: d.skipped_invites }) })
      setText(''); setResult(null)
      if (file.current) file.current.value = ''
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{tr('career.inviteStudents')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr('career.uploadACsvWithNameEmailb28')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => preview(SAMPLE)}>{tr('career.useTheSample')}</Button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Field id="csv" label="CSV">
          <textarea id="csv" className="min-h-36 w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" value={text} onChange={(e) => preview(e.target.value)} spellCheck={false} />
        </Field>
        <div className="space-y-4">
          <Field id="csvfile" label={tr('career.orChooseAFile')} hint={tr('career.upTo5000Students2aa4')}>
            <input
              ref={file} id="csvfile" type="file" accept=".csv,text/csv"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
              onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 2_000_000) { addToast({ type: 'error', title: tr('career.thatFileIsLargerThan25de') }); return } preview(await f.text()) }}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />{tr('career.emailAnInviteLinkToStudentsee7')}</label>
          <Button onClick={upload} disabled={busy || !result || result.issues.length > 0 || result.valid === 0} className="min-h-11 w-full"><Upload className="mr-2 h-4 w-4" aria-hidden />{tr('career.import')}{' '}{result?.valid ? tr('career.validStudents', { valid: result.valid }) : ''}</Button>
        </div>
      </div>
      {result && result.issues.length > 0 && (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium text-destructive">{tr('career.fixRowsBeforeImporting', { count: result.issues.length })}</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-foreground">
            {result.issues.slice(0, 50).map((i) => <li key={`${i.line}-${i.message}`}>{tr('career.lineLineMessage', { line: i.line, message: i.message })}</li>)}
          </ul>
        </div>
      )}
      {result && result.issues.length === 0 && result.valid > 0 && <p className="mt-3 text-sm text-muted-foreground" role="status">{tr('career.validStudentsReadyToImport', { valid: result.valid })}</p>}
    </Panel>
  )
}

function EditStudent({ s, onClose }: { s: StudentDoc; onClose: (changed: boolean) => void }) {
  const { t } = useT()
  const { url, college } = useConsole()
  const addToast = useToast()
  const [form, setForm] = useState({ name: s.name, roll_no: s.roll_no ?? '', department_id: s.department_id ?? '', batch_id: s.batch_id ?? '', cgpa: s.cgpa === null ? '' : String(s.cgpa), backlogs: String(s.backlogs) })
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = {
        name: form.name, roll_no: form.roll_no || null, department_id: form.department_id || null, batch_id: form.batch_id || null,
        cgpa: form.cgpa === '' ? null : Number(form.cgpa), backlogs: Number(form.backlogs) || 0,
      }
      const r = await csrfFetch(url(`/api/campus/students/${s.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      addToast({ type: 'success', title: t('common.saved') })
      onClose(true)
    } finally { setBusy(false) }
  }
  return (
    <Panel role="dialog" aria-label={t('career.editName', { name: s.name })}>
      <h3 className="text-base font-semibold text-foreground">{t('career.editName', { name: s.name })}</h3>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field id="e-name" label={t('career.name')}><Input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></Field>
        <Field id="e-roll" label={t('career.rollNumber')}><Input id="e-roll" value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} maxLength={40} /></Field>
        <Field id="e-dept" label={t('career.department')}>
          <select id="e-dept" className={fieldClass} value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
            <option value="">{t('career.none')}</option>{college.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field id="e-batch" label={t('career.batch')}>
          <select id="e-batch" className={fieldClass} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
            <option value="">{t('career.none')}</option>{college.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field id="e-cgpa" label="CGPA"><Input id="e-cgpa" type="number" step="0.01" min={0} max={10} value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: e.target.value })} /></Field>
        <Field id="e-bl" label={t('career.backlogs')}><Input id="e-bl" type="number" min={0} max={100} value={form.backlogs} onChange={(e) => setForm({ ...form, backlogs: e.target.value })} /></Field>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" disabled={busy} className="min-h-11">{t('common.save')}</Button>
          <Button type="button" variant="ghost" onClick={() => onClose(false)} className="min-h-11">{t('common.cancel')}</Button>
        </div>
      </form>
    </Panel>
  )
}
