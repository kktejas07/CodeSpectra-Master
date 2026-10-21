'use client'

/**
 * Candidate inputs for the wave-6 question types — system design, case study,
 * typing test, file upload, video response — plus the reverse-coding black-box
 * runner. Rendered by QuestionAnswerInput (which passes itself as `SubInput`
 * so case-study parts reuse the objective inputs without a circular import).
 * Answer encodings: lib/question-extensions.ts.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { AlertTriangle, Camera, CheckCircle2, FileUp, Loader2, Play, RotateCcw, Square, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { directUpload, uploadLimits } from '@/lib/storage/direct-upload-client'
import { canonicalType } from '@/lib/question-types'
import {
  ANSWER_FILE_MAX_MB, BLACK_BOX_INPUT_MAX, UPLOAD_FILE_KINDS, VIDEO_MAX_SECONDS, acceptForKinds, parseJsonAnswer,
  type CaseSubQuestion, type TypingConfig, type UploadConfig, type VideoConfig,
} from '@/lib/question-extensions'
import { typingStats } from '@/lib/grading-extended'

export interface ExamContext {
  examId: string
  inviteToken?: string | null
  linkToken?: string | null
}

export interface ExtendedQuestion {
  id: string
  type: string
  prompt?: string
  allow_diagram?: boolean
  sub_questions?: Pick<CaseSubQuestion, 'id' | 'type' | 'prompt' | 'options' | 'points'>[]
  typing?: TypingConfig
  upload?: UploadConfig
  video?: VideoConfig
  black_box_runs?: number
}

type SubInputProps = {
  question: { id: string; type: string; prompt?: string; options?: string[] }
  value: string | string[] | undefined
  onChange: (value: string | string[]) => void
  readOnly?: boolean
}

interface Props {
  question: ExtendedQuestion
  value: string | string[] | undefined
  onChange: (value: string | string[]) => void
  readOnly?: boolean
  examContext?: ExamContext
  SubInput: ComponentType<SubInputProps>
}

const areaCls = 'w-full rounded-lg border border-border bg-card p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50'
const noteCls = 'rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300'
const errCls = 'rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'

function str(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function fmtSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

async function uploadAnswerFile(ctx: ExamContext, questionId: string, file: Blob, name: string, extra?: Record<string, string>): Promise<{ id: string; name: string; size: number; type: string; duration_s?: number }> {
  // Object storage on: bytes go straight to the private bucket (large videos); otherwise the multipart route below.
  const tokens = { inviteToken: ctx.inviteToken || null, linkToken: ctx.linkToken || null }
  const direct = await directUpload<{ file?: { id: string; name: string; size: number; type: string; duration_s?: number } }>({
    url: `/api/exams/${encodeURIComponent(ctx.examId)}/answer-files/direct`,
    file,
    start: { question_id: questionId, name, ...tokens },
    finish: () => ({ question_id: questionId, ...tokens, ...(extra?.duration_s ? { duration_s: Number(extra.duration_s) } : {}) }),
  })
  if (!direct.inline) {
    if (!direct.data.file) throw new Error('Upload failed. Try again.')
    return direct.data.file
  }
  const fd = new FormData()
  fd.append('file', file, name)
  fd.append('question_id', questionId)
  if (ctx.inviteToken) fd.append('inviteToken', ctx.inviteToken)
  if (ctx.linkToken) fd.append('linkToken', ctx.linkToken)
  for (const [k, v] of Object.entries(extra || {})) fd.append(k, v)
  const res = await csrfFetch(`/api/exams/${encodeURIComponent(ctx.examId)}/answer-files`, { method: 'POST', body: fd, credentials: 'include' })
  const j = (await res.json().catch(() => ({}))) as { error?: string; file?: { id: string; name: string; size: number; type: string; duration_s?: number } }
  if (!res.ok || !j.file) throw new Error(j.error || 'Upload failed. Try again.')
  return j.file
}

// ─── System design ───────────────────────────────────────────────────────────

function SystemDesignInput({ question, value, onChange, readOnly }: Omit<Props, 'SubInput' | 'examContext'>) {
  const a = parseJsonAnswer(str(value))
  const legacyText = !Object.keys(a).length ? str(value) : ''
  const text = typeof a.text === 'string' ? a.text : legacyText
  const diagram = typeof a.diagram === 'string' ? a.diagram : ''
  const write = (t: string, d: string) => onChange(JSON.stringify(question.allow_diagram ? { text: t, diagram: d } : { text: t }))
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`sd-text-${question.id}`} className="text-sm font-medium text-muted-foreground">Your design</label>
        <textarea
          id={`sd-text-${question.id}`}
          value={text}
          disabled={readOnly}
          onChange={(e) => write(e.target.value, diagram)}
          placeholder="Requirements, APIs, data model, components, scaling, trade-offs…"
          className={`${areaCls} h-72 resize-y`}
        />
      </div>
      {question.allow_diagram && (
        <div className="space-y-1.5">
          <label htmlFor={`sd-diagram-${question.id}`} className="text-sm font-medium text-muted-foreground">Diagram (optional — plain text or Mermaid)</label>
          <textarea
            id={`sd-diagram-${question.id}`}
            value={diagram}
            disabled={readOnly}
            onChange={(e) => write(text, e.target.value)}
            placeholder={'graph LR\n  Client --> LB[Load balancer]\n  LB --> API\n  API --> DB[(Database)]'}
            spellCheck={false}
            className={`${areaCls} h-48 resize-y font-mono text-xs`}
          />
        </div>
      )}
    </div>
  )
}

// ─── Case study ──────────────────────────────────────────────────────────────

function CaseStudyInput({ question, value, onChange, readOnly, SubInput }: Omit<Props, 'examContext'>) {
  const subs = question.sub_questions || []
  const map = parseJsonAnswer(str(value)) as Record<string, string | string[]>
  if (!subs.length) {
    return (
      <textarea aria-label="Your answer" value={str(value)} disabled={readOnly} onChange={(e) => onChange(e.target.value)} placeholder="Write your response here…" className={`${areaCls} h-72 resize-y`} />
    )
  }
  return (
    <ol className="space-y-5">
      {subs.map((s, i) => (
        <li key={s.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground"><span className="tabular-nums text-muted-foreground">{String.fromCharCode(97 + i)}) </span>{s.prompt}</p>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{s.points} pt{s.points === 1 ? '' : 's'}</span>
          </div>
          <SubInput
            question={{ id: `${question.id}__${s.id}`, type: s.type, prompt: s.prompt, options: s.options }}
            value={map[s.id]}
            readOnly={readOnly}
            onChange={(v) => onChange(JSON.stringify({ ...map, [s.id]: v }))}
          />
        </li>
      ))}
    </ol>
  )
}

// ─── Typing test ─────────────────────────────────────────────────────────────

function TypingTestInput({ question, value, onChange, readOnly }: Omit<Props, 'SubInput' | 'examContext'>) {
  const cfg = question.typing
  const a = parseJsonAnswer(str(value))
  const typed = typeof a.typed === 'string' ? a.typed : ''
  const storedElapsed = Number(a.elapsed_ms) || 0
  const [start, setStart] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const limitMs = (cfg?.time_limit_seconds || 0) * 1000
  const elapsed = start !== null ? now - start : storedElapsed
  const timeUp = limitMs > 0 && elapsed >= limitMs
  const done = !!cfg && typed.length >= cfg.passage.length

  useEffect(() => {
    if (start === null || timeUp || done) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [start, timeUp, done])

  if (!cfg?.passage) return <p className={noteCls}>This typing test has no passage yet.</p>
  const stats = typingStats(cfg.passage, typed, Math.max(storedElapsed, elapsed))

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Type the passage exactly. The timer starts with your first key. Target: <span className="tabular-nums">{cfg.min_wpm}</span> words per minute at <span className="tabular-nums">{cfg.min_accuracy}%</span> accuracy.
        {limitMs > 0 && <> Time limit: <span className="tabular-nums">{cfg.time_limit_seconds}</span> seconds.</>}
      </p>
      <div
        className="select-none whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 text-[15px] leading-relaxed"
        onCopy={(e) => e.preventDefault()}
        aria-label="Passage to type"
      >
        {cfg.passage.split('').map((ch, i) => (
          <span key={i} className={i < typed.length ? (typed[i] === ch ? 'text-green-700 dark:text-green-400' : 'bg-destructive/15 text-destructive') : i === typed.length ? 'border-b-2 border-primary' : 'text-foreground'}>{ch}</span>
        ))}
      </div>
      <textarea
        aria-label="Type the passage here"
        value={typed}
        disabled={readOnly || timeUp}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onChange={(e) => {
          const t = Date.now()
          // Resume from the saved time after a reload; the clock starts on the first key.
          const s0 = start ?? t - storedElapsed
          if (start === null) setStart(s0)
          setNow(t)
          const next = e.target.value.slice(0, cfg.passage.length)
          onChange(JSON.stringify({ typed: next, elapsed_ms: t - s0 }))
        }}
        className={`${areaCls} h-40 resize-none font-mono`}
      />
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[['Speed', `${stats.wpm} WPM`], ['Accuracy', `${stats.accuracy}%`], ['Time', `${Math.floor(stats.minutes * 60)} s`]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-mono text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {(timeUp || done) && <p className="text-sm text-muted-foreground">{timeUp ? 'Time is up for this passage.' : 'Passage complete.'} Your result is saved with your answers.</p>}
    </div>
  )
}

// ─── File upload ─────────────────────────────────────────────────────────────

function FileUploadInput({ question, value, onChange, readOnly, examContext }: Omit<Props, 'SubInput'>) {
  const cfg: UploadConfig = question.upload || { allowed: ['pdf'], max_mb: 5 }
  const a = parseJsonAnswer(str(value))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labels = UPLOAD_FILE_KINDS.filter((k) => cfg.allowed.includes(k.id)).map((k) => k.label).join(', ')
  const maxMb = Math.min(ANSWER_FILE_MAX_MB, cfg.max_mb)

  const pick = async (file: File | undefined) => {
    if (!file || !examContext) return
    setError(null)
    if (file.size > maxMb * 1048576) { setError(`Files must be under ${maxMb} MB.`); return }
    setBusy(true)
    try {
      const f = await uploadAnswerFile(examContext, question.id, file, file.name)
      onChange(JSON.stringify({ file_id: f.id, name: f.name, size: f.size, type: f.type }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Allowed: {labels || 'PDF'} · up to <span className="tabular-nums">{maxMb}</span> MB.</p>
      {a.file_id ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{String(a.name || 'Uploaded file')}</span>
          <span className="tabular-nums text-muted-foreground">{fmtSize(Number(a.size) || 0)}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No file uploaded yet.</p>
      )}
      {!examContext ? (
        <p className={noteCls}>Uploads work when the candidate takes the live test.</p>
      ) : !readOnly && (
        <>
          <input ref={inputRef} type="file" accept={acceptForKinds(cfg.allowed)} className="sr-only" id={`file-${question.id}`} onChange={(e) => void pick(e.target.files?.[0])} />
          <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
            {busy ? 'Uploading…' : a.file_id ? 'Replace file' : 'Choose file'}
          </Button>
        </>
      )}
      {error && <p role="alert" className={errCls}>{error}</p>}
    </div>
  )
}

// ─── Video response ──────────────────────────────────────────────────────────

type VideoPhase = 'idle' | 'asking' | 'ready' | 'recording' | 'recorded' | 'uploading'

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* keep looking */ }
  }
  return ''
}

