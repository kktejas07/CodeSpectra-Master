'use client'

/**
 * Ways candidates get into a job: public link, bulk résumé upload (one
 * request per file so each shows its own progress and result), add by hand,
 * CSV import and talent-pool suggestions.
 */
import { useOrigin } from '@/hooks/use-browser-value'
import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, CheckCircle2, Copy, FileUp, Loader2, Sparkles, UploadCloud, UserPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import type { AtsJob } from '@/lib/ats/contract'
import { AtsError, atsSend, errorMessage, useAts } from '../lib/api'
import { csvToCandidates, parseCsv, type CsvCandidate } from '../lib/board'
import type { ResumeUploadResult, TalentSuggestion } from '../lib/types'
import { ChipInput, ErrorState, Field, InlineError, LoadingRows, MatchScore, NativeSelect } from '../ui'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'
const MAX_BYTES = 5 * 1024 * 1024
const BATCH = 10
const OK_EXT = /\.(pdf|docx|txt|md)$/i

type UploadItem = { key: string; file: File; state: 'queued' | 'uploading' | 'done' | 'failed'; result?: ResumeUploadResult; error?: string }

/** Public apply page: the job's mirror on the jobs board (lib/ats/legacy), created when it is open and public. */
function publicPath(job: AtsJob): string | null {
  return job.legacy_job_id ? `/jobs/${encodeURIComponent(job.legacy_job_id)}` : null
}

export function IntakePanel({ job, onAdded }: { job: AtsJob; onAdded: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ShareLink job={job} />
      <ResumeDrop jobId={job.id} onAdded={onAdded} />
      <AddCandidate jobId={job.id} onAdded={onAdded} />
      <CsvImport jobId={job.id} onAdded={onAdded} />
      <div className="lg:col-span-2"><TalentPool jobId={job.id} onAdded={onAdded} /></div>
    </div>
  )
}

function ShareLink({ job }: { job: AtsJob }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const path = publicPath(job)
  const live = job.is_public && job.status === 'open' && !!path
  const origin = useOrigin()
  const url = path && origin ? `${origin}${path}` : path ?? ''
  return (
    <Panel>
      <Section title={t('hiring.publicApplyLink')} description={t('hiring.shareItOnJobBoardsLinkedin76b')}>
        {live ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} aria-label={t('hiring.applyLink')} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={async () => {
                try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? t('hiring.copied') : t('hiring.copy')}
            </Button>
            <Button variant="ghost" asChild><Link href={path!} target="_blank" rel="noopener">{t('hiring.preview')}</Link></Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {!job.is_public ? t('hiring.thePublicApplyPageIsOffc71') : job.status !== 'open' ? t('hiring.theLinkAppearsOnceTheJob11e') : t('hiring.theLinkIsBeingSetUp3d4')}{' '}
            <Link href={`/dashboard/hiring/jobs/${job.id}/edit`} className="font-medium text-primary hover:underline">{t('hiring.editTheJob')}</Link>{' '}{t('hiring.toChangeIt')}</p>
        )}
      </Section>
    </Panel>
  )
}

