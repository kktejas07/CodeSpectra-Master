'use client'

/**
 * One mock interview: the live conversation (text or voice; coding questions
 * open the code editor with sandbox runs), then the feedback report with
 * share, retake and recording controls. API: /api/interview-sim/[id]/**.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Loader2, Mic, MicOff, RotateCcw, Share2, Square, Trash2, Video, Volume2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { CodingQuestionEditor } from '@/components/assessment/CodingQuestionEditor'
import { ReportView } from '@/components/interview-sim/report-view'
import { useInterviewVoice } from '@/components/interview-sim/use-voice'
import { directUpload, uploadLimits } from '@/lib/storage/direct-upload-client'
import { levelLabel, roundLabel, type SimSessionView } from '@/lib/interview-sim/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

// ponytail: module-level translator handle so the plain fetch helper speaks the page language.
let apiT: Translator | null = null
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await csrfFetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const j = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(j.error || (res.status === 429 ? (apiT?.('errors.tooManyRequests') ?? 'Too many requests. Wait a moment and try again.') : (apiT?.('errors.somethingWentWrongRetry') ?? 'Something went wrong. Try again.')))
  return j
}

function pickRecMime(video: boolean): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const list = video ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* next */ } }
  return ''
}

/** Whole-session recording (opt-in at setup): start by click, stop + upload when the interview ends. */
function useSessionRecorder(sessionId: string) {
  const { t } = useT()
  const [state, setState] = useState<'off' | 'recording' | 'uploading' | 'saved' | 'error'>('off')
  const [message, setMessage] = useState<string | null>(null)
  const [direct, setDirect] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAt = useRef(0)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => { void uploadLimits().then((l) => setDirect(l.direct)) }, [])
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])

  const upload = useCallback(async (blob: Blob, mime: string, durationS: number) => {
    setState('uploading')
    try {
      const url = `/api/interview-sim/${encodeURIComponent(sessionId)}/recording`
      const r = await directUpload({ url, file: blob, start: { mime: mime.split(';')[0] }, finish: () => ({ duration_s: durationS }) })
      if (r.inline) {
        const fd = new FormData()
        fd.append('file', new File([blob], mime.includes('mp4') ? 'recording.mp4' : 'recording.webm', { type: mime.split(';')[0] }))
        fd.append('duration_s', String(durationS))
        const res = await csrfFetch(url, { method: 'POST', body: fd, credentials: 'include' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || t('dashboard.recordingSaveFailed'))
      }
      setState('saved')
      setMessage(t('dashboard.recordingSaved'))
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : t('dashboard.recordingSaveFailed'))
    }
  }, [sessionId, t])

  const start = useCallback(async (video: boolean) => {
    setMessage(null)
    const useVideo = video && direct // without object storage only short audio fits the upload cap
    const mime = pickRecMime(useVideo)
    if (!mime || !navigator.mediaDevices?.getUserMedia) { setState('error'); setMessage(t('dashboard.recordingUnsupported')); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(useVideo ? { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true } : { audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream, { mimeType: mime, ...(useVideo ? { videoBitsPerSecond: 600_000 } : {}), audioBitsPerSecond: 48_000 })
      const chunks: Blob[] = []
      rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        const blob = new Blob(chunks, { type: mime.split(';')[0] })
        void upload(blob, mime, Math.round((Date.now() - startedAt.current) / 1000))
      }
      recRef.current = rec
      startedAt.current = Date.now()
      rec.start(1000)
      setState('recording')
      if (useVideo) requestAnimationFrame(() => { if (previewRef.current) { previewRef.current.srcObject = stream; void previewRef.current.play().catch(() => {}) } })
      if (video && !useVideo) setMessage(t('dashboard.recordingAudioOnly'))
    } catch {
      setState('error')
      setMessage(t('dashboard.recordingBlocked'))
    }
  }, [direct, upload, t])

  const stop = useCallback(() => { if (recRef.current?.state === 'recording') recRef.current.stop() }, [])
  return { state, message, start, stop, previewRef, direct }
}