function VideoResponseInput({ question, value, onChange, readOnly, examContext }: Omit<Props, 'SubInput'>) {
  const cfg: VideoConfig = question.video || { max_seconds: 120, retakes: 1, allow_text_alternative: true }
  const maxSeconds = Math.min(VIDEO_MAX_SECONDS, cfg.max_seconds)
  const a = parseJsonAnswer(str(value))
  const [takes, setTakes] = useState(() => Number(a.takes) || (a.file_id ? 1 : 0))
  const [phase, setPhase] = useState<VideoPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<{ data: Blob; url: string; mime: string; duration: number } | null>(null)
  const [textMode, setTextMode] = useState(typeof a.text_alternative === 'string' && !a.file_id)
  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const startedRef = useRef(0)
  const urlRef = useRef<string | null>(null)
  // Recording size budget: the multipart cap, or the direct-upload cap when object storage is on.
  const [capMb, setCapMb] = useState(ANSWER_FILE_MAX_MB)
  useEffect(() => { void uploadLimits().then((l) => { if (l.direct && l.video_max_mb > ANSWER_FILE_MAX_MB) setCapMb(l.video_max_mb) }) }, [])
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!pickMime()
  // Every recording counts as a take (first take + the author's retakes).
  const retakesLeft = Math.max(0, cfg.retakes + 1 - takes)

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedRef.current) / 1000)
      setSeconds(s)
      if (s >= maxSeconds) recRef.current?.stop()
    }, 250)
    return () => clearInterval(t)
  }, [phase, maxSeconds])

  const openCamera = async () => {
    setError(null)
    setPhase('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true })
      streamRef.current = stream
      setPhase('ready')
      requestAnimationFrame(() => { if (liveRef.current) { liveRef.current.srcObject = stream; void liveRef.current.play().catch(() => {}) } })
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera or microphone access is blocked. Allow both for this site in your browser settings, then try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera or microphone was found. Connect one and try again.'
          : name === 'NotReadableError'
            ? 'Your camera is in use by another app. Close it and try again.'
            : 'The camera could not start. Try again, or use another browser.')
      setPhase('idle')
    }
  }

  const start = () => {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickMime()
    // Keep a full-length recording under the upload cap (≈90% of it, video + 64 kbps audio).
    const bits = Math.min(capMb > ANSWER_FILE_MAX_MB ? 2_500_000 : 1_000_000, Math.floor((capMb * 8 * 1048576 * 0.9) / maxSeconds) - 64_000)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.max(150_000, bits), audioBitsPerSecond: 64_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }
    rec.onstop = () => {
      const data = new Blob(chunks, { type: mime.split(';')[0] })
      const duration = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(data)
      urlRef.current = url
      setBlob({ data, url, mime, duration })
      stopStream()
      setPhase('recorded')
    }
    recRef.current = rec
    startedRef.current = Date.now()
    setSeconds(0)
    rec.start(1000)
    setTakes((n) => n + 1)
    setPhase('recording')
  }

  const upload = async () => {
    if (!blob || !examContext) return
    setPhase('uploading')
    setError(null)
    try {
      const ext = blob.mime.includes('mp4') ? 'mp4' : 'webm'
      const f = await uploadAnswerFile(examContext, question.id, blob.data, `answer.${ext}`, { duration_s: String(blob.duration) })
      onChange(JSON.stringify({ file_id: f.id, name: f.name, size: f.size, duration_s: blob.duration, takes }))
      setPhase('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.')
      setPhase('recorded')
    }
  }

  const textAlt = typeof a.text_alternative === 'string' ? a.text_alternative : ''

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Record up to <span className="tabular-nums">{maxSeconds}</span> seconds. {cfg.retakes > 0 ? <>You can retake <span className="tabular-nums">{cfg.retakes}</span> time{cfg.retakes === 1 ? '' : 's'}.</> : 'One take only.'}
      </p>
      {!!a.file_id && phase === 'idle' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
          <span className="flex-1">Recording saved (<span className="tabular-nums">{Math.round(Number(a.duration_s) || 0)}</span> s).</span>
        </div>
      )}

      {!examContext ? (
        <p className={noteCls}>Recording works when the candidate takes the live test.</p>
      ) : textMode ? (
        <div className="space-y-2">
          <label htmlFor={`va-text-${question.id}`} className="text-sm font-medium text-muted-foreground">Your answer in writing</label>
          <textarea id={`va-text-${question.id}`} value={textAlt} disabled={readOnly} onChange={(e) => onChange(JSON.stringify({ text_alternative: e.target.value }))} className={`${areaCls} h-48 resize-y`} />
          {supported && !readOnly && <Button type="button" variant="ghost" size="sm" onClick={() => setTextMode(false)}>Record a video instead</Button>}
        </div>
      ) : !supported ? (
        <p className={noteCls}>This browser can’t record video.{cfg.allow_text_alternative ? ' You can type your answer instead.' : ' Try a recent Chrome, Edge, Firefox or Safari.'}</p>
      ) : !readOnly && (
        <div className="space-y-3">
          {(phase === 'ready' || phase === 'recording') && (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
              <video ref={liveRef} muted playsInline className="aspect-video w-full object-cover" aria-label="Camera preview" />
              {phase === 'recording' && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 font-mono text-xs tabular-nums text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden /> {seconds}s / {maxSeconds}s
                </span>
              )}
            </div>
          )}
          {(phase === 'recorded' || phase === 'uploading') && blob && (
            <video src={blob.url} controls playsInline className="aspect-video w-full rounded-2xl border border-border bg-black" aria-label="Your recording" />
          )}
          <div className="flex flex-wrap gap-2">
            {(phase === 'idle' || phase === 'asking') && retakesLeft > 0 && (
              <Button type="button" className="min-h-11 gap-2" onClick={() => void openCamera()} disabled={phase === 'asking'}>
                {phase === 'asking' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                {a.file_id ? 'Retake' : 'Turn on camera'}
              </Button>
            )}
            {phase === 'ready' && <Button type="button" className="min-h-11 gap-2" onClick={start}><Play className="h-4 w-4" aria-hidden /> Start recording</Button>}
            {phase === 'recording' && <Button type="button" variant="destructive" className="min-h-11 gap-2" onClick={() => recRef.current?.stop()}><Square className="h-4 w-4" aria-hidden /> Stop</Button>}
            {phase === 'recorded' && (
              <>
                <Button type="button" className="min-h-11 gap-2" onClick={() => void upload()}><Upload className="h-4 w-4" aria-hidden /> Use this recording</Button>
                {retakesLeft > 0 && <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => { setBlob(null); void openCamera() }}><RotateCcw className="h-4 w-4" aria-hidden /> Record again</Button>}
              </>
            )}
            {phase === 'uploading' && <Button type="button" disabled className="min-h-11 gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Uploading…</Button>}
            {phase === 'idle' && retakesLeft === 0 && <p className="text-sm text-muted-foreground">You’ve used all your takes.</p>}
          </div>
        </div>
      )}
      {examContext && !textMode && cfg.allow_text_alternative && !readOnly && phase === 'idle' && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setTextMode(true)}>Can’t record? Type your answer instead</Button>
      )}
      {error && <p role="alert" className={errCls}><AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden />{error}</p>}
    </div>
  )
}

