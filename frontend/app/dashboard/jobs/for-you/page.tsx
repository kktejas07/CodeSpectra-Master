'use client'

/**
 * Jobs for you: open jobs ranked by an explainable match with your verified
 * skill passport and your (private) preferences; apply with a chosen résumé
 * version. lib/job-match/score.ts is the scoring rule.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, MapPin, Settings2, Sparkles } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import type { MatchResult } from '@/lib/job-match/score'
import { cn } from '@/lib/utils'

interface Prefs { city: string | null; country: string | null; open_to_relocate: boolean; experience_years: number | null; expected_salary_minor: number | null; currency: string | null }
interface Job {
  id: string; title: string; company: string; location: string | null; work_mode: string | null; employment_type: string | null
  salary: { min?: number; max?: number; currency?: string; period?: string } | null; created_at: string; match: MatchResult; applied: boolean
}
interface Draft { id: string; name: string; target_role: string; updated_at: string }

const selectCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function JobsForYouPage() {
  const gate = usePageGuard('user')
  const { t, td, fmt } = useT()
  const apiError = useApiError()
  const [data, setData] = useState<{ jobs: Job[]; verified_skills: number; prefs: Prefs } | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [showPrefs, setShowPrefs] = useState(false)
  const [applyFor, setApplyFor] = useState<Job | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await fetch('/api/jobs/for-you', { credentials: 'include', cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('career.jmLoadFailed'))
    }
  }, [apiError, t])

  useEffect(() => {
    if (!gate.ready) return
    void load()
    fetch('/api/resumes/drafts?list=1', { credentials: 'include' }).then((r) => r.json()).then((j) => setDrafts(Array.isArray(j?.drafts) ? j.drafts : [])).catch(() => setDrafts([]))
  }, [gate.ready, load])

  if (!gate.ready) return null
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('career.jmTitle')}
        description={t('career.jmDescription')}
        icon={<Sparkles />}
        actions={<Button variant="outline" className="min-h-11" aria-expanded={showPrefs} onClick={() => setShowPrefs((v) => !v)}><Settings2 className="mr-2 h-4 w-4" aria-hidden />{t('career.jmPreferences')}</Button>}
      />
      {data && data.verified_skills === 0 ? (
        <Panel className="p-4 text-sm text-muted-foreground">
          {t('career.jmNoVerifiedSkills')} <Link href="/dashboard/passport" className="font-medium text-primary hover:underline">{t('career.jmOpenPassport')}</Link>
        </Panel>
      ) : null}
      {showPrefs && data ? <PrefsForm prefs={data.prefs} onSaved={() => { setShowPrefs(false); void load() }} /> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="font-semibold underline" onClick={() => void load()}>{t('common.retry')}</button></p> : null}
      {!data && !error ? <SkeletonList /> : null}
      {data && !data.jobs.length ? <EmptyState illustration="jobs" title={t('career.jmEmpty')} description={t('career.jmEmptyHint')} actionLabel={t('career.jmBrowseAll')} actionHref="/jobs" /> : null}
      {data?.jobs.length ? (
        <ul className="space-y-4">
          {data.jobs.map((j) => (
            <li key={j.id}>
              <Panel className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground">{j.title}</h2>
                    <p className="text-sm text-muted-foreground">{[j.company, j.location, j.work_mode ? td(`career.jmMode:${j.work_mode}`, j.work_mode) : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold tabular-nums text-foreground" aria-label={t('career.jmScoreAria', { score: j.match.score })}>{j.match.score}</p>
                    <p className="text-xs text-muted-foreground">{t('career.jmMatch')}</p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-2" aria-label={t('career.jmWhy')}>
                  {j.match.parts.map((p) => (
                    <li key={p.key} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                      {td(`career.jmPart:${p.key}`, p.key)} <span className="tabular-nums">{p.score}</span>
                      <span className="text-muted-foreground"> · {p.key === 'skills' ? t('career.jmSkillsNote', { note: p.note }) : td(`career.jmNote:${p.note}`, p.note)}</span>
                    </li>
                  ))}
                </ul>
                {j.match.matched.length ? (
                  <p className="text-sm text-muted-foreground">{t('career.jmMatched')} {j.match.matched.map((m) => `${m.skill} (${td(`career.jmLevel:${m.level}`, m.level)})`).join(', ')}</p>
                ) : null}
                {j.match.missing.length ? <p className="text-sm text-muted-foreground">{t('career.jmMissing')} {j.match.missing.join(', ')}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {j.applied
                    ? <span className="inline-flex min-h-11 items-center rounded-xl bg-green-500/15 px-4 text-sm font-medium text-green-700 dark:text-green-400">{t('career.jmApplied')}</span>
                    : <Button className="min-h-11" onClick={() => setApplyFor(j)}><Briefcase className="mr-2 h-4 w-4" aria-hidden />{t('career.jmApply')}</Button>}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden />{fmt.relative(j.created_at)}</span>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      ) : null}
      {applyFor ? <ApplyDialog job={applyFor} drafts={drafts} onClose={() => setApplyFor(null)} onApplied={() => { setApplyFor(null); void load() }} /> : null}
    </div>
  )
}

function PrefsForm({ prefs, onSaved }: { prefs: Prefs; onSaved: () => void }) {
  const { t } = useT()
  const apiError = useApiError()
  const [city, setCity] = useState(prefs.city ?? '')
  const [country, setCountry] = useState(prefs.country ?? '')
  const [relocate, setRelocate] = useState(prefs.open_to_relocate)
  const [years, setYears] = useState(prefs.experience_years === null ? '' : String(prefs.experience_years))
  const [salary, setSalary] = useState(prefs.expected_salary_minor === null ? '' : String(Math.round(prefs.expected_salary_minor / 100)))
  const [currency, setCurrency] = useState(prefs.currency ?? 'INR')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await csrfFetch('/api/jobs/for-you', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.trim() || null, country: country.trim() ? country.trim().toUpperCase() : null, open_to_relocate: relocate,
          experience_years: years === '' ? null : Number(years),
          expected_salary_minor: salary === '' ? null : Math.round(Number(salary) * 100), currency: salary === '' ? null : currency,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      onSaved()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t('career.jmSaveFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="p-5">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <p className="text-sm text-muted-foreground sm:col-span-2">{t('career.jmPrefsPrivate')}</p>
        <div className="space-y-1.5"><Label htmlFor="p-city">{t('career.jmCity')}</Label><Input id="p-city" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="p-country">{t('career.jmCountry')}</Label><Input id="p-country" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="p-years">{t('career.jmYears')}</Label><Input id="p-years" type="number" min={0} max={60} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} /></div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div className="space-y-1.5"><Label htmlFor="p-salary">{t('career.jmSalary')}</Label><Input id="p-salary" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-cur">{t('career.jmCurrency')}</Label>
            <select id="p-cur" className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {['INR', 'USD', 'EUR', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={relocate} onChange={(e) => setRelocate(e.target.checked)} />{t('career.jmRelocate')}
        </label>
        {err ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{err}</p> : null}
        <div className="sm:col-span-2"><Button type="submit" className="min-h-11" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Button></div>
      </form>
    </Panel>
  )
}

function ApplyDialog({ job, drafts, onClose, onApplied }: { job: Job; drafts: Draft[]; onClose: () => void; onApplied: () => void }) {
  const { t } = useT()
  const apiError = useApiError()
  const [draft, setDraft] = useState(drafts[0]?.id ?? '')
  const [cover, setCover] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const apply = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await csrfFetch('/api/jobs/for-you/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: job.id, draft_id: draft, ...(cover.trim() ? { cover_letter: cover.trim() } : {}) }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(j))
      onApplied()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t('career.jmApplyFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="jm-apply-title">
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={apply} className="relative w-full max-w-md space-y-4 rounded-3xl border border-border bg-card p-6 shadow-xl">
        <h2 id="jm-apply-title" className="text-lg font-semibold text-foreground">{t('career.jmApplyTitle', { title: job.title })}</h2>
        {drafts.length ? (
          <div className="space-y-1.5">
            <Label htmlFor="jm-draft">{t('career.jmResumeVersion')}</Label>
            <select id="jm-draft" autoFocus className={selectCls} value={draft} onChange={(e) => setDraft(e.target.value)}>
              {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.target_role ? ` · ${d.target_role}` : ''}</option>)}
            </select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('career.jmNoVersions')} <Link href="/dashboard/resumes/builder?source=new" className="font-medium text-primary hover:underline">{t('career.jmBuildResume')}</Link></p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="jm-cover">{t('career.jmCoverLetter')}</Label>
          <textarea id="jm-cover" rows={4} maxLength={5000} value={cover} onChange={(e) => setCover(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {err ? <p role="alert" className="text-sm text-destructive">{err}</p> : null}
        <div className={cn('flex flex-wrap justify-end gap-2')}>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" className="min-h-11" disabled={busy || !draft}>{busy ? t('career.jmApplying') : t('career.jmSendApplication')}</Button>
        </div>
      </form>
    </div>
  )
}
