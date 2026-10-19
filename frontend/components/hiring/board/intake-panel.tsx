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
  const [copied, setCopied] = useState(false)
  const path = publicPath(job)
  const live = job.is_public && job.status === 'open' && !!path
  const origin = useOrigin()
  const url = path && origin ? `${origin}${path}` : path ?? ''
  return (
    <Panel>
      <Section title="Public apply link" description="Share it on job boards, LinkedIn or WhatsApp. Every application is screened automatically.">
        {live ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} aria-label="Apply link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button
              variant="outline"
              onClick={async () => {
                try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" asChild><Link href={path!} target="_blank" rel="noopener">Preview</Link></Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {!job.is_public ? 'The public apply page is off for this job.' : job.status !== 'open' ? 'The link appears once the job is open.' : 'The link is being set up. Reload in a moment.'}{' '}
            <Link href={`/dashboard/hiring/jobs/${job.id}/edit`} className="font-medium text-primary hover:underline">Edit the job</Link> to change it.
          </p>
        )}
      </Section>
    </Panel>
  )
}

function ResumeDrop({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
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
      <Section title="Upload résumés" description="Drop up to 200 files. Each one is parsed, matched to a candidate and screened.">
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files) }}
          className={cn('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors', over ? 'border-primary bg-primary/5' : 'border-border')}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground">Drag résumés here</p>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT or MD, up to 5 MB each</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => input.current?.click()} disabled={running}>
            <FileUp aria-hidden /> Choose files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label="Choose résumé files"
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = '' }}
          />
        </div>
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              <span className="tabular-nums">{done}</span> of <span className="tabular-nums">{items.length}</span> added{running ? ' · uploading…' : ''}
            </p>
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
                      {i.state === 'queued' ? 'Waiting' : i.state === 'uploading' ? 'Reading résumé…' : i.state === 'failed' ? i.error : i.result?.duplicate ? 'Already a candidate — added to this job' : 'Added'}
                    </span>
                  </span>
                  {i.state === 'done' && i.result?.candidate_id && (
                    <Link href={`/dashboard/hiring/candidates/${i.result.candidate_id}${i.result.application_id ? `?app=${i.result.application_id}` : ''}`} className="shrink-0 text-xs font-medium text-primary hover:underline">Open</Link>
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

const COUNTRIES = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SG', label: 'Singapore' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
]

function AddCandidate({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const addToast = useToast()
  const [f, setF] = useState({ name: '', email: '', phone: '', country: 'IN', resume_text: '' })
  const [tags, setTags] = useState<string[]>([])
  const [referral, setReferral] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!f.name.trim()) return setError('Add a name.')
    if (!f.email.trim() && !f.phone.trim()) return setError('Add an email or a phone number.')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError('That email doesn\u2019t look right.')
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
      addToast({ type: 'success', title: r?.duplicate ? 'Already a candidate — added to this job' : 'Candidate added' })
      setF({ name: '', email: '', phone: '', country: f.country, resume_text: '' })
      setTags([])
      onAdded()
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <Panel>
      <Section title="Add a candidate" description="For referrals or people you found yourself. They start in the first stage.">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="ac-name"><Input id="ac-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="off" /></Field>
          <Field label="Email" htmlFor="ac-email"><Input id="ac-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>
          <Field label="Phone" htmlFor="ac-phone" hint="With country code, e.g. +91 98765 43210"><Input id="ac-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="off" /></Field>
          <Field label="Country" htmlFor="ac-country"><NativeSelect id="ac-country" value={f.country} onChange={(v) => setF({ ...f, country: v })} options={COUNTRIES} /></Field>
          <Field label="Résumé text (optional)" htmlFor="ac-cv" className="sm:col-span-2" hint="Paste it to screen them right away.">
            <Textarea id="ac-cv" rows={3} value={f.resume_text} onChange={(e) => setF({ ...f, resume_text: e.target.value })} />
          </Field>
          <div className="sm:col-span-2"><ChipInput label="Tags" value={tags} onChange={setTags} placeholder="e.g. react, campus-2026" /></div>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <Checkbox checked={referral} onCheckedChange={(v) => setReferral(v === true)} /> This is a referral
          </label>
          <div className="space-y-2 sm:col-span-2">
            <InlineError message={error} />
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />} Add candidate</Button>
          </div>
        </form>
      </Section>
    </Panel>
  )
}

