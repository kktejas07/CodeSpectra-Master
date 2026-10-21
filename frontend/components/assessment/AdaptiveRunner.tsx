'use client'

/**
 * Adaptive test runner (candidate). Shows the one question the server handed
 * out; "Save and continue" sends the answer to POST /api/exams/[id]/adaptive,
 * which grades it and returns the next question at the next difficulty. There
 * is no going back (the next question depends on this answer). When the
 * server says done, the candidate submits as usual.
 */
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight, Loader2, Send } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { metaFor } from '@/lib/question-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { QuestionAnswerInput, type AnswerQuestion } from '@/components/assessment/QuestionAnswerInput'

export interface AdaptiveViewPayload {
  question: (AnswerQuestion & { title?: string; prompt?: string }) | null
  index: number
  total: number
  answered: number
  done: boolean
  exhausted: boolean
}

export function AdaptiveRunner({
  examId,
  initial,
  onSubmit,
  submitting,
  onExpired,
}: {
  examId: string
  initial: AdaptiveViewPayload
  onSubmit: () => void
  submitting: boolean
  onExpired: () => void
}) {
  const addToast = useToast()
  const [view, setView] = useState(initial)
  const [value, setValue] = useState<string | string[] | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const q = view.question

  // Move focus to the new question so keyboard and screen-reader users follow along.
  useEffect(() => { headingRef.current?.focus() }, [q?.id])

  const empty = value === undefined || (Array.isArray(value) ? value.length === 0 : !String(value).trim())

  const next = async () => {
    if (!q || saving) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/adaptive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: q.id, answer: value ?? '' }),
      })
      const j = await res.json().catch(() => ({})) as { adaptive?: AdaptiveViewPayload; error?: string; expired?: boolean }
      if (res.status === 410 || j.expired) { onExpired(); return }
      if (!res.ok || !j.adaptive) throw new Error(j.error || 'Could not save your answer')
      setView(j.adaptive)
      setValue(undefined)
    } catch (e) {
      addToast({ type: 'error', title: 'Your answer was not saved', message: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  if (!q || view.done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground focus:outline-none">
          {view.answered > 0 ? 'All questions answered' : 'No questions available'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {view.answered > 0
            ? view.exhausted
              ? `You answered ${view.answered} question${view.answered === 1 ? '' : 's'} — that's every question available for this test. Submit to hand it in.`
              : 'Submit your assessment to hand it in.'
            : 'This test has no questions ready yet. Submit to close it and contact the organiser.'}
        </p>
        <Button onClick={onSubmit} disabled={submitting} className="mt-5 gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Submit assessment
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{metaFor(q.type).label}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">Question {view.index} of {view.total}</span>
          <span className="text-xs text-muted-foreground">· Adaptive: questions get harder or easier as you go</span>
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-foreground focus:outline-none">{q.title || `Question ${view.index}`}</h2>
        <div className="prose prose-zinc max-w-none rounded-2xl border border-border/70 bg-card p-5 text-foreground dark:prose-invert sm:p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.prompt || ''}</ReactMarkdown>
        </div>
      </div>
      <QuestionAnswerInput question={q} value={value} onChange={setValue} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 pb-12">
        <p className="text-xs text-muted-foreground">You can’t go back to a question once you continue.</p>
        <Button onClick={() => void next()} disabled={saving || empty} className="min-h-11 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {view.index >= view.total ? 'Save and finish' : 'Save and continue'} <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