// ─── Reverse coding: black-box runner ────────────────────────────────────────

export function BlackBoxRunner({ questionId, runs, examContext }: { questionId: string; runs: number; examContext?: ExamContext }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(runs)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  if (!examContext) return <p className={noteCls}>The black-box runner works when the candidate takes the live test.</p>
  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examContext.examId)}/black-box`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ question_id: questionId, input, inviteToken: examContext.inviteToken ?? null, linkToken: examContext.linkToken ?? null }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; output?: string; message?: string; error?: string; truncated?: boolean }
      if (res.status === 429) setLeft(0)
      else if (res.ok) setLeft((n) => Math.max(0, n - 1))
      if (!res.ok) setResult({ ok: false, text: j.error || 'Run failed.' })
      else setResult({ ok: !!j.ok, text: j.ok ? `${j.output ?? ''}${j.truncated ? '\n… (output cut)' : ''}` : j.message || 'No output.' })
    } catch {
      setResult({ ok: false, text: 'Network error. Try again.' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Try the black box</p>
        <span className="text-xs text-muted-foreground"><span className="tabular-nums">{left}</span> run{left === 1 ? '' : 's'} left this hour</span>
      </div>
      <p className="text-xs text-muted-foreground">Type an input (stdin) and see what the hidden program prints. Its code is never shown.</p>
      <label htmlFor={`bb-in-${questionId}`} className="sr-only">Black-box input</label>
      <textarea id={`bb-in-${questionId}`} value={input} maxLength={BLACK_BOX_INPUT_MAX} onChange={(e) => setInput(e.target.value)} spellCheck={false} className={`${areaCls} h-24 resize-y font-mono text-xs`} placeholder="e.g. 3 5" />
      <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2" disabled={busy || left <= 0} onClick={() => void run()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Run black box
      </Button>
      {result && (
        <pre aria-live="polite" className={`max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border p-3 font-mono text-xs ${result.ok ? 'border-border bg-muted/40' : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>{result.text || '(no output)'}</pre>
      )}
    </div>
  )
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export function ExtendedAnswerInput(props: Props) {
  const t = useMemo(() => canonicalType(props.question.type), [props.question.type])
  if (t === 'system_design') return <SystemDesignInput {...props} />
  if (t === 'case_study') return <CaseStudyInput {...props} />
  if (t === 'typing_test') return <TypingTestInput {...props} />
  if (t === 'file_upload') return <FileUploadInput {...props} />
  if (t === 'video_response') return <VideoResponseInput {...props} />
  return null
}
