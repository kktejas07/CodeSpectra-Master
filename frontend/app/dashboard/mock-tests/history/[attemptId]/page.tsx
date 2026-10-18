'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ClipboardList, MinusCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { formatDate } from '@/lib/format-datetime'
import { cn } from '@/lib/utils'
import { formatDuration, resumeHref } from '../_format'

interface Attempt {
  id: string
  company: string
  role: string
  difficulty: string
  status: 'submitted' | 'in_progress'
  score: number | null
  total: number
  percentage: number | null
  created_at: string
  submitted_at: string | null
  time_taken_sec: number | null
  answered: number
}

interface ReviewQuestion {
  index: number
  question: string
  options: string[]
  chosen_index: number | null
  correct_index: number
  correct: boolean
  explanation: string
}

export default function MockTestAttemptPage() {
  const gate = usePageGuard('user')
  const params = useParams()
  const attemptId = String(params?.attemptId ?? '')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [questions, setQuestions] = useState<ReviewQuestion[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    if (!gate.ready || !attemptId) return
    const ac = new AbortController()
    fetch(`/api/mock-tests/attempts/${encodeURIComponent(attemptId)}`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (r.status === 404) return setState('missing')
        if (!r.ok) throw new Error(String(r.status))
        const d = (await r.json()) as { attempt: Attempt; questions: ReviewQuestion[] | null }
        setAttempt(d.attempt)
        setQuestions(d.questions)
        setState('ready')
      })
      .catch(() => { if (!ac.signal.aborted) setState('error') })
    return () => ac.abort()
  }, [gate.ready, attemptId])

  if (!gate.ready) return null

  const back = (
    <Link href="/dashboard/mock-tests/history" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to history
    </Link>
  )

  if (state === 'loading') {
    return <div className="space-y-6">{back}<p className="text-sm text-muted-foreground" aria-live="polite">Loading this attempt…</p></div>
  }
  if (state === 'error') {
    return <div className="space-y-6">{back}<p className="text-sm text-destructive" role="alert">Couldn&apos;t load this attempt. Refresh to try again.</p></div>
  }
  if (state === 'missing' || !attempt) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState
          illustration="mock-test"
          title="Attempt not found"
          description="It may have been replaced by a newer test or expired. Your other attempts are in your history."
          actionLabel="Open history"
          actionHref="/dashboard/mock-tests/history"
        />
      </div>
    )
  }

  const correct = questions?.filter((q) => q.correct).length ?? 0
  const skipped = questions?.filter((q) => q.chosen_index === null).length ?? 0

  return (
    <div className="flex-1 space-y-6">
      {back}
      <PageHeader
        className="mb-0"
        icon={<ClipboardList aria-hidden />}
        title={`${attempt.company} · ${attempt.role}`}
        description={
          attempt.status === 'submitted'
            ? `Submitted ${formatDate(attempt.submitted_at)} · ${attempt.difficulty}`
            : `Started ${formatDate(attempt.created_at)} · ${attempt.difficulty}`
        }
      />

      {attempt.status === 'in_progress' ? (
        <Panel className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This test is still open. You&apos;ve answered <span className="tabular-nums">{attempt.answered}</span> of{' '}
            <span className="tabular-nums">{attempt.total}</span> questions. The right answers show here after you submit.
          </p>
          <Button asChild className="min-h-11">
            <Link href={resumeHref(attempt)}>Resume test</Link>
          </Button>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Score" value={`${attempt.percentage ?? 0}%`} hint={`${attempt.score ?? 0} of ${attempt.total} correct`} />
            <StatCard label="Time taken" value={formatDuration(attempt.time_taken_sec)} />
            <StatCard label="Skipped" value={skipped} hint={`${correct} right · ${attempt.total - correct - skipped} wrong`} />
          </div>

          <ol className="space-y-4" aria-label="Questions and answers">
            {(questions ?? []).map((q) => (
              <li key={q.index}>
                <Panel className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    {q.correct ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                    ) : q.chosen_index === null ? (
                      <MinusCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Question <span className="tabular-nums">{q.index + 1}</span> ·{' '}
                        {q.correct ? 'Correct' : q.chosen_index === null ? 'Skipped' : 'Incorrect'}
                      </p>
                      <p className="mt-1 font-medium text-foreground whitespace-pre-wrap">{q.question}</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {q.options.map((opt, i) => {
                      const isCorrect = i === q.correct_index
                      const isChosen = i === q.chosen_index
                      return (
                        <li
                          key={i}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-sm',
                            isCorrect
                              ? 'border-green-500/40 bg-green-500/10 text-foreground'
                              : isChosen
                                ? 'border-red-500/40 bg-red-500/10 text-foreground'
                                : 'border-border text-muted-foreground',
                          )}
                        >
                          {opt}
                          {(isCorrect || isChosen) && (
                            <span className="ml-2 text-xs font-medium">
                              {isCorrect && isChosen ? '(your answer, correct)' : isCorrect ? '(correct answer)' : '(your answer)'}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {q.explanation && (
                    <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{q.explanation}</p>
                  )}
                </Panel>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