function CsvImport({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const addToast = useToast()
  const [preview, setPreview] = useState<{ name: string; text: string; valid: CsvCandidate[]; invalid: number } | null>(null)
  const [failures, setFailures] = useState<{ line: number; error?: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const read = async (file: File) => {
    setError(null)
    setFailures([])
    if (file.size > 2 * 1024 * 1024) return setError('Keep CSV files under 2 MB.')
    const text = await file.text()
    const { valid, invalid } = csvToCandidates(parseCsv(text))
    if (!valid.length) return setError('No rows with a name and an email or phone. Check the header row.')
    if (valid.length > 1000) return setError('Import up to 1,000 rows at a time.')
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
      addToast({ type: failed.length ? 'warning' : 'success', title: `${added} candidate${added === 1 ? '' : 's'} imported`, message: failed.length ? `${failed.length} row${failed.length === 1 ? '' : 's'} skipped` : undefined })
      setFailures(failed)
      setPreview(null)
      onAdded()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <Panel>
      <Section title="Import a CSV" description="Header row with name, email, phone, country and resume_url — optionally experience (fresher or experienced), current_ctc, expected_ctc, currency, period and notice_days. Up to 1,000 rows.">
        {!preview ? (
          <Button variant="outline" className="rounded-full" onClick={() => input.current?.click()}><FileUp aria-hidden /> Choose CSV</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{preview.name}</span>: <span className="tabular-nums">{preview.valid.length}</span> ready
              {preview.invalid > 0 && <span className="text-amber-700 dark:text-amber-400">, <span className="tabular-nums">{preview.invalid}</span> look incomplete (missing name or contact)</span>}
            </p>
            <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
              {preview.valid.slice(0, 8).map((c, i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-1.5"><span className="truncate text-foreground">{c.name}</span><span className="truncate text-muted-foreground">{c.email || c.phone}</span></li>
              ))}
              {preview.valid.length > 8 && <li className="px-3 py-1.5 text-xs text-muted-foreground">and {preview.valid.length - 8} more</li>}
            </ul>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Import</Button>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} />
        {failures.length > 0 && (
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-amber-700 dark:text-amber-400">
            {failures.slice(0, 20).map((f) => <li key={f.line}>Line {f.line}: {f.error || 'skipped'}</li>)}
          </ul>
        )}
        <InlineError message={error} />
      </Section>
    </Panel>
  )
}

function TalentPool({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
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
      addToast({ type: failed ? 'warning' : 'success', title: ok.length === 1 ? 'Added to this job' : `${ok.length} added to this job`, message: failed ? `${failed} could not be added` : undefined })
      if (ok.length) onAdded()
    } catch (e) {
      addToast({ type: 'error', title: 'Could not add', message: errorMessage(e) })
    } finally {
      setAdding((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n })
    }
  }
  const list = (pool.data ?? []).filter((s) => !added.has(s.id))
  return (
    <Panel>
      <Section
        title="From your talent pool"
        description="Your organisation's candidates and past job-board applicants who match this job."
        actions={list.length > 1 && <Button size="sm" variant="outline" onClick={() => add(list.slice(0, 10).map((s) => s.id))}><Sparkles aria-hidden /> Add top {Math.min(10, list.length)}</Button>}
      >
        {pool.loading && !pool.data ? (
          <LoadingRows rows={2} />
        ) : pool.error ? (
          <ErrorState compact message={pool.error.message} onRetry={pool.reload} />
        ) : list.length === 0 ? (
          <EmptyState compact illustration="search" title="No matches in your pool yet" description="As candidates apply to other jobs, good fits for this one show up here." />
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
                    {s.kind === 'past_applicant' ? 'Past job-board applicant · ' : ''}
                    {s.missing_must.length ? `Missing ${s.missing_must.slice(0, 2).join(', ')}` : s.reasons[0] || [s.location, s.total_years != null && `${s.total_years} yrs`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={adding.has(s.id)} onClick={() => add([s.id])} aria-label={`Add ${s.name} to this job`}>
                  {adding.has(s.id) ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />} Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  )
}
