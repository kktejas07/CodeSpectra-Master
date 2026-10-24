'use client'
import { csrfFetch } from '@/lib/csrf-fetch'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Brain, Loader2, Clock, Flag, Mic, MicOff, Send, Volume2,
  CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { PageHeader } from '@/components/app/page-kit'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import type { Question, Evaluation } from '@/lib/interviews/ai-mock-types'
import { createVoiceManager, getVoiceCapabilities } from '@/lib/interviews/ai-mock-voice'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { isSubmitEnter } from '@/lib/keyboard'

interface StoredSession {
  sessionId: string
  firstQuestion: Question
  totalQuestions: number
  role: string
  difficulty: string
  duration?: number
}

interface TranscriptEntry {
  id: string
  role: 'ai' | 'candidate' | 'system'
  text: string
  timestamp: number
  evaluation?: Evaluation
}

type SessionStatus = 'loading' | 'speaking' | 'listening' | 'processing' | 'completed' | 'error'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function AiMockSessionPage() {
  const apiError = useApiError()
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session')

  const [stored, setStored] = useState<StoredSession | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [currentEvaluation, setCurrentEvaluation] = useState<Evaluation | null>(null)
  const [showEvaluation, setShowEvaluation] = useState(false)
  const [waveform, setWaveform] = useState<number[]>([])
  const [interimText, setInterimText] = useState('')
  const [textInput, setTextInput] = useState('')
  const [textMode, setTextMode] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)

  const voiceRef = useRef<ReturnType<typeof createVoiceManager> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const currentQuestionRef = useRef<Question | null>(null)
  const processingRef = useRef(false)

  // Load session from sessionStorage
  useEffect(() => {
    if (!sessionId) {
      router.push('/dashboard/interviews/ai-mock/setup')
      return
    }
    try {
      const raw = sessionStorage.getItem(`aimock_${sessionId}`)
      if (!raw) {
        // Reopened from history / another tab: a finished session shows its saved report (CORE-016).
        fetch(`/api/interviews/ai-mock?id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j?.session?.status === 'completed') setStatus('completed')
            else router.push('/dashboard/interviews/ai-mock/setup')
          })
          .catch(() => router.push('/dashboard/interviews/ai-mock/setup'))
        return
      }
      const data: StoredSession = JSON.parse(raw)
      setStored(data)
      setTotalQuestions(data.totalQuestions)
      currentQuestionRef.current = data.firstQuestion
      setStatus('speaking')
    } catch {
      router.push('/dashboard/interviews/ai-mock/setup')
    }
  }, [sessionId, router])

  // Check voice support on mount
  useEffect(() => {
    const caps = getVoiceCapabilities()
    if (!caps.sttSupported) {
      setTextMode(true)
      setVoiceSupported(false)
    }
  }, [])

  // Timer
  useEffect(() => {
    if (status === 'completed') return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const addTranscriptEntry = useCallback((entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => {
    setTranscript(prev => [...prev, { ...entry, id: `${Date.now()}_${Math.random()}`, timestamp: Date.now() }])
  }, [])

  const submitAnswer = useCallback(async (answerText: string) => {
    if (!sessionId || !currentQuestionRef.current || processingRef.current) return
    processingRef.current = true
    setStatus('processing')
    setInterimText('')

    addTranscriptEntry({ role: 'candidate', text: answerText })

    try {
      const res = await csrfFetch('/api/interviews/ai-mock/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestionRef.current.id,
          answer: answerText.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(apiError(data, tr('career.failedToSubmitAnswer')))
        processingRef.current = false
        setStatus('listening')
        return
      }

      const eval_ = data.evaluation as Evaluation
      setCurrentEvaluation(eval_)
      setShowEvaluation(true)

      addTranscriptEntry({ role: 'system', text: tr('career.scoreScore10', { score: eval_.score }), evaluation: eval_ })

      // Auto-hide evaluation after 5 seconds
      setTimeout(() => setShowEvaluation(false), 5000)

      if (data.nextQuestion) {
        currentQuestionRef.current = data.nextQuestion
        setQuestionIndex(prev => prev + 1)

        // AI speaks next question
        setStatus('speaking')
        const nextQ = data.nextQuestion as Question
        const aiText = nextQ.question

        if (voiceRef.current && !textMode) {
          await voiceRef.current.speakAi(aiText)
        }

        addTranscriptEntry({ role: 'ai', text: aiText })
        processingRef.current = false
        setStatus('listening')

        if (voiceRef.current && !textMode) {
          voiceRef.current.startListening()
        }
      } else {
        // No more questions - complete
        await handleComplete()
      }
    } catch {
      setError(tr('career.networkError'))
      processingRef.current = false
      setStatus('listening')
    }
  }, [sessionId, textMode, addTranscriptEntry])

  const handleComplete = useCallback(async () => {
    if (!sessionId) return
    setStatus('completed')
    voiceRef.current?.stop()

    try {
      const res = await csrfFetch('/api/interviews/ai-mock/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      const data = await res.json()
      if (res.ok && data.report) {
        sessionStorage.setItem(`aimock_report_${sessionId}`, JSON.stringify(data.report))
      }
    } catch {
      // Best effort
    }
  }, [sessionId])

  // Initialize voice manager
  useEffect(() => {
    if (!stored || textMode) return

    voiceRef.current = createVoiceManager({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setInterimText('')
          submitAnswer(text)
        } else {
          setInterimText(text)
        }
      },
      onAiSpeaking: (speaking) => {
        if (speaking) setStatus('speaking')
      },
      onWaveform: (data) => setWaveform(data),
      onError: (err) => {
        setError(err)
        setTextMode(true)
      },
    })

    return () => {
      voiceRef.current?.destroy()
      voiceRef.current = null
    }
  }, [stored, textMode, submitAnswer])

  // Start speaking first question when session loads
  useEffect(() => {
    if (status !== 'speaking' || !stored) return

    const firstQ = stored.firstQuestion
    const speakFirst = async () => {
      const greeting = `Welcome to your ${stored.difficulty} level interview for ${stored.role}. Let's begin. ${firstQ.question}`
      addTranscriptEntry({ role: 'ai', text: greeting })

      if (voiceRef.current && !textMode) {
        await voiceRef.current.speakAi(greeting)
      }

      addTranscriptEntry({ role: 'ai', text: firstQ.question })
      setStatus('listening')

      if (voiceRef.current && !textMode) {
        voiceRef.current.startListening()
      }
    }

    speakFirst()
  }, [status, stored, textMode, addTranscriptEntry])

  const handleTextSubmit = () => {
    if (!textInput.trim()) return
    submitAnswer(textInput.trim())
    setTextInput('')
  }

  const toggleMic = () => {
    if (textMode) return
    if (status === 'listening') {
      voiceRef.current?.stopListening()
      setStatus('speaking')
    } else if (status === 'speaking') {
      voiceRef.current?.startListening()
      setStatus('listening')
    }
  }

  if (!gate.ready) return null

  // Report view
  if (status === 'completed' && sessionId) {
    return <ReportView sessionId={sessionId} router={router} />
  }
  if (!stored) return null

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm text-foreground hidden sm:inline">{tr('career.aiMockInterview')}</span>
          <Badge variant="outline" className="text-[10px]">{stored.difficulty}</Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <Clock className="h-3 w-3" /> {formatTime(elapsed)}
          </span>
          <span className="font-medium tabular-nums">
            Q{Math.min(questionIndex + 1, totalQuestions)}/{totalQuestions}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleComplete}
            className="h-7 text-xs"
          >
            <Flag className="mr-1 h-3 w-3" />{' '}{tr('career.end')}</Button>
        </div>
      </div>

      {/* Main Content - Two Panel Layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Voice Area - Left/Top */}
        <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 relative min-h-[200px] lg:min-h-0">
          {/* Waveform Visualization */}
          <div className="flex items-center justify-center gap-1 h-20">
            {status === 'speaking' || status === 'listening' ? (
              Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full transition-all duration-100 motion-reduce:transition-none"
                  style={{
                    height: `${Math.max(8, (waveform[i % waveform.length] || 0) * 60 + Math.random() * 20)}px`,
                    backgroundColor: status === 'speaking' ? '#22c55e' : '#ef4444',
                    opacity: 0.8,
                  }}
                />
              ))
            ) : (
              <div className="flex flex-col items-center gap-3">
                {status === 'processing' ? (
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                ) : (
                  <Mic className="h-12 w-12 text-white/40" aria-hidden />
                )}
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="mt-4 text-center">
            {status === 'speaking' && (
              <p className="text-green-400 text-sm flex items-center gap-2">
                <Volume2 className="h-4 w-4 animate-pulse motion-reduce:animate-none" />{' '}{tr('career.interviewerIsSpeaking')}</p>
            )}
            {status === 'listening' && (
              <p className="text-red-400 text-sm flex items-center gap-2">
                <Mic className="h-4 w-4 animate-pulse motion-reduce:animate-none" />{' '}{tr('common.voiceListening')}</p>
            )}
            {status === 'processing' && (
              <p className="text-blue-300 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />{' '}{tr('career.thinking')}</p>
            )}
            {interimText && (
              <p className="text-white/70 text-xs mt-2 max-w-md truncate">{interimText}</p>
            )}
          </div>

          {/* Evaluation Flash */}
          {showEvaluation && currentEvaluation && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-2xl p-3 shadow-lg border border-border/40 min-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                {currentEvaluation.score >= 7 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : currentEvaluation.score >= 4 ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-semibold text-sm tabular-nums text-foreground">{tr('career.scoreScore10', { score: currentEvaluation.score })}</span>
              </div>
              {currentEvaluation.strengths.length > 0 && (
                <p className="text-xs text-green-700 dark:text-green-400">{tr('career.countStrengths', { count: currentEvaluation.strengths.length })}</p>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-xs px-3 py-1.5 rounded-full">
              {error}
              <button type="button" onClick={() => setError('')} className="ml-2 underline">{tr('career.dismiss')}</button>
            </div>
          )}
        </div>

        {/* Transcript Panel - Right/Bottom */}
        <div className="flex-1 flex flex-col border-t lg:border-t-0 lg:border-l border-border/40 bg-background min-h-[300px] lg:min-h-0">
          <div className="px-4 py-2 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{tr('career.transcript')}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{tr('career.countMessages', { count: transcript.length })}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${entry.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    entry.role === 'ai'
                      ? 'bg-primary/10 text-foreground'
                      : entry.role === 'candidate'
                        ? 'bg-muted text-foreground'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs'
                  }`}
                >
                  {entry.role === 'ai' && (
                    <p className="text-[10px] text-primary font-medium mb-1">{tr('career.interviewer')}</p>
                  )}
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  {entry.evaluation && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium tabular-nums">{entry.evaluation.score}/10</span>
                        {entry.evaluation.strengths.length > 0 && (
                          <span className="text-green-700 dark:text-green-400">+{entry.evaluation.strengths.length}</span>
                        )}
                        {entry.evaluation.improvements.length > 0 && (
                          <span className="text-amber-700 dark:text-amber-400">-{entry.evaluation.improvements.length}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-4 py-3 border-t border-border/40 bg-card/50 backdrop-blur-sm shrink-0">
        {textMode ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => isSubmitEnter(e) && handleTextSubmit()}
              placeholder={tr('career.typeYourAnswer')}
              aria-label={tr('career.yourAnswer')}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={status !== 'listening'}
            />
            <Button
              onClick={handleTextSubmit}
              disabled={status !== 'listening' || !textInput.trim()}
              size="sm"
              aria-label={tr('career.sendAnswer')}
            >
              <Send className="h-4 w-4" />
            </Button>
            {voiceSupported && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTextMode(false)}
                aria-label={tr('career.answerByVoice')}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTextMode(true)}
              className="text-xs"
            >{tr('career.typeInstead')}</Button>
            <button
              type="button"
              onClick={toggleMic}
              disabled={status === 'processing' || status === 'loading'}
              aria-label={status === 'listening' ? tr('career.stopAnswering') : tr('career.answerByVoice')}
              className={`h-14 w-14 rounded-full flex items-center justify-center transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                status === 'listening'
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
                  : status === 'speaking'
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              {status === 'listening' ? (
                <Mic className="h-6 w-6" />
              ) : status === 'speaking' ? (
                <Volume2 className="h-6 w-6" />
              ) : (
                <MicOff className="h-6 w-6" />
              )}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleComplete}
              className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Flag className="mr-1 h-3 w-3" />{' '}{tr('career.end')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReportView({ sessionId, router }: { sessionId: string; router: ReturnType<typeof useRouter> }) {
  const { t } = useT()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const raw = sessionStorage.getItem(`aimock_report_${sessionId}`)
    if (raw) {
      try { setReport(JSON.parse(raw)); setLoading(false); return } catch { /* fall back to the server copy */ }
    }
    // The server keeps every finished report (CORE-016).
    fetch(`/api/interviews/ai-mock?id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.report) setReport(j.report) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p>{t('career.weCouldntLoadThisReportIte30')}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/interviews/ai-mock/setup')}>{t('career.startNewInterview')}</Button>
      </div>
    )
  }

  const scoreColor = report.overallScore >= 80 ? 'text-green-600 dark:text-green-400' : report.overallScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        icon={<Brain aria-hidden />}
        title={t('career.interviewReport')}
        description={t('career.howYourAiMockInterviewWente62')}
        actions={
          <Button variant="outline" onClick={() => router.push('/dashboard/interviews/ai-mock/setup')}>{t('career.practiceAgain')}</Button>
        }
      />

      {/* Overall Score */}
      <Card className="rounded-3xl border-border/70 p-6 text-center space-y-3">
        <p className={`text-5xl font-bold tabular-nums ${scoreColor}`}>{report.overallScore}</p>
        <p className="text-sm text-muted-foreground">{t('career.outOf100')}</p>
        <Badge variant="outline" className="text-sm">{report.category}</Badge>
      </Card>

      {/* Summary */}
      {report.summary && (
        <Card className="rounded-3xl border-border/70 p-5">
          <p className="text-sm leading-relaxed text-foreground">{report.summary}</p>
        </Card>
      )}

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.topStrengths?.length > 0 && (
          <Card className="rounded-3xl border-border/70 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">{t('career.strengths')}</h3>
            {report.topStrengths.map((s: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">• {s}</p>
            ))}
          </Card>
        )}
        {report.topImprovements?.length > 0 && (
          <Card className="rounded-3xl border-border/70 p-5 space-y-2">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t('career.areasToImprove')}</h3>
            {report.topImprovements.map((s: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">• {s}</p>
            ))}
          </Card>
        )}
      </div>

      {/* Resources */}
      {report.recommendedResources?.length > 0 && (
        <Card className="rounded-3xl border-border/70 p-5 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{t('career.recommendedResources')}</h3>
          {report.recommendedResources.map((r: string, i: number) => (
            <p key={i} className="text-xs text-muted-foreground">• {r}</p>
          ))}
        </Card>
      )}

      {/* Collapsible Transcript */}
      <Card className="overflow-hidden rounded-3xl border-border/70">
        <button
          type="button"
          onClick={() => setTranscriptOpen(!transcriptOpen)}
          aria-expanded={transcriptOpen}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm font-medium text-foreground">{t('career.fullTranscript')}</span>
          {transcriptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {transcriptOpen && (
          <div className="px-5 pb-5 border-t border-border/40 max-h-96 overflow-y-auto">
            <p className="text-xs text-muted-foreground mt-3">{t('career.transcriptAvailableAfterSession')}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