export default function InterviewSessionPage() {
  const gate = usePageGuard('user')
  const params = useParams<{ sessionId: string }>()
  const id = String(params?.sessionId || '')
  const router = useRouter()
  const addToast = useToast()
  const { t, td, fmt } = useT()
  apiT = t
  const [s, setS] = useState<SimSessionView | null>(null)
  const [serverStt, setServerStt] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [code, setCode] = useState('')
  const [codeLang, setCodeLang] = useState('python')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const usedVoice = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const answerRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const [j, o] = await Promise.all([
        api<{ session: SimSessionView }>(`/api/interview-sim/${encodeURIComponent(id)}`),
        fetch('/api/interview-sim', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ])
      setS(j.session)
      setCodeLang(j.session.config.code_language || 'python')
      setServerStt(!!o?.options?.server_transcription)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('dashboard.simSessionLoadFailed'))
    }
  }, [id, t])
  useEffect(() => { if (gate.ready && id) void load() }, [gate.ready, id, load])

  const voice = useInterviewVoice({ sessionId: id, language: s?.config.language || 'en-IN', serverTranscription: serverStt })
  const recorder = useSessionRecorder(id)
  const isVoice = s?.config.mode === 'voice'
  const current = s?.current ?? null

  // Read each new question aloud in voice mode.
  const spokenTurn = useRef<number | null>(null)
  useEffect(() => {
    if (!isVoice || !voiceOn || !current || spokenTurn.current === current.turn) return
    spokenTurn.current = current.turn
    const greet = current.turn === 0 && s?.greeting ? `${s.greeting} ` : ''
    voice.speak(`${greet}${current.prompt}`)
  }, [current, isVoice, voiceOn, s?.greeting, voice])

  useEffect(() => { if (voice.transcript) { setAnswer(voice.transcript); usedVoice.current = true } }, [voice.transcript])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [s?.turns.length])
  // Stop the session recording when the interview ends.
  useEffect(() => { if (s?.status === 'completed' && recorder.state === 'recording') recorder.stop() }, [s?.status, recorder])

  const send = async () => {
    if (!s || !current || sending) return
    if (voice.phase === 'listening') voice.stop()
    const text = answer.trim()
    if (!text && !(current.kind === 'code' && code.trim())) { setSendError(t('dashboard.typeOrSayFirst')); return }
    setSending(true)
    setSendError(null)
    try {
      const j = await api<{ session: SimSessionView }>(`/api/interview-sim/${encodeURIComponent(id)}/answer`, {
        method: 'POST',
        body: JSON.stringify({
          turn: current.turn, text, input: usedVoice.current ? 'voice' : 'text', ...(usedVoice.current ? { duration_ms: voice.durationMs() } : {}),
          ...(current.kind === 'code' ? { code, code_language: codeLang } : {}),
        }),
      })
      setS(j.session)
      setAnswer('')
      if (j.session.current?.question_id !== current.question_id) setCode('')
      usedVoice.current = false
      voice.reset()
      requestAnimationFrame(() => answerRef.current?.focus())
    } catch (e) {
      setSendError(e instanceof Error ? e.message : t('dashboard.answerNotSent'))
    } finally {
      setSending(false)
    }
  }

  const endNow = async () => {
    if (!window.confirm(t('dashboard.endNowConfirm'))) return
    setEnding(true)
    voice.stopSpeaking()
    try {
      const j = await api<{ session: SimSessionView }>(`/api/interview-sim/${encodeURIComponent(id)}/finish`, { method: 'POST', body: '{}' })
      setS(j.session)
    } catch (e) {
      addToast({ type: 'error', title: t('dashboard.couldNotEnd'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    } finally {
      setEnding(false)
    }
  }

  const setShare = async (on: boolean) => {
    try {
      const j = await api<{ share_url: string | null }>(`/api/interview-sim/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ share: on }) })
      setS((cur) => (cur ? { ...cur, share_url: j.share_url, share_token: j.share_url ? 'set' : null } : cur))
      if (j.share_url) {
        await navigator.clipboard?.writeText(`${window.location.origin}${j.share_url}`).catch(() => undefined)
        addToast({ type: 'success', title: t('dashboard.shareCreated'), message: t('dashboard.shareCreatedBody') })
      } else addToast({ type: 'success', title: t('dashboard.sharingOff'), message: t('dashboard.sharingOffBody') })
    } catch (e) {
      addToast({ type: 'error', title: t('dashboard.couldNotChangeSharing'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    }
  }

  const retake = async () => {
    try {
      const j = await api<{ session: { id: string } }>('/api/interview-sim', {
        method: 'POST', body: JSON.stringify({ retake_of: id, role: s?.config.role, level: s?.config.level, round: s?.config.round, language: s?.config.language, mode: 'text', record: false, consent: false }),
      })
      router.push(`/dashboard/interview-sim/${encodeURIComponent(j.session.id)}`)
    } catch (e) {
      addToast({ type: 'error', title: t('dashboard.couldNotRetake'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    }
  }

  const openRecording = async () => {
    try {
      const res = await fetch(`/api/interview-sim/${encodeURIComponent(id)}/recording`, { credentials: 'include' })
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        const j = await res.json()
        if (!res.ok || !j.url) throw new Error(j.error || t('dashboard.recordingNotAvailable'))
        window.open(j.url, '_blank', 'noopener,noreferrer')
      } else {
        if (!res.ok) throw new Error(t('dashboard.recordingNotAvailable'))
        window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      addToast({ type: 'error', title: t('assessment.recording'), message: e instanceof Error ? e.message : t('dashboard.notAvailable') })
    }
  }

  const deleteRecording = async () => {
    if (!window.confirm(t('dashboard.deleteRecordingConfirm'))) return
    try {
      await api(`/api/interview-sim/${encodeURIComponent(id)}/recording`, { method: 'DELETE' })
      setS((cur) => (cur ? { ...cur, recording: null } : cur))
    } catch (e) {
      addToast({ type: 'error', title: t('dashboard.couldNotDeleteRecording'), message: e instanceof Error ? e.message : t('common.tryAgainSentence') })
    }
  }

  const answersByQuestion = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const turn of s?.turns ?? []) if (turn.answer) (out[turn.question_id] ||= []).push(turn.answer)
    return out
  }, [s?.turns])

  if (!gate.ready || (!s && !loadError)) {
    return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={3} /></div>
  }
  if (!s) {
    return <EmptyState illustration="not-found" title={t('dashboard.interviewNotFound')} description={loadError || t('dashboard.mayBeDeleted')} actionLabel={t('dashboard.backToMockInterviews')} actionHref="/dashboard/interview-sim" />
  }

  const qIndex = current ? s.plan.findIndex((p) => p.id === current.question_id) : s.plan.length
  const title = `${td(`dashboard.round:${s.config.round}`, roundLabel(s.config.round))} · ${s.config.role}`
  const subtitle = `${s.config.company_name ? `${s.config.company_name} · ` : ''}${td(`dashboard.simLevel:${s.config.level}`, levelLabel(s.config.level))}${s.status === 'active' ? ` · ${t('assessment.questionNofMLower', { n: Math.min(qIndex + 1, s.plan.length), m: s.plan.length })}` : ''}`

  return (
    <div className="w-full space-y-6">
      <Link href="/dashboard/interview-sim" className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('dashboard.mockInterviews')}
      </Link>
      <PageHeader
        className="mb-0"
        icon={<Mic aria-hidden />}
        title={title}
        description={subtitle}
        actions={s.status === 'active' ? (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void endNow()} disabled={ending || sending}>
            {ending ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Square className="mr-2 h-4 w-4" aria-hidden />}{t('dashboard.endAndFeedback')}
          </Button>
        ) : (
          <>
            <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => void retake()}><RotateCcw className="mr-2 h-4 w-4" aria-hidden />{t('dashboard.retake')}</Button>
            {s.share_url ? (
              <>
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${s.share_url}`); addToast({ type: 'success', title: t('dashboard.linkCopied'), message: t('dashboard.linkCopiedBody') }) }}><Copy className="mr-2 h-4 w-4" aria-hidden />{t('dashboard.copyLink')}</Button>
                <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => void setShare(false)}>{t('dashboard.stopSharing')}</Button>
              </>
            ) : s.report ? (
              <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void setShare(true)}><Share2 className="mr-2 h-4 w-4" aria-hidden />{t('dashboard.shareReport')}</Button>
            ) : null}
          </>
        )}
      />

      {s.config.record && (s.status === 'active' || recorder.state === 'uploading' || recorder.state === 'error') && (
        <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {recorder.state === 'recording' && recorder.direct && (
              <video ref={recorder.previewRef} muted playsInline className="h-16 w-24 rounded-lg bg-black object-cover" aria-label={t('dashboard.cameraPreview')} />
            )}
            <p className="text-sm text-foreground" aria-live="polite">
              {recorder.state === 'off' && t('dashboard.recordingOptional')}
              {recorder.state === 'recording' && <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" aria-hidden />{t('assessment.recording')}</span>}
              {recorder.state === 'uploading' && t('dashboard.savingRecording')}
              {recorder.state === 'saved' && t('dashboard.recordingSaved')}
              {recorder.state === 'error' && recorder.message}
              {recorder.state !== 'error' && recorder.message && recorder.state !== 'saved' ? <span className="block text-xs text-muted-foreground">{recorder.message}</span> : null}
            </p>
          </div>
          {recorder.state === 'off' && s.status === 'active' && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void recorder.start(false)}><Mic className="mr-2 h-4 w-4" aria-hidden />{t('dashboard.recordAudio')}</Button>
              {recorder.direct && <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void recorder.start(true)}><Video className="mr-2 h-4 w-4" aria-hidden />{t('dashboard.recordVideo')}</Button>}
            </div>
          )}
          {recorder.state === 'recording' && <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={recorder.stop}>{t('dashboard.stopRecording')}</Button>}
        </Panel>
      )}

      {s.status === 'active' ? (
        <div className="space-y-4">
          <Panel className="space-y-4 p-4 sm:p-6">
            <ol className="space-y-4" aria-label={t('dashboard.interviewSoFar')}>
              {s.greeting && (
                <li className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground"><span className="sr-only">{t('dashboard.interviewerSr')} </span>{s.greeting}</li>
              )}
              {s.turns.map((turn) => (
                <li key={turn.n} className="space-y-2">
                  <div className={cn('max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm', turn.answered_at ? 'bg-muted text-foreground' : 'border border-primary/30 bg-primary/10 text-foreground')}>
                    <span className="sr-only">{t('dashboard.interviewerSr')} </span>
                    {turn.is_followup && <span className="mb-1 block text-xs font-medium text-primary">{t('dashboard.followUp')}</span>}
                    <span className="whitespace-pre-wrap">{turn.prompt}</span>
                  </div>
                  {turn.answer && (
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                      <span className="sr-only">{t('dashboard.youSr')} </span><span className="whitespace-pre-wrap">{turn.answer}</span>
                      {turn.code_run && <span className="mt-1 block text-xs opacity-90">{t('dashboard.codeSamplesPassed', { passed: turn.code_run.passed, total: turn.code_run.total })}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div ref={bottomRef} />
          </Panel>

          {current && (
            <Panel className="space-y-4">
              {current.kind === 'code' && (
                <CodingQuestionEditor
                  question={{ test_cases: (current.test_cases || []).map((t) => ({ ...t, isSample: true })), starter_code: current.starter_code }}
                  answer={code}
                  language={codeLang}
                  onChange={(v) => setCode(v ?? '')}
                  onLanguageChange={setCodeLang}
                />
              )}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="sim-answer">{current.kind === 'code' ? t('dashboard.explainApproach') : t('dashboard.yourAnswerLabel')}</Label>
                  {isVoice && voice.tts && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { if (voice.speaking) voice.stopSpeaking(); else voice.speak(current.prompt) }} aria-label={voice.speaking ? t('dashboard.stopReading') : t('dashboard.readAloud')}>
                      <Volume2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
                <Textarea
                  id="sim-answer"
                  ref={answerRef}
                  rows={current.kind === 'code' ? 3 : 6}
                  maxLength={6000}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }}
                  placeholder={isVoice ? t('dashboard.voicePlaceholder') : t('dashboard.typePlaceholder')}
                  className="rounded-xl"
                  disabled={sending}
                />
                <p className="text-xs text-muted-foreground"><span className="tabular-nums">{answer.length}</span>/6000 · {t('dashboard.ctrlEnterToSend')}</p>
              </div>
              {isVoice && (
                <div className="flex flex-wrap items-center gap-3">
                  {voice.supported ? (
                    voice.phase === 'listening' ? (
                      <Button type="button" variant="destructive" className="min-h-11 rounded-full" onClick={voice.stop}><MicOff className="mr-2 h-4 w-4" aria-hidden />{t('common.stop')}</Button>
                    ) : (
                      <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => void voice.start()} disabled={sending || voice.phase === 'transcribing'}>
                        {voice.phase === 'transcribing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Mic className="mr-2 h-4 w-4" aria-hidden />}
                        {voice.phase === 'transcribing' ? t('dashboard.transcribing') : t('dashboard.answerByVoice')}
                      </Button>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('dashboard.voiceUnavailable')}</p>
                  )}
                  {voice.phase === 'listening' && <span className="text-sm text-foreground" aria-live="polite">{t('dashboard.listening')}</span>}
                  <label className="ml-auto flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); if (!e.target.checked) voice.stopSpeaking() }} />
                    {t('dashboard.readQuestionsAloud')}
                  </label>
                </div>
              )}
              {(voice.error || sendError) && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{sendError || voice.error}</p>}
              <div className="flex justify-end">
                <Button className="min-h-11 rounded-full px-6" onClick={() => void send()} disabled={sending}>
                  {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t('dashboard.interviewerThinking')}</> : t('dashboard.sendAnswer')}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      ) : s.report ? (
        <div className="space-y-6">
          {s.recording && (
            <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-foreground">
                <Video className="mr-2 inline h-4 w-4" aria-hidden />{t('dashboard.recordingKeptUntil', { date: fmt.date(s.recording.expires_at) })}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void openRecording()}>{t('dashboard.watch')}</Button>
                <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => void deleteRecording()}><Trash2 className="mr-2 h-4 w-4" aria-hidden />{t('common.delete')}</Button>
              </div>
            </Panel>
          )}
          <ReportView report={s.report} answers={answersByQuestion} />
        </div>
      ) : (
        <EmptyState illustration="interview" title={t('dashboard.noReport')} description={t('dashboard.noReportDesc')} actionLabel={t('dashboard.setUpInterview')} actionHref="/dashboard/interview-sim" />
      )}
    </div>
  )
}
