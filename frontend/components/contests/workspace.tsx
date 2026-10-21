'use client'

/**
 * Participant workspace for every contest format: pick a task, read the
 * brief, submit (code, flag, predictions CSV, prompt, files or a PR link),
 * see feedback and your submission history.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, LogIn, Play, Send, Upload, XCircle } from 'lucide-react'
import { Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import { FORMATS, taskLanguages } from '@/lib/contests/formats'
import { golfLength } from '@/lib/contests/scoring/code'
import type { ContestPhase, ContestTask, PublicContestView } from '@/lib/contests/types'
import { FormatIcon, PhaseBadge, fmtWhen, jsonApi } from './shared'

interface Sub { id: string; task_id: string; status: string; score: number | null; feedback: string; detail: Record<string, unknown>; files: { id: string; name: string; role: string }[]; created_at: string }
interface Me { entry: { id: string; name: string; kind: string } | null; submissions: Sub[]; certificate_url: string | null }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const textareaCode = 'min-h-[260px] w-full rounded-xl border border-input bg-background p-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ContestWorkspace({ slug }: { slug: string }) {
  const base = `/api/contests/${encodeURIComponent(slug)}`
  const [contest, setContest] = useState<{ contest: PublicContestView; phase: ContestPhase } | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [state, setState] = useState<'loading' | 'signed_out' | 'error' | 'ready'>('loading')
  const [error, setError] = useState('')

  const loadMe = useCallback(async () => {
    const res = await fetch(`${base}/entry`, { credentials: 'include', cache: 'no-store' })
    if (res.status === 401) { setState('signed_out'); return }
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Could not load your entry'); setState('error'); return }
    setMe(d)
  }, [base])

  useEffect(() => {
    Promise.all([jsonApi<{ contest: PublicContestView; phase: ContestPhase }>(base), loadMe()])
      .then(([c]) => { setContest(c); setState((s) => (s === 'loading' ? 'ready' : s)) })
      .catch((e) => { setError((e as Error).message); setState('error') })
  }, [base, loadMe])

  if (state === 'loading') return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>
  if (state === 'signed_out') return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState illustration="locked" title="Sign in to open your workspace" actionLabel="Sign in" actionHref={`/auth/login?redirect=${encodeURIComponent(`/contests/${slug}/workspace`)}`} />
    </div>
  )
  if (state === 'error' || !contest) return <div className="mx-auto max-w-xl px-4 py-20"><EmptyState illustration="error" title="Something went wrong" description={error} actionLabel="Back to contests" actionHref="/contests" /></div>
  if (!me?.entry) return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState illustration="hackathon" title="Join the contest first" description="Register on the contest page, then come back here to submit." actionLabel="Open contest" actionHref={`/contests/${slug}`} />
    </div>
  )

  const c = contest.contest
  const meta = FORMATS[c.format]
  const live = contest.phase === 'live'
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href={`/contests/${c.slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> Contest page</Link>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary"><FormatIcon format={c.format} className="h-4 w-4" /> {meta.label} · {me.entry.name}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{c.title}</h1>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <PhaseBadge phase={contest.phase} />
          <Countdown endsAt={c.schedule.ends_at} tz={c.schedule.timezone} live={live} />
        </div>
      </header>
      {!live && <Panel className="text-sm text-muted-foreground">{contest.phase === 'registration' || contest.phase === 'upcoming' ? `Submissions open ${fmtWhen(c.schedule.starts_at, c.schedule.timezone)}.` : 'Submissions are closed. Your history is below.'}</Panel>}
      {live && <FormatPane contest={c} base={base} subs={me.submissions} onSubmitted={loadMe} />}
      <History subs={me.submissions} contest={c} base={base} />
    </div>
  )
}

function Countdown({ endsAt, tz, live }: { endsAt: string; tz: string; live: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!live) return; const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [live])
  if (!live) return <p className="text-sm text-muted-foreground">Ends {fmtWhen(endsAt, tz)}</p>
  const left = Math.max(0, Date.parse(endsAt) - now)
  const h = Math.floor(left / 3600_000)
  const m = Math.floor((left % 3600_000) / 60_000)
  return <p className="font-mono text-sm tabular-nums text-foreground" aria-live="polite">{h}h {m}m left</p>
}

function useSubmit(base: string, onDone: () => Promise<void> | void) {
  const addToast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const call = async (key: string, url: string, init: RequestInit, okTitle?: string) => {
    setBusy(key)
    try {
      const d = await jsonApi<Record<string, unknown>>(`${base}${url}`, init)
      setResult(d)
      if (okTitle) addToast({ type: 'success', title: okTitle })
      await onDone()
      return d
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
      return null
    } finally { setBusy(null) }
  }
  return { busy, result, setResult, call }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function FormatPane({ contest: c, base, subs, onSubmitted }: { contest: PublicContestView; base: string; subs: Sub[]; onSubmitted: () => Promise<void> }) {
  const meta = FORMATS[c.format]
  if (meta.submission === 'csv') return <DatathonPane c={c} base={base} onSubmitted={onSubmitted} />
  if (meta.submission === 'files') return <FilesPane c={c} base={base} onSubmitted={onSubmitted} />
  if (meta.submission === 'pr_url') return <PrPane c={c} base={base} onSubmitted={onSubmitted} />
  return <TaskPane c={c} base={base} subs={subs} onSubmitted={onSubmitted} />
}

function bestFor(subs: Sub[], taskId: string): number | null {
  const s = subs.filter((x) => x.task_id === taskId && typeof x.score === 'number')
  return s.length ? Math.max(...s.map((x) => x.score as number)) : null
}

function TaskPane({ c, base, subs, onSubmitted }: { c: PublicContestView; base: string; subs: Sub[]; onSubmitted: () => Promise<void> }) {
  const meta = FORMATS[c.format]
  const tasks = c.config.tasks
  const [active, setActive] = useState(tasks[0]?.id || '')
  const task = tasks.find((t) => t.id === active) || tasks[0]
  if (!task) return <Panel><p className="text-sm text-muted-foreground">No {meta.task?.plural.toLowerCase() || 'tasks'} yet.</p></Panel>
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <nav aria-label={meta.task?.plural || 'Tasks'} className="flex gap-2 overflow-x-auto lg:flex-col">
        {tasks.map((t, i) => {
          const solved = c.format === 'ctf' ? subs.some((s) => s.task_id === t.id && s.detail?.correct === true) : null
          const best = bestFor(subs, t.id)
          return (
            <button key={t.id} type="button" onClick={() => setActive(t.id)} aria-current={t.id === task.id ? 'true' : undefined}
              className={cn('min-h-11 shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                t.id === task.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40')}>
              <span className="block font-medium">{str(t.title) || `${meta.task?.label} ${i + 1}`}</span>
              <span className="block text-xs text-muted-foreground">
                {c.format === 'ctf' ? `${str(t.category)} · ${Number(t.initial_points) || 0} pts${solved ? ' · solved' : ''}` : `${Number(t.points) || 100} pts${best !== null ? ` · best ${best}` : ''}`}
              </span>
            </button>
          )
        })}
      </nav>
      <div className="min-w-0 space-y-4">
        <TaskBrief c={c} task={task} />
        {meta.submission === 'code' && <CodeSubmit key={task.id} c={c} task={task} base={base} onSubmitted={onSubmitted} />}
        {meta.submission === 'flag' && <FlagSubmit key={task.id} c={c} task={task} base={base} solved={subs.some((s) => s.task_id === task.id && s.detail?.correct === true)} onSubmitted={onSubmitted} />}
        {meta.submission === 'prompt' && <PromptSubmit key={task.id} c={c} task={task} base={base} used={subs.length} onSubmitted={onSubmitted} />}
      </div>
    </div>
  )
}

function Pre({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">{text || '(empty)'}</pre>
    </div>
  )
}

function TaskBrief({ c, task }: { c: PublicContestView; task: ContestTask }) {
  const examples = (Array.isArray(task.examples) ? task.examples : []) as { input: string; output: string }[]
  const samples = (Array.isArray(task.samples) ? task.samples : []) as { input: string; expected: string }[]
  const body = str(task.brief) || str(task.statement) || str(task.description) || str(task.notes) || str(task.goal) || str(task.hint)
  return (
    <Panel className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">{str(task.title)}</h2>
      {body && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{body}</p>}
      {str(task.io) && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{str(task.io)}</p>}
      {c.format === 'reverse_coding' && str(task.hint) && body !== str(task.hint) && <p className="text-sm text-muted-foreground">Hint: {str(task.hint)}</p>}
      {str(task.attachment_url) && <a className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline" href={str(task.attachment_url)} target="_blank" rel="noopener noreferrer nofollow"><Download className="h-4 w-4" aria-hidden /> Attachment</a>}
      {examples.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {examples.map((e, i) => <div key={i} className="space-y-2"><Pre label={`Example ${i + 1} input`} text={e.input} /><Pre label="Output" text={e.output} /></div>)}
        </div>
      )}
      {samples.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {samples.map((e, i) => <div key={i} className="space-y-2"><Pre label={`Sample ${i + 1} input`} text={e.input} /><Pre label="Expected output" text={e.expected} /></div>)}
        </div>
      )}
      {c.format === 'ctf' && <p className="text-xs text-muted-foreground">Flag format: <span className="font-mono">{str(c.config.flag_format) || 'flag{...}'}</span></p>}
    </Panel>
  )
}

function CodeSubmit({ c, task, base, onSubmitted }: { c: PublicContestView; task: ContestTask; base: string; onSubmitted: () => Promise<void> }) {
  const langs = taskLanguages(task)
  const [language, setLanguage] = useState(langs[0])
  const [code, setCode] = useState(c.format === 'debug_a_thon' ? str(task.buggy_code) : '')
  const [bbInput, setBbInput] = useState('')
  const [bbOut, setBbOut] = useState<string | null>(null)
  const { busy, result, call } = useSubmit(base, onSubmitted)
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null)
  const sub = (result?.submission || null) as Sub | null
  return (
    <>
      {c.format === 'reverse_coding' && Number(c.config.blackbox_runs_per_hour ?? 20) > 0 && (
        <Panel className="space-y-3">
          <h3 className="font-semibold text-foreground">Run the black box</h3>
          <Label htmlFor="bb-in">Input</Label>
          <Textarea id="bb-in" value={bbInput} onChange={(e) => setBbInput(e.target.value)} className="font-mono text-sm" rows={3} />
          <Button variant="outline" disabled={busy === 'bb'} onClick={async () => {
            const d = await call('bb', '/run', json({ mode: 'blackbox', task_id: task.id, input: bbInput }))
            if (d) setBbOut(d.failed ? 'The black box rejected that input.' : String(d.output ?? ''))
          }}>{busy === 'bb' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Play className="h-4 w-4" />} Run</Button>
          {bbOut !== null && <Pre label="Output" text={bbOut} />}
          <p className="text-xs text-muted-foreground">Up to {Number(c.config.blackbox_runs_per_hour ?? 20)} runs per hour.</p>
        </Panel>
      )}
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="lang">Language</Label>
            <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {langs.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {c.format === 'code_golf' && <p className="font-mono text-sm tabular-nums text-muted-foreground" aria-live="polite">{golfLength(code)} characters</p>}
        </div>
        <Label htmlFor="code" className="sr-only">Code</Label>
        <textarea id="code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} className={textareaCode} placeholder="Write your solution. Read from stdin, print to stdout." />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy || !code.trim()} onClick={async () => setRunResult(await call('run', '/run', json({ mode: 'samples', task_id: task.id, language, code })))}>
            {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Play className="h-4 w-4" />} Run samples
          </Button>
          <Button disabled={!!busy || !code.trim()} onClick={() => void call('submit', '/submissions', json({ task_id: task.id, language, code }), 'Submitted')}>
            {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />} Submit
          </Button>
        </div>
        {runResult && (
          <div className="space-y-2 text-sm" aria-live="polite">
            <p className="font-medium text-foreground">Samples: {String(runResult.passed)} of {String(runResult.total)} pass</p>
            {typeof runResult.error === 'string' && runResult.error && <Pre label="Error" text={runResult.error} />}
          </div>
        )}
        {sub && <Feedback sub={sub} />}
      </Panel>
    </>
  )
}

function Feedback({ sub }: { sub: Sub }) {
  const good = sub.status === 'scored' && (sub.detail?.correct === true || (typeof sub.score === 'number' && sub.score > 0) || sub.detail?.all_passed === true)
  return (
    <p className={cn('flex items-center gap-2 text-sm', good ? 'text-green-700 dark:text-green-400' : 'text-foreground')} aria-live="polite">
      {good ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden />} {sub.feedback}
    </p>
  )
}

function FlagSubmit({ c, task, base, solved, onSubmitted }: { c: PublicContestView; task: ContestTask; base: string; solved: boolean; onSubmitted: () => Promise<void> }) {
  const [flag, setFlag] = useState('')
  const { busy, result, call } = useSubmit(base, onSubmitted)
  if (solved) return <Panel><p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" aria-hidden /> Solved.</p></Panel>
  return (
    <Panel>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const d = await call('flag', '/submissions', json({ task_id: task.id, flag })); if (d) setFlag('') }}>
        <Label htmlFor="flag">Flag</Label>
        <div className="flex gap-2">
          <Input id="flag" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder={str(c.config.flag_format) || 'flag{...}'} autoComplete="off" spellCheck={false} className="font-mono" />
          <Button type="submit" disabled={!!busy || !flag.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />} Submit</Button>
        </div>
        {result?.submission ? <Feedback sub={result.submission as Sub} /> : null}
      </form>
    </Panel>
  )
}

function PromptSubmit({ c, task, base, used, onSubmitted }: { c: PublicContestView; task: ContestTask; base: string; used: number; onSubmitted: () => Promise<void> }) {
  const [prompt, setPrompt] = useState('')
  const { busy, result, call } = useSubmit(base, onSubmitted)
  const max = Number(c.config.max_prompt_chars) || 2000
  const cap = Number(c.config.runs_per_user) || 10
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="prompt">Your prompt</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{prompt.length} / {max} · {Math.max(0, cap - used)} runs left</span>
      </div>
      <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, max))} rows={8} placeholder="Tell the model how to turn each input into the answer." />
      <p className="text-xs text-muted-foreground">We run it on our model against a hidden set of inputs. Prompts that try to reveal hidden data or change the model’s rules are rejected.</p>
      <Button disabled={!!busy || prompt.trim().length < 10 || used >= cap} onClick={() => void call('prompt', '/submissions', json({ task_id: task.id, prompt }), 'Run finished')}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Play className="h-4 w-4" />} Run on the eval set
      </Button>
      {result?.submission ? <Feedback sub={result.submission as Sub} /> : null}
    </Panel>
  )
}

function DatathonPane({ c, base, onSubmitted }: { c: PublicContestView; base: string; onSubmitted: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const { busy, result, call } = useSubmit(base, onSubmitted)
  const upload = () => {
    if (!file) return
    const fd = new FormData()
    fd.append('predictions', file)
    void call('csv', '/submissions', { method: 'POST', body: fd }, 'Scored')
  }
  return (
    <Panel className="space-y-4">
      {str(c.config.dataset_url) && <a href={str(c.config.dataset_url)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"><Download className="h-4 w-4" aria-hidden /> Download the dataset <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
      <p className="text-sm text-muted-foreground">
        Upload a CSV with columns <span className="font-mono">{str(c.config.id_column) || 'id'}</span> and <span className="font-mono">{str(c.config.target_column) || 'target'}</span>, one row per test id.
        Metric: {str(c.config.metric) || 'accuracy'} ({c.config.metric === 'rmse' || c.config.metric === 'mae' ? 'lower is better' : 'higher is better'}).
        The live board uses {Number(c.config.public_percent) || 30}% of rows; the rest decide the final board. Up to {Number(c.config.submissions_per_day) || 5} uploads a day.
      </p>
      <div className="space-y-2">
        <Label htmlFor="preds">Predictions CSV</Label>
        <Input id="preds" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <Button disabled={!file || !!busy} onClick={upload}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Upload className="h-4 w-4" />} Upload and score</Button>
      {result?.submission ? <Feedback sub={result.submission as Sub} /> : null}
    </Panel>
  )
}

function FilesPane({ c, base, onSubmitted }: { c: PublicContestView; base: string; onSubmitted: () => Promise<void> }) {
  const meta = FORMATS[c.format]
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const { busy, result, call } = useSubmit(base, onSubmitted)
  const design = c.format === 'system_design_jam'
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text])
  const submit = () => {
    const fd = new FormData()
    fd.append('text', text)
    for (const [role, f] of Object.entries(files)) if (f) fd.append(role, f)
    void call('files', '/submissions', { method: 'POST', body: fd }, 'Submitted for judging')
  }
  return (
    <Panel className="space-y-4">
      {(str(c.config.brief) || str(c.config.prompt)) && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{str(c.config.brief) || str(c.config.prompt)}</p>}
      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label htmlFor="writeup">{design ? 'Design write-up' : 'Summary of your idea'}</Label>{design && <span className="text-xs tabular-nums text-muted-foreground">{words} / {Number(c.config.max_words) || 2000} words</span>}</div>
        <Textarea id="writeup" value={text} onChange={(e) => setText(e.target.value)} rows={design ? 14 : 5} placeholder={design ? 'Components, data flow, storage, scaling, trade-offs…' : 'The problem, your idea, who it helps.'} />
      </div>
      {(meta.files || []).map((slot) => (
        <div key={slot.role} className="space-y-1">
          <Label htmlFor={`f-${slot.role}`}>{slot.label}{slot.required || (slot.role === 'video' && c.config.video_required !== false) ? '' : ' (optional)'}</Label>
          <Input id={`f-${slot.role}`} type="file" accept={slot.exts.map((e) => `.${e}`).join(',')} onChange={(e) => setFiles((f) => ({ ...f, [slot.role]: e.target.files?.[0] || null }))} />
          <p className="text-xs text-muted-foreground">Up to {Math.round(slot.maxBytes / 1024 / 1024)} MB.</p>
        </div>
      ))}
      <Button disabled={!!busy || text.trim().length < 20} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />} Submit</Button>
      <p className="text-xs text-muted-foreground">You can resubmit until the end; judges score your latest version.</p>
      {result?.submission ? <Feedback sub={result.submission as Sub} /> : null}
    </Panel>
  )
}

function PrPane({ c, base, onSubmitted }: { c: PublicContestView; base: string; onSubmitted: () => Promise<void> }) {
  const [url, setUrl] = useState('')
  const { busy, result, call } = useSubmit(base, onSubmitted)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel className="space-y-3">
        <h2 className="font-semibold text-foreground">Repositories</h2>
        <ul className="space-y-3">
          {c.config.tasks.map((t) => (
            <li key={t.id}>
              <a href={str(t.url)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">{str(t.title) || str(t.url)} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
              {str(t.note) && <p className="text-sm text-muted-foreground">{str(t.note)}</p>}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const d = await call('pr', '/submissions', json({ pr_url: url }), 'Pull request counted'); if (d) setUrl('') }}>
          <Label htmlFor="pr">Merged pull request link</Label>
          <Input id="pr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" inputMode="url" autoComplete="off" />
          <p className="text-xs text-muted-foreground">It must be merged during the sprint and opened from the GitHub username on your entry ({Number(c.config.points_per_pr) || 10} points each).</p>
          <Button type="submit" disabled={!!busy || !url.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />} Check and count</Button>
          {result?.submission ? <Feedback sub={result.submission as Sub} /> : null}
        </form>
      </Panel>
    </div>
  )
}

function History({ subs, contest: c, base }: { subs: Sub[]; contest: PublicContestView; base: string }) {
  const titleOf = (id: string) => str(c.config.tasks.find((t) => t.id === id)?.title)
  return (
    <Section title="Your submissions">
      <Panel>
        {subs.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing submitted yet.</p> : (
          <ul className="divide-y divide-border">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{titleOf(s.task_id) || FORMATS[c.format].label}</p>
                  <p className="text-muted-foreground">{s.feedback}</p>
                  {s.files?.length > 0 && (
                    <p className="flex flex-wrap gap-3">{s.files.map((f) => <a key={f.id} className="text-primary underline-offset-4 hover:underline" href={`${base}/files/${f.id}`}>{f.name}</a>)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">{s.status === 'pending_review' ? 'Awaiting judges' : s.score === null ? '–' : s.score}</span>
                  <time dateTime={s.created_at}>{new Date(s.created_at).toLocaleString()}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  )
}