function ResumeDrop({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const { t } = useT()
  const [items, setItems] = useState<UploadItem[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const running = items.some((i) => i.state === 'queued' || i.state === 'uploading')

  const patchMany = (keys: string[], p: (i: UploadItem, idx: number) => Partial<UploadItem>) =>
    setItems((list) => list.map((i) => { const idx = keys.indexOf(i.key); return idx >= 0 ? { ...i, ...p(i, idx) } : i }))

  // ponytail: batches of 10 files per request (the route allows 50 and 10
  // requests a minute), sent one after another; each file gets its own result.
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).slice(0, 200)
      const fresh: UploadItem[] = arr.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        state: !OK_EXT.test(file.name) || file.size > MAX_BYTES ? 'failed' : 'queued',
        error: !OK_EXT.test(file.name) ? 'Use PDF, DOCX, TXT or MD.' : file.size > MAX_BYTES ? 'Larger than 5 MB.' : undefined,
      }))
      setItems((l) => [...fresh, ...l])
      const queue = fresh.filter((f) => f.state === 'queued')
      let added = 0
      for (let b = 0; b < queue.length; b += BATCH) {
        const batch = queue.slice(b, b + BATCH)
        const keys = batch.map((i) => i.key)
        patchMany(keys, () => ({ state: 'uploading' }))
        const fd = new FormData()
        for (const it of batch) fd.append('files', it.file, it.file.name)
        try {
          const res = await atsSend<{ results?: ResumeUploadResult[] }>(`/api/ats/jobs/${encodeURIComponent(jobId)}/resumes`, 'POST', fd)
          const results = res?.results ?? []
          added += results.filter((r) => r.ok).length
          patchMany(keys, (_, idx) => {
            const r = results[idx]
            if (!r) return { state: 'failed', error: 'No result for this file.' }
            return r.ok ? { state: 'done', result: r } : { state: 'failed', result: r, error: r.error || 'Could not read this résumé.' }
          })
        } catch (e) {
          const msg = errorMessage(e)
          patchMany(keys, () => ({ state: 'failed', error: msg }))
          if (e instanceof AtsError && e.status === 429) {
            // Rate limited: leave the rest as failed with the same hint rather than hammering.
            const rest = queue.slice(b + BATCH).map((i) => i.key)
            patchMany(rest, () => ({ state: 'failed', error: msg }))
            break
          }
        }
      }
      if (added) onAdded()
    },
    [jobId, onAdded],
  )

  const done = items.filter((i) => i.state === 'done').length
  return (
    <Panel>
      <Section title={t('hiring.uploadRSumS')} description={t('hiring.dropUpTo200FilesEach0e7')}>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files) }}
          className={cn('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors', over ? 'border-primary bg-primary/5' : 'border-border')}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground">{t('hiring.dragRSumSHere')}</p>
          <p className="text-xs text-muted-foreground">{t('hiring.pdfDocxTxtOrMdUpe4a')}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => input.current?.click()} disabled={running}>
            <FileUp aria-hidden />{' '}{t('hiring.chooseFiles')}</Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label={t('hiring.chooseRSumFiles')}
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = '' }}
          />
        </div>
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              <span className="tabular-nums">{done}</span>{' '}{t('hiring.of')}{' '}<span className="tabular-nums">{items.length}</span>{' '}{t('hiring.addedValue', { value: running ? t('hiring.uploading') : '' })}</p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {items.map((i) => (
                <li key={i.key} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {i.state === 'uploading' || i.state === 'queued' ? (
                    <Loader2 className={cn('h-4 w-4 shrink-0 text-muted-foreground', i.state === 'uploading' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
                  ) : i.state === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{i.result?.name || i.file.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.state === 'queued' ? t('hiring.waiting') : i.state === 'uploading' ? t('hiring.readingRSum') : i.state === 'failed' ? i.error : i.result?.duplicate ? t('hiring.alreadyACandidateAddedToThis115') : t('hiring.added')}
                    </span>
                  </span>
                  {i.state === 'done' && i.result?.candidate_id && (
                    <Link href={`/dashboard/hiring/candidates/${i.result.candidate_id}${i.result.application_id ? `?app=${i.result.application_id}` : ''}`} className="shrink-0 text-xs font-medium text-primary hover:underline">{t('hiring.open')}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </Panel>
  )
}

const COUNTRIES = (t: Translator) => ([
  { value: 'IN', label: t('hiring.india') },
  { value: 'US', label: t('hiring.unitedStates') },
  { value: 'GB', label: t('hiring.unitedKingdom') },
  { value: 'AE', label: t('hiring.unitedArabEmirates') },
  { value: 'SG', label: t('hiring.singapore') },
  { value: 'CA', label: t('hiring.canada') },
  { value: 'AU', label: t('hiring.australia') },
  { value: 'DE', label: t('hiring.germany') },
])

function AddCandidate({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const { t } = useT()
  const addToast = useToast()
  const [f, setF] = useState({ name: '', email: '', phone: '', country: 'IN', resume_text: '' })
  const [tags, setTags] = useState<string[]>([])
  const [referral, setReferral] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!f.name.trim()) return setError(t('hiring.addAName'))
    if (!f.email.trim() && !f.phone.trim()) return setError(t('hiring.addAnEmailOrAPhone667'))
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError(t('hiring.thatEmailDoesntLookRight'))
    setBusy(true)
    try {
      const r = await atsSend<{ duplicate?: boolean }>(`/api/ats/jobs/${encodeURIComponent(jobId)}/candidates`, 'POST', {
        mode: 'manual',
        name: f.name.trim(),
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
        country: f.country || undefined,
        resume_text: f.resume_text.trim() || undefined,
        source: referral ? 'referral' : 'manual',
        tags,
      })
      addToast({ type: 'success', title: r?.duplicate ? t('hiring.alreadyACandidateAddedToThis115') : t('hiring.candidateAdded') })
      setF({ name: '', email: '', phone: '', country: f.country, resume_text: '' })
      setTags([])
      onAdded()
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <Panel>
      <Section title={t('hiring.addACandidate')} description={t('hiring.forReferralsOrPeopleYouFound594')}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hiring.name')} htmlFor="ac-name"><Input id="ac-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="off" /></Field>
          <Field label="Email" htmlFor="ac-email"><Input id="ac-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>
          <Field label={t('hiring.phone')} htmlFor="ac-phone" hint={t('hiring.withCountryCodeEG9192a')}><Input id="ac-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="off" /></Field>
          <Field label={t('hiring.country')} htmlFor="ac-country"><NativeSelect id="ac-country" value={f.country} onChange={(v) => setF({ ...f, country: v })} options={COUNTRIES(t)} /></Field>
          <Field label={t('hiring.rSumTextOptional')} htmlFor="ac-cv" className="sm:col-span-2" hint={t('hiring.pasteItToScreenThemRightb55')}>
            <Textarea id="ac-cv" rows={3} value={f.resume_text} onChange={(e) => setF({ ...f, resume_text: e.target.value })} />
          </Field>
          <div className="sm:col-span-2"><ChipInput label={t('hiring.tags')} value={tags} onChange={setTags} placeholder={t('hiring.eGReactCampus2026')} /></div>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <Checkbox checked={referral} onCheckedChange={(v) => setReferral(v === true)} />{' '}{t('hiring.thisIsAReferral')}</label>
          <div className="space-y-2 sm:col-span-2">
            <InlineError message={error} />
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />}{' '}{t('hiring.addCandidate')}</Button>
          </div>
        </form>
      </Section>
    </Panel>
  )
}

function CsvImport({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const { t } = useT()
  const addToast = useToast()
  const [preview, setPreview] = useState<{ name: string; text: string; valid: CsvCandidate[]; invalid: number } | null>(null)
  const [failures, setFailures] = useState<{ line: number; error?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const read = async (file: File) => {
    setError(null)
    setFailures([])
    if (file.size > 2 * 1024 * 1024) return setError(t('hiring.keepCsvFilesUnder2Mb'))
    const text = await file.text()
    const { valid, invalid } = csvToCandidates(parseCsv(text))
    if (!valid.length) return setError(t('hiring.noRowsWithANameAnd2cd'))
    if (valid.length > 1000) return setError(t('hiring.importUpTo1000Rowsd18'))
    setPreview({ name: file.name, text, valid, invalid })
  }
  const submit = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const res = await atsSend<{ added?: number; results?: { line: number; ok: boolean; error?: string; duplicate?: boolean }[] }>(
        `/api/ats/jobs/${encodeURIComponent(jobId)}/candidates`, 'POST', { mode: 'csv', csv: preview.text },
      )
      const added = res?.added ?? 0
      const failed = (res?.results ?? []).filter((r) => !r.ok)
      addToast({ type: failed.length ? 'warning' : 'success', title: t('hiring.countCandidatesImported', { count: added }), message: failed.length ? t('hiring.countRowsSkipped', { count: failed.length }) : undefined })
      setFailures(failed)
      setPreview(null)
      onAdded()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Panel>
      <Section title={t('hiring.importACsv')} description={t('hiring.headerRowWithNameEmailPhonebb1')}>
        {!preview ? (
          <Button variant="outline" className="rounded-full" onClick={() => input.current?.click()}><FileUp aria-hidden />{' '}{t('hiring.chooseCsv')}</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{preview.name}</span>: <span className="tabular-nums">{preview.valid.length}</span>{' '}{t('hiring.ready2')}{preview.invalid > 0 && <span className="text-amber-700 dark:text-amber-400">, <span className="tabular-nums">{preview.invalid}</span>{' '}{t('hiring.lookIncompleteMissingNameOrContact')}</span>}
            </p>
            <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
              {preview.valid.slice(0, 8).map((c, i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-1.5"><span className="truncate text-foreground">{c.name}</span><span className="truncate text-muted-foreground">{c.email || c.phone}</span></li>
              ))}
              {preview.valid.length > 8 && <li className="px-3 py-1.5 text-xs text-muted-foreground">{t('hiring.and')}{' '}{preview.valid.length - 8}{' '}{t('hiring.more')}</li>}
            </ul>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{' '}{t('hiring.import')}</Button>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label={t('hiring.chooseCsvFile')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} />
        {failures.length > 0 && (
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-amber-700 dark:text-amber-400">
            {failures.slice(0, 20).map((f) => <li key={f.line}>{t('hiring.lineLine', { line: f.line })}{' '}{f.error || t('hiring.skipped2')}</li>)}
          </ul>
        )}
        <InlineError message={error} />
      </Section>
    </Panel>
  )
}

function TalentPool({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const { t } = useT()
  const addToast = useToast()
  const pool = useAts<TalentSuggestion[]>(`/api/ats/jobs/${encodeURIComponent(jobId)}/talent-pool`, 'candidates')
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())
  const add = async (ids: string[]) => {
    setAdding((s) => new Set([...s, ...ids]))
    try {
      const res = await atsSend<{ results?: { id: string; ok: boolean; error?: string }[] }>(`/api/ats/jobs/${encodeURIComponent(jobId)}/candidates`, 'POST', { mode: 'pool', ids })
      const ok = (res?.results ?? ids.map((id) => ({ id, ok: true }))).filter((r) => r.ok).map((r) => r.id)
      setAdded((s) => new Set([...s, ...ok]))
      const failed = ids.length - ok.length
      addToast({ type: failed ? 'warning' : 'success', title: ok.length === 1 ? t('hiring.addedToThisJob') : t('hiring.countAddedToThisJob', { count: ok.length }), message: failed ? t('hiring.failedCouldNotBeAdded', { failed }) : undefined })
      if (ok.length) onAdded()
    } catch (e) {
      addToast({ type: 'error', title: t('hiring.couldNotAdd'), message: errorMessage(e) })
    } finally {
      setAdding((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n })
    }
  }
  const list = (pool.data ?? []).filter((s) => !added.has(s.id))
  return (
    <Panel>
      <Section
        title={t('hiring.fromYourTalentPool')}
        description={t('hiring.yourOrganisationsCandidatesAndPastJob052')}
        actions={list.length > 1 && <Button size="sm" variant="outline" onClick={() => add(list.slice(0, 10).map((s) => s.id))}><Sparkles aria-hidden />{' '}{t('hiring.addTopValue', { value: Math.min(10, list.length) })}</Button>}
      >
        {pool.loading && !pool.data ? (
          <LoadingRows rows={2} />
        ) : pool.error ? (
          <ErrorState compact message={pool.error.message} onRetry={pool.reload} />
        ) : list.length === 0 ? (
          <EmptyState compact illustration="search" title={t('hiring.noMatchesInYourPoolYet')} description={t('hiring.asCandidatesApplyToOtherJobse05')} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.slice(0, 12).map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                <MatchScore score={s.score} />
                <div className="min-w-0 flex-1">
                  {s.kind === 'candidate' ? (
                    <Link href={`/dashboard/hiring/candidates/${s.id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary">{s.name}</Link>
                  ) : (
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {s.kind === 'past_applicant' ? t('hiring.pastJobBoardApplicant') : ''}
                    {s.missing_must.length ? t('hiring.missingValue', { value: s.missing_must.slice(0, 2).join(', ') }) : s.reasons[0] || [s.location, s.total_years != null && `${s.total_years} yrs`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={adding.has(s.id)} onClick={() => add([s.id])} aria-label={t('hiring.addNameToThisJob', { name: s.name })}>
                  {adding.has(s.id) ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />}{' '}{t('hiring.add')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  )
}
