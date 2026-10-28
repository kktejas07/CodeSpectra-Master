'use client'

/**
 * Reviewer view of wave-6 answers on the results page, plus the per-trait
 * psychometric panel. Files are listed from GET /api/exams/[id]/answer-files
 * (only files this candidate really uploaded are linked) and downloaded
 * through the existing staff-only file route; recordings play from a blob so
 * nothing is rendered from the upload's own origin.
 */
import { useEffect, useState } from 'react'
import { Download, Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseCodingAnswer } from '@/lib/coding-answer'
import { canonicalType } from '@/lib/question-types'
import { EXTENDED_INPUT_TYPES, parseJsonAnswer, sanitizeSubQuestions } from '@/lib/question-extensions'
import { gradeCaseStudy, traitScores, typingStats } from '@/lib/grading-extended'
import { useT } from '@/lib/i18n/client'

export interface AnswerFileMeta { id: string; question_id: string; name: string; size: number; type: string; scan_status?: string; duration_s?: number }

const preCls = 'text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto border wrap-break-word'

/** True when this view knows how to render the type. */
export function hasExtendedView(type: string): boolean {
  const t = canonicalType(type)
  return EXTENDED_INPUT_TYPES.has(t) || t === 'theory_to_code' || t === 'reverse_coding'
}

