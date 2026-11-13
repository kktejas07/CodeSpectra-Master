'use client'

/**
 * PostAssessmentDebrief
 *
 * Shown immediately after a candidate submits an assessment (before the
 * "you're done" card). Presents 3 AI-generated follow-up questions about
 * the candidate's approach; each answer is saved server-side for the
 * recruiter to review alongside the submission.
 *
 * Props:
 *  examId     — the exam just submitted
 *  onComplete — called when all questions are answered or the session is skipped
 */
import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronRight, Loader2, SkipForward, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { csrfFetch } from '@/lib/csrf-fetch'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'
import { isSubmitEnter } from '@/lib/keyboard'

interface DebriefQuestion {
  id: string
  text: string
  order: number
}

interface StartResponse {
  session_id: string
  question: DebriefQuestion | null
  total: number
  answered: number
}

interface AnswerResponse {
  done: boolean
  question?: DebriefQuestion
  answered?: number
  total?: number
}

type Phase = 'loading' | 'question' | 'submitting' | 'done' | 'error'

export function PostAssessmentDebrief({
  examId,
  onComplete,
}: {
  examId: string
  onComplete: () => void
}) {
  const { t } = useT()
  const [phase, setPhase] = useState<Phase>('loading')
  const [sessionId, setSessionId] = useState('')
  const [question, setQuestion] = useState<DebriefQuestion | null>(null)
  const [answered, setAnswered] = useState(0)
  const [total, setTotal] = useState(3)
  const [text, setText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const startedRef = useRef(false)

  // ── start session on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void (async () => {
      try {
        const res = await csrfFetch(`/api/exams/${examId}/debrief`, { method: 'POST', credentials: 'include' })
        if (!res.ok) {
          if (res.status === 403) { onComplete(); return } // debrief not enabled → skip
          throw new Error(await res.text())
        }
        const data = (await res.json()) as StartResponse
        setSessionId(data.session_id)
        setQuestion(data.question)
        setTotal(data.total)
        setAnswered(data.answered)
        // Nothing left to ask (already finished for this submission) → straight on.
        if (!data.question) { onComplete(); return }
        setPhase('question')
      } catch {
        // If debrief creation fails for any reason, don't block the candidate
        onComplete()
      }
    })()
  }, [examId, onComplete])

  useEffect(() => {
    if (phase === 'question') textareaRef.current?.focus()
  }, [phase, question?.id])

  const submitAnswer = async () => {
    if (!question || !text.trim() || !sessionId) return
    setPhase('submitting')
    try {
      const res = await csrfFetch(`/api/exams/${examId}/debrief/${sessionId}/answer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, text: text.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as AnswerResponse
      setText('')
      if (data.done) {
        setPhase('done')
        setTimeout(onComplete, 1800)
      } else {
        setQuestion(data.question ?? null)
        setAnswered(data.answered ?? answered + 1)
        setPhase('question')
      }
    } catch {
      setErrorMsg(t('assessment.debriefSaveFailed'))
      setPhase('error')
    }
  }

  const skipDebrief = async () => {
    if (sessionId) {
      void csrfFetch(`/api/exams/${examId}/debrief/${sessionId}/skip`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => { /* fire-and-forget */ })
    }
    onComplete()
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter submits
    if (isSubmitEnter(e, { modifier: true })) {
      e.preventDefault()
      void submitAnswer()
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">{t('assessment.debriefPreparing')}</p>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{t('assessment.debriefCompleteTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('assessment.debriefRecorded')}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t('assessment.debriefEyebrow')}</p>
          <h2 className="text-lg font-semibold leading-snug">{t('assessment.debriefQuickTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('assessment.debriefQuickHelp')}</p>
        </div>
      </div>

      {/* Progress pills */}
      <div className="flex gap-1.5" aria-label={t('assessment.debriefProgress', { current: answered + 1, total })}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < answered ? 'bg-primary' : i === answered ? 'bg-primary/50' : 'bg-muted',
            )}
          />
        ))}
      </div>

      {/* Question bubble */}
      {question && (
        <div className="rounded-2xl border border-border/70 bg-muted/40 p-5 space-y-4">
          <p className="text-sm font-medium leading-relaxed">{question.text}</p>

          <Textarea
            ref={textareaRef}
            placeholder={t('assessment.debriefPlaceholderShortcut')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            rows={4}
            maxLength={4000}
            disabled={phase === 'submitting'}
            className="resize-none rounded-xl text-sm"
            aria-label={t('assessment.debriefAnswerLabel', { number: question.order })}
          />

          {phase === 'error' && (
            <p className="text-xs text-destructive">{errorMsg}</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={skipDebrief}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              {t('assessment.debriefSkipAll')}
            </button>

            <Button
              onClick={() => void submitAnswer()}
              disabled={!text.trim() || phase === 'submitting'}
              className="gap-2 rounded-xl"
            >
              {phase === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
              {answered + 1 < total ? (
                <>{t('assessment.debriefNext')} <ChevronRight className="h-4 w-4" /></>
              ) : (
                <>{t('assessment.debriefSubmit')}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
