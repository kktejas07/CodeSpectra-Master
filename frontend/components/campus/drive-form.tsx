'use client'

/** Create / edit a placement drive. CTC is typed in rupees (major units) and sent as integer minor units. */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DriveDoc } from '@/lib/campus/types'
import { useConsole } from './console-context'
import { Field, fieldClass } from './shared'

interface PatternOpt { id: string; companyName: string; examName: string }

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)
const major = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : String(minor / 100))
const minor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100))

export function DriveForm({ initial, onSubmit, busy, submitLabel }: { initial?: DriveDoc; onSubmit: (body: Record<string, unknown>) => void; busy: boolean; submitLabel: string }) {
  const { college } = useConsole()
  const [patterns, setPatterns] = useState<PatternOpt[]>([])
  const [f, setF] = useState(() => ({
    title: initial?.title ?? '', company: initial?.company.name ?? '', website: initial?.company.website ?? '', role: initial?.role_title ?? '',
    description: initial?.description ?? '', ctcMin: major(initial?.ctc_minor_min), ctcMax: major(initial?.ctc_minor_max), currency: initial?.currency ?? 'INR',
    minCgpa: initial?.eligibility.min_cgpa?.toString() ?? '', maxBacklogs: initial?.eligibility.max_backlogs?.toString() ?? '',
    depts: initial?.eligibility.department_ids ?? [], years: initial?.eligibility.graduation_years ?? [],
    applyBy: toLocal(initial?.schedule.apply_by), testAt: toLocal(initial?.schedule.test_at), interviewAt: toLocal(initial?.schedule.interview_at),
    mode: initial?.process.mode ?? 'company_test', patternId: initial?.process.pattern_id ?? '', atsJobId: initial?.process.ats_job_id ?? '', externalUrl: initial?.process.external_url ?? '',
  }))
  const years = useMemo(() => [...new Set(college.batches.map((b) => b.graduation_year))].sort(), [college.batches])

  useEffect(() => {
    let live = true
    fetch('/api/company-tests?all=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (live) setPatterns(Array.isArray(d.items) ? d.items : []) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          title: f.title, company: { name: f.company, website: f.website || null }, role_title: f.role, description: f.description,
          ctc_minor_min: minor(f.ctcMin), ctc_minor_max: minor(f.ctcMax), currency: f.currency,
          eligibility: { min_cgpa: f.minCgpa === '' ? null : Number(f.minCgpa), max_backlogs: f.maxBacklogs === '' ? null : Number(f.maxBacklogs), department_ids: f.depts, graduation_years: f.years },
          schedule: { apply_by: fromLocal(f.applyBy), test_at: fromLocal(f.testAt), interview_at: fromLocal(f.interviewAt) },
          process: { mode: f.mode, pattern_id: f.mode === 'company_test' ? f.patternId || null : null, ats_job_id: f.mode === 'ats_job' ? f.atsJobId || null : null, external_url: f.mode === 'external' ? f.externalUrl || null : null },
        })
      }}
    >
      <Field id="d-title" label="Drive title"><Input id="d-title" value={f.title} onChange={set('title')} required minLength={3} maxLength={160} placeholder="TCS Ninja 2027" /></Field>
      <Field id="d-role" label="Role"><Input id="d-role" value={f.role} onChange={set('role')} required maxLength={160} placeholder="Software engineer" /></Field>
      <Field id="d-company" label="Company"><Input id="d-company" value={f.company} onChange={set('company')} required maxLength={160} /></Field>
      <Field id="d-web" label="Company website"><Input id="d-web" type="url" value={f.website} onChange={set('website')} placeholder="https://" /></Field>
      <Field id="d-desc" label="Description" className="sm:col-span-2">
        <textarea id="d-desc" className="min-h-24 w-full rounded-lg border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" value={f.description} onChange={set('description')} maxLength={8000} />
      </Field>
      <div className="grid grid-cols-[1fr_1fr_96px] gap-3 sm:col-span-2">
        <Field id="d-ctcmin" label="CTC from (per year)"><Input id="d-ctcmin" type="number" min={0} step="1" value={f.ctcMin} onChange={set('ctcMin')} /></Field>
        <Field id="d-ctcmax" label="CTC up to"><Input id="d-ctcmax" type="number" min={0} step="1" value={f.ctcMax} onChange={set('ctcMax')} /></Field>
        <Field id="d-cur" label="Currency"><select id="d-cur" className={fieldClass} value={f.currency} onChange={set('currency')}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></Field>
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-border p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-semibold text-foreground">Eligibility</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="d-cgpa" label="Minimum CGPA"><Input id="d-cgpa" type="number" min={0} max={10} step="0.01" value={f.minCgpa} onChange={set('minCgpa')} /></Field>
          <Field id="d-bl" label="Maximum backlogs"><Input id="d-bl" type="number" min={0} max={100} value={f.maxBacklogs} onChange={set('maxBacklogs')} placeholder="Any" /></Field>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Departments <span className="font-normal text-muted-foreground">(none ticked = all)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {college.departments.map((d) => (
              <label key={d.id} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm">
                <input type="checkbox" checked={f.depts.includes(d.id)} onChange={() => setF({ ...f, depts: toggle(f.depts, d.id) })} className="h-4 w-4" />{d.code}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Graduation years <span className="font-normal text-muted-foreground">(none ticked = all)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {years.map((y) => (
              <label key={y} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3 text-sm">
                <input type="checkbox" checked={f.years.includes(y)} onChange={() => setF({ ...f, years: toggle(f.years, y) })} className="h-4 w-4" />{y}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <Field id="d-apply" label="Apply by"><Input id="d-apply" type="datetime-local" value={f.applyBy} onChange={set('applyBy')} required /></Field>
      <Field id="d-test" label="Test on"><Input id="d-test" type="datetime-local" value={f.testAt} onChange={set('testAt')} /></Field>
      <Field id="d-int" label="Interviews on"><Input id="d-int" type="datetime-local" value={f.interviewAt} onChange={set('interviewAt')} /></Field>
      <Field id="d-mode" label="Selection process">
        <select id="d-mode" className={fieldClass} value={f.mode} onChange={set('mode')}>
          <option value="company_test">Company test on CodeSpectra</option>
          <option value="ats_job">Company's job pipeline on CodeSpectra</option>
          <option value="external">Company's own application form</option>
        </select>
      </Field>
      {f.mode === 'company_test' && (
        <Field id="d-pattern" label="Company test" className="sm:col-span-2">
          <select id="d-pattern" className={fieldClass} value={f.patternId} onChange={set('patternId')} required>
            <option value="">Select a test</option>
            {patterns.map((p) => <option key={p.id} value={p.id}>{p.companyName} — {p.examName}</option>)}
          </select>
        </Field>
      )}
      {f.mode === 'ats_job' && <Field id="d-job" label="Job id" hint="The company shares the id of a public job on CodeSpectra." className="sm:col-span-2"><Input id="d-job" value={f.atsJobId} onChange={set('atsJobId')} required maxLength={80} /></Field>}
      {f.mode === 'external' && <Field id="d-url" label="Application link" className="sm:col-span-2"><Input id="d-url" type="url" value={f.externalUrl} onChange={set('externalUrl')} required /></Field>}
      <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-11">{submitLabel}</Button></div>
    </form>
  )
}