/** Load a candidate's answer files once per review. */
export function useAnswerFiles(examId: string, userId: string | null | undefined): AnswerFileMeta[] {
  const [files, setFiles] = useState<AnswerFileMeta[]>([])
  useEffect(() => {
    if (!userId) return
    let live = true
    fetch(`/api/exams/${encodeURIComponent(examId)}/answer-files?user_id=${encodeURIComponent(userId)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j: { files?: AnswerFileMeta[] }) => { if (live) setFiles(Array.isArray(j.files) ? j.files : []) })
      .catch(() => { if (live) setFiles([]) })
    return () => { live = false }
  }, [examId, userId])
  return files
}

function FileLink({ examId, file, video }: { examId: string; file: AnswerFileMeta; video?: boolean }) {
  const { t } = useT()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const href = `/api/exams/${encodeURIComponent(examId)}/cad-submission/files/${encodeURIComponent(file.id)}`
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const play = async () => {
    setBusy(true)
    try {
      // Bucket-stored recordings: play from a short-lived presigned URL instead of downloading the whole file.
      const p = await fetch(`${href}?mode=play`, { credentials: 'include' })
      if (p.ok && (p.headers.get('content-type') || '').includes('application/json')) {
        const j = (await p.json().catch(() => ({}))) as { url?: string }
        if (j.url && /^https?:\/\//.test(j.url)) { setUrl(j.url); return }
      }
      const r = p.ok && !(p.headers.get('content-type') || '').includes('application/json') ? p : await fetch(href, { credentials: 'include' })
      if (!r.ok) return
      const b = await r.blob()
      setUrl(URL.createObjectURL(new Blob([b], { type: file.type === 'mp4' ? 'video/mp4' : 'video/webm' })))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a href={href} download className="inline-flex items-center gap-1 rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Download className="h-3.5 w-3.5" aria-hidden /> {file.name}
        </a>
        <span className="tabular-nums text-muted-foreground">{file.size >= 1048576 ? t('exam.nMb', { n: (file.size / 1048576).toFixed(1) }) : t('exam.valueKb', { value: Math.max(1, Math.round(file.size / 1024)) })}{file.duration_s ? ` · ${file.duration_s} s` : ''}</span>
        {file.scan_status === 'unscanned' && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">{t('exam.notVirusScanned')}</Badge>}
        {video && !url && (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void play()} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}{' '}{t('exam.playHere')}</Button>
        )}
      </div>
      {url && <video src={url} controls playsInline className="aspect-video w-full max-w-xl rounded-xl border border-border bg-black" aria-label={t('exam.candidateRecording')} />}
    </div>
  )
}

export function ExtendedAnswerView({
  question,
  answer,
  examId,
  files,
}: {
  question: Record<string, unknown> & { id: string; type: string }
  answer: string
  examId: string
  files: AnswerFileMeta[]
}) {
  const { t: tr } = useT()
  const t = canonicalType(question.type)
  if (t === 'theory_to_code' || t === 'reverse_coding') {
    const p = parseCodingAnswer(answer)
    return (
      <div className="space-y-1.5">
        <Badge variant="outline" className="font-mono text-[10px]">{p.language || tr('exam.code')}</Badge>
        <pre className={preCls}>{p.code || '(empty code)'}</pre>
      </div>
    )
  }
  const a = parseJsonAnswer(answer)
  if (t === 'system_design') {
    const text = typeof a.text === 'string' ? a.text : answer
    const diagram = typeof a.diagram === 'string' ? a.diagram : ''
    return (
      <div className="space-y-2">
        <pre className={preCls}>{text || '(empty)'}</pre>
        {diagram && (<><span className="block text-xs font-medium text-muted-foreground">{tr('exam.diagramTextMermaid')}</span><pre className={preCls}>{diagram}</pre></>)}
      </div>
    )
  }
  if (t === 'typing_test') {
    const cfg = question.typing as { passage?: string; min_wpm?: number; min_accuracy?: number } | undefined
    const typed = typeof a.typed === 'string' ? a.typed : ''
    const s = typingStats(cfg?.passage || '', typed, Number(a.elapsed_ms))
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{s.wpm}</span>{' '}{tr('exam.wpmGross')}{' '}<span className="tabular-nums">{s.grossWpm}</span>) · <span className="font-mono tabular-nums text-foreground">{s.accuracy}%</span>{' '}{tr('exam.accuracy')}{' '}<span className="tabular-nums">{Math.round(s.minutes * 60)}</span> s
          {cfg?.min_wpm ? <>{' '}{tr('exam.target')}{' '}<span className="tabular-nums">{cfg.min_wpm}</span>{' '}{tr('exam.wpm')}{' '}<span className="tabular-nums">{cfg.min_accuracy}%</span></> : null}
        </p>
        <pre className={preCls}>{typed || '(nothing typed)'}</pre>
      </div>
    )
  }
  if (t === 'case_study') {
    const subs = sanitizeSubQuestions(question.sub_questions)
    const g = gradeCaseStudy(question.sub_questions, answer, subs.reduce((x, s) => x + s.points, 0))
    return (
      <ol className="space-y-2">
        {subs.map((s, i) => {
          const v = a[s.id]
          const given = Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : ''
          const part = g.parts.find((p) => p.id === s.id)
          const full = !!part && part.awarded >= part.points
          return (
            <li key={s.id} className="rounded-lg border border-border p-2 text-xs">
              <p className="font-medium">{String.fromCharCode(97 + i)}) {s.prompt}</p>
              <p className="mt-1"><span className="text-muted-foreground">{tr('exam.answer')}</span> {given || <em className="text-muted-foreground">{tr('exam.none')}</em>}</p>
              <p><span className="text-muted-foreground">{tr('exam.key')}</span> {s.answer || '—'} · <span className={`tabular-nums ${full ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>{part?.awarded ?? 0}/{s.points}</span></p>
            </li>
          )
        })}
      </ol>
    )
  }
  if (t === 'file_upload' || t === 'video_response') {
    const mine = files.find((f) => f.id === a.file_id && f.question_id === question.id)
    if (t === 'video_response' && typeof a.text_alternative === 'string' && !a.file_id) {
      return (<div className="space-y-1"><Badge variant="outline" className="text-[10px]">{tr('exam.typedInsteadOfVideo')}</Badge><pre className={preCls}>{a.text_alternative || '(empty)'}</pre></div>)
    }
    if (!a.file_id) return <span className="text-xs italic text-muted-foreground">{tr('exam.noFileUploaded')}</span>
    if (!mine) return <span className="text-xs text-amber-700 dark:text-amber-400">{tr('exam.theAnswerPointsToAFile3f1')}</span>
    return <FileLink examId={examId} file={mine} video={t === 'video_response'} />
  }
  return <pre className={preCls}>{answer}</pre>
}

/** Per-trait psychometric scores (Likert items with a trait key). Hidden when the test has none. */
export function TraitScoresPanel({ questions, answers }: { questions: Array<Record<string, unknown>>; answers: Record<string, string> }) {
  const { t } = useT()
  const scores = traitScores(questions as never, answers)
  if (!scores.length) return null
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{t('exam.personalityTraits')}</p>
      <p className="text-xs text-muted-foreground">{t('exam.fromTheLikertItemsReverseKeyed765')}</p>
      <ul className="space-y-2">
        {scores.map((s) => (
          <li key={s.trait} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{s.trait}</span>
              <span className="tabular-nums text-muted-foreground">{t('exam.percentMeanMeanCountItems', { count: s.items, percent: s.percent, mean: s.mean })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${s.trait}: ${s.percent}%`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${s.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
