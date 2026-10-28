'use client'

/** Create / edit a cohort: course, dates, capacity, access (free, licence, plan, paid product), weekly schedule, completion rule. */
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { call, ErrorNote, Field, areaClass, fieldClass, useErrorText } from '@/components/community/client-api'
import type { CohortDoc, WeeklySlot } from '@/lib/cohorts/types'

const toLocal = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function CohortForm({ initial, onSaved }: { initial?: Omit<CohortDoc, 'created_by'>; onSaved: (c: CohortDoc) => void }) {
  const { t, td } = useT()
  const errText = useErrorText()
  const tzDefault = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [f, setF] = useState(() => ({
    title: initial?.title ?? '',
    summary: initial?.summary ?? '',
    course_id: initial?.course_id ?? '',
    skills: (initial?.skills ?? []).join(', '),
    starts_at: initial ? toLocal(initial.starts_at) : '',
    ends_at: initial ? toLocal(initial.ends_at) : '',
    timezone: initial?.timezone ?? tzDefault,
    capacity: String(initial?.capacity ?? 30),
    status: initial?.status ?? 'draft',
    free: initial?.access.free ?? true,
    entitlement: initial?.access.entitlement ?? false,
    licence_org_ids: (initial?.access.licence_org_ids ?? []).join(', '),
    marketplace_product_id: initial?.access.marketplace_product_id ?? '',
    price: initial?.access.price_minor != null ? String(initial.access.price_minor / 100) : '',
    currency: initial?.access.currency ?? 'INR',
    provider: initial?.schedule.provider ?? 'livekit',
    manual_url: initial?.schedule.manual_url ?? '',
    weekly: (initial?.schedule.weekly ?? []) as WeeklySlot[],
    min_attendance_pct: String(initial?.completion.min_attendance_pct ?? 75),
    min_assignment_pct: String(initial?.completion.min_assignment_pct ?? 60),
    require_all_assignments: initial?.completion.require_all_assignments ?? true,
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    call<{ data: { id: string; title: string }[] }>('/api/courses').then((r) => setCourses((r.data || []).map((c) => ({ id: c.id, title: c.title })))).catch(() => setCourses([]))
  }, [])

  const days = [0, 1, 2, 3, 4, 5, 6]
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
    const body = {
      title: f.title, summary: f.summary, course_id: f.course_id || null, skills: list(f.skills),
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : '', ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : '',
      timezone: f.timezone, capacity: Number(f.capacity), status: f.status,
      access: { free: f.free, entitlement: f.entitlement, licence_org_ids: list(f.licence_org_ids), marketplace_product_id: f.marketplace_product_id.trim() || null, price_minor: f.price ? Math.round(Number(f.price) * 100) : null, currency: f.currency },
      schedule: { provider: f.provider, manual_url: f.manual_url.trim() || null, weekly: f.weekly, title_prefix: f.title },
      completion: { min_attendance_pct: Number(f.min_attendance_pct), min_assignment_pct: Number(f.min_assignment_pct), require_all_assignments: f.require_all_assignments },
    }
    try {
      const r = initial ? await call<{ cohort: CohortDoc }>(`/api/cohorts/${initial.id}`, { method: 'PATCH', body }) : await call<{ cohort: CohortDoc }>('/api/cohorts', { body })
      onSaved(r.cohort)
    } catch (e2) {
      setErr(errText(e2))
    } finally {
      setBusy(false)
    }
  }

  const check = (id: string, label: string, v: boolean, on: (v: boolean) => void) => (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm text-foreground">
      <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={v} onChange={(e) => on(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <Field id="c-title" label={t('community.fieldTitle')} className="sm:col-span-2"><input id="c-title" className={fieldClass} value={f.title} onChange={(e) => set('title', e.target.value)} required maxLength={140} /></Field>
        <Field id="c-summary" label={t('community.fieldSummary')} className="sm:col-span-2"><textarea id="c-summary" className={areaClass} value={f.summary} onChange={(e) => set('summary', e.target.value)} maxLength={4000} /></Field>
        <Field id="c-course" label={t('community.fieldCourse')} hint={t('community.fieldCourseHint')}>
          <select id="c-course" className={fieldClass} value={f.course_id} onChange={(e) => set('course_id', e.target.value)}>
            <option value="">{t('community.noCourse')}</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        <Field id="c-skills" label={t('community.fieldSkills')} hint={t('community.commaSeparated')}><input id="c-skills" className={fieldClass} value={f.skills} onChange={(e) => set('skills', e.target.value)} /></Field>
        <Field id="c-start" label={t('community.fieldStarts')}><input id="c-start" type="datetime-local" className={fieldClass} value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} required /></Field>
        <Field id="c-end" label={t('community.fieldEnds')}><input id="c-end" type="datetime-local" className={fieldClass} value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} required /></Field>
        <Field id="c-tz" label={t('community.fieldTimezone')}><input id="c-tz" className={fieldClass} value={f.timezone} onChange={(e) => set('timezone', e.target.value)} required /></Field>
        <Field id="c-cap" label={t('community.fieldCapacity')}><input id="c-cap" type="number" min={1} max={5000} className={fieldClass} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} required /></Field>
        <Field id="c-status" label={t('community.fieldStatus')}>
          <select id="c-status" className={fieldClass} value={f.status} onChange={(e) => set('status', e.target.value as typeof f.status)}>
            {(['draft', 'open', 'running', 'completed', 'archived'] as const).map((s) => <option key={s} value={s}>{td(`community.cohortStatus_${s}`, s)}</option>)}
          </select>
        </Field>
      </Panel>

      <Panel className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('community.accessTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {check('c-free', t('community.accessFree'), f.free, (v) => set('free', v))}
          {check('c-ent', t('community.accessEntitlement'), f.entitlement, (v) => set('entitlement', v))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-lic" label={t('community.accessLicence')} hint={t('community.accessLicenceHint')}><input id="c-lic" className={fieldClass} value={f.licence_org_ids} onChange={(e) => set('licence_org_ids', e.target.value)} /></Field>
          <Field id="c-prod" label={t('community.accessProduct')} hint={t('community.accessProductHint')}><input id="c-prod" className={fieldClass} value={f.marketplace_product_id} onChange={(e) => set('marketplace_product_id', e.target.value)} /></Field>
          <Field id="c-price" label={t('community.accessPrice')}><input id="c-price" inputMode="decimal" className={fieldClass} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
          <Field id="c-cur" label={t('community.accessCurrency')}>
            <select id="c-cur" className={fieldClass} value={f.currency} onChange={(e) => set('currency', e.target.value as 'INR' | 'USD')}><option value="INR">INR</option><option value="USD">USD</option></select>
          </Field>
        </div>
      </Panel>

      <Panel className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('community.scheduleTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-prov" label={t('community.fieldProvider')} hint={t('community.fieldProviderHint')}>
            <select id="c-prov" className={fieldClass} value={f.provider} onChange={(e) => set('provider', e.target.value as typeof f.provider)}>
              {(['livekit', 'zoom', 'google_meet', 'teams', 'manual'] as const).map((p) => <option key={p} value={p}>{td(`community.provider_${p}`, p)}</option>)}
            </select>
          </Field>
          {f.provider === 'manual' && <Field id="c-url" label={t('community.fieldMeetingLink')}><input id="c-url" type="url" className={fieldClass} value={f.manual_url} onChange={(e) => set('manual_url', e.target.value)} placeholder="https://" /></Field>}
        </div>
        <ul className="space-y-2">
          {f.weekly.map((w, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Field id={`w-d-${i}`} label={t('community.weekday')}>
                <select id={`w-d-${i}`} className={fieldClass} value={w.dow} onChange={(e) => set('weekly', f.weekly.map((x, j) => (j === i ? { ...x, dow: Number(e.target.value) } : x)))}>
                  {days.map((d) => <option key={d} value={d}>{td(`community.dow_${d}`, String(d))}</option>)}
                </select>
              </Field>
              <Field id={`w-s-${i}`} label={t('community.startTime')}><input id={`w-s-${i}`} type="time" className={fieldClass} value={w.start} onChange={(e) => set('weekly', f.weekly.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} required /></Field>
              <Field id={`w-m-${i}`} label={t('community.minutes')}><input id={`w-m-${i}`} type="number" min={15} max={240} className={fieldClass} value={w.duration_min} onChange={(e) => set('weekly', f.weekly.map((x, j) => (j === i ? { ...x, duration_min: Number(e.target.value) } : x)))} /></Field>
              <Button type="button" variant="ghost" size="icon-lg" aria-label={t('community.removeSlot')} onClick={() => set('weekly', f.weekly.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="min-h-[44px] rounded-full" onClick={() => set('weekly', [...f.weekly, { dow: 1, start: '18:00', duration_min: 60 }])}><Plus className="h-4 w-4" aria-hidden />{t('community.addWeeklySlot')}</Button>
      </Panel>

      <Panel className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground sm:col-span-3">{t('community.completionTitle')}</h2>
        <Field id="c-att" label={t('community.minAttendance')}><input id="c-att" type="number" min={0} max={100} className={fieldClass} value={f.min_attendance_pct} onChange={(e) => set('min_attendance_pct', e.target.value)} /></Field>
        <Field id="c-score" label={t('community.minScore')}><input id="c-score" type="number" min={0} max={100} className={fieldClass} value={f.min_assignment_pct} onChange={(e) => set('min_assignment_pct', e.target.value)} /></Field>
        <div className="flex items-end">{check('c-all', t('community.requireAll'), f.require_all_assignments, (v) => set('require_all_assignments', v))}</div>
      </Panel>

      <ErrorNote text={err} />
      <Button type="submit" disabled={busy} className="min-h-[44px] rounded-full px-6">{busy ? t('community.saving') : initial ? t('community.saveChanges') : t('community.createCohort')}</Button>
    </form>
  )
}
