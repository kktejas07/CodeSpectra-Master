'use client'

/**
 * Candidate-facing AI debrief page.
 * Fetches or creates a debrief session, then walks the candidate through
 * follow-up questions generated from their assessment answers.
 *
 * Route: /dashboard/assessments/[id]/debrief
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePageGuard } from '@/lib/use-page-guard'
import { ArrowLeft, Bot, ChevronRight, CheckCircle, Loader2, SkipForward } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'

interface DebriefQuestion {
  id: string
  text: string
  order: number
}

interface DebriefState {
  sessionId: string
  question: DebriefQuestion | null
  total: number
  answered: number
}

export default function DebriefPage() {
  const gate = usePageGuard()
  const { t } = useT()
  const router = useRouter()
  const params = useParams()
  const examId = params.id as string

  const [state, setState] = useState<DebriefState | null>(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Redirect admins — they see the debrief via the admin results page.
  useEffect(() => {
    if (gate.ready && gate.user && (gate.user.role === 'tenant_admin' || gate.user.role === 'superadmin')) {
      router.replace(`/dashboard/admin/assessments/${encodeURIComponent(examId)}/results`)
    }
  }, [gate.ready, gate.user, router, examId])

  const startOrResume = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // POST is idempotent — returns existing session if one is active.
      const res = await csrfFetch(`/api/exams/${examId}/debrief`, { method: 'POST' })
      const json = await res.json() as { session_id?: string; question?: DebriefQuestion | null; total?: number; answered?: number; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (!json.session_id) throw new Error('No session returned.')
      setState({ sessionId: json.session_id, question: json.question ?? null, total: json.total ?? 0, answered: json.answered ?? 0 })
      if (!json.question) setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [examId])

  useEffect(() => {
    if (gate.ready) void startOrResume()
  }, [gate.ready, startOrResume])

  const submitAnswer = async () => {
    if (!state?.question || !answer.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await csrfFetch(`/api/exams/${examId}/debrief/${state.sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ question_id: state.question.id, text: answer.trim() }),
      })
      const json = await res.json() as { done?: boolean; question?: DebriefQuestion | null; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (json.done) {
        setDone(true)
        setState((prev: DebriefState | null) => prev ? { ...prev, question: null, answered: prev.total } : prev)
      } else {
        setAnswer('')
        setState((prev: DebriefState | null) => prev ? { ...prev, question: json.question ?? null, answered: prev.answered + 1 } : prev)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const skipQuestion = async () => {
    if (!state?.question) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await csrfFetch(`/api/exams/${examId}/debrief/${state.sessionId}/skip`, {
        method: 'POST',
        body: JSON.stringify({ question_id: state.question.id }),
      })
      const json = await res.json() as { done?: boolean; question?: DebriefQuestion | null; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (json.done) {
        setDone(true)
        setState((prev: DebriefState | null) => prev ? { ...prev, question: null } : prev)
      } else {
        setAnswer('')
        setState((prev: DebriefState | null) => prev ? { ...prev, question: json.question ?? null, answered: prev.answered + 1 } : prev)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('assessment.debriefLoading')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/dashboard/assessments/${encodeURIComponent(examId)}`)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('assessment.debriefBack')}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
          <Bot className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('assessment.debriefEyebrow')}</h1>
          <p className="text-sm text-muted-foreground">{t('assessment.debriefSubtitle')}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* Done state */}
      {done && (
        <Card className="rounded-3xl border-0 bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] p-8 text-center text-white space-y-4">
          <CheckCircle className="mx-auto h-12 w-12 text-white/80" aria-hidden />
          <h2 className="text-2xl font-bold">{t('assessment.debriefCompleteTitle')}</h2>
          <p className="text-sm text-white/80">
            {t('assessment.debriefDoneBody')}
          </p>
          <Button
            className="mt-2 rounded-full bg-white text-[#2f5be7] hover:bg-white/90"
            onClick={() => router.push(`/dashboard/assessments/${encodeURIComponent(examId)}`)}
          >
            {t('assessment.debriefBack')} <ChevronRight className="h-4 w-4 ml-1" aria-hidden />
          </Button>
        </Card>
      )}

      {/* Active question */}
      {!done && state?.question && (
        <>
          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('assessment.debriefProgress', { current: state.answered + 1, total: state.total })}</span>
              <span>{t('assessment.debriefPercentComplete', { percent: Math.round((state.answered / (state.total || 1)) * 100) })}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.round((state.answered / (state.total || 1)) * 100)}%` }}
              />
            </div>
          </div>

          <Card className="rounded-2xl border-border/70 p-6 space-y-5">
            <p className="text-base font-medium leading-relaxed">{state.question.text}</p>
            <Textarea
              value={answer}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAnswer(e.target.value)}
              placeholder={t('assessment.debriefPlaceholder')}
              rows={5}
              className="resize-none text-sm"
              disabled={submitting}
              maxLength={4000}
            />
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={skipQuestion}
                disabled={submitting}
              >
                <SkipForward className="h-3.5 w-3.5" aria-hidden />
                {t('assessment.debriefSkip')}
              </Button>
              <Button
                className="gap-2 rounded-full px-6"
                onClick={submitAnswer}
                disabled={submitting || !answer.trim()}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {state.answered + 1 < state.total ? t('assessment.debriefNextQuestion') : t('assessment.debriefFinish')}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
