'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, HelpCircle, RotateCcw, BookOpen, Lightbulb, Bookmark } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'code' | 'true_false'
  question: string
  options: string[]
  /** Absent when the quiz is graded on the server (answer key never reaches the browser). */
  correct?: number
  explanation?: string
}

export type QuizGradeResult = {
  score: number
  total: number
  passed: boolean
  results: Array<{ questionIndex: number; userAnswer: number | null; correctAnswer: number; isCorrect: boolean; explanation?: string }>
}

export type QuizBookmarkContext = {
  courseId: string
  courseTitle?: string
  lessonId: string
  href?: string
}

interface QuizComponentProps {
  questions: QuizQuestion[]
  onComplete?: (score: number, total: number) => void
  readOnly?: boolean
  /** Optional lesson to re-open when the learner gets a question wrong */
  reviewHref?: string
  reviewLabel?: string
  passPercent?: number
  /** When set, each question can be bookmarked (snapshot stored server-side). */
  bookmark?: QuizBookmarkContext
  /**
   * Server grading. When set, answers are collected for every question and
   * submitted at the end; correct answers are only shown from the server's
   * response. `onComplete` then receives the server's score.
   */
  grade?: (answers: Record<number, number>) => Promise<QuizGradeResult>
}

/**
 * Interactive module quiz (Unstop-style): pick → submit → see correct/wrong + reteach.
 * Not narrated inside the video.
 */
export function QuizComponent({
  questions,
  onComplete,
  readOnly = false,
  reviewHref,
  reviewLabel = 'Review the lesson',
  passPercent = 80,
  bookmark,
  grade,
}: QuizComponentProps) {
  const graded = !!grade
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [graderResult, setGraderResult] = useState<QuizGradeResult | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [completed, setCompleted] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [bookmarkBusy, setBookmarkBusy] = useState(false)

  useEffect(() => {
    if (!bookmark?.courseId || !bookmark.lessonId) return
    let cancelled = false
    fetch('/api/user/quiz-bookmarks', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.items) return
        const ids = new Set<string>()
        for (const it of d.items as { courseId?: string; lessonId?: string; questionId?: string }[]) {
          if (it.courseId === bookmark.courseId && it.lessonId === bookmark.lessonId && it.questionId) {
            ids.add(it.questionId)
          }
        }
        setBookmarkedIds(ids)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [bookmark?.courseId, bookmark?.lessonId])

  async function toggleBookmark(q: QuizQuestion, key: { correct?: number; explanation?: string } = q) {
    if (!bookmark || bookmarkBusy || readOnly || typeof key.correct !== 'number') return
    setBookmarkBusy(true)
    const next = !bookmarkedIds.has(q.id)
    setBookmarkedIds((prev) => {
      const s = new Set(prev)
      if (next) s.add(q.id)
      else s.delete(q.id)
      return s
    })
    try {
      const r = await csrfFetch('/api/user/quiz-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: bookmark.courseId,
          courseTitle: bookmark.courseTitle || '',
          lessonId: bookmark.lessonId,
          questionId: q.id,
          question: q.question,
          options: q.options,
          correct: key.correct,
          explanation: key.explanation || '',
          href:
            bookmark.href ||
            `/dashboard/courses/${encodeURIComponent(bookmark.courseId)}/lesson/${encodeURIComponent(bookmark.lessonId)}`,
        }),
      })
      if (r.ok) {
        const d = await r.json()
        setBookmarkedIds((prev) => {
          const s = new Set(prev)
          if (d.saved) s.add(q.id)
          else s.delete(q.id)
          return s
        })
      } else {
        setBookmarkedIds((prev) => {
          const s = new Set(prev)
          if (next) s.delete(q.id)
          else s.add(q.id)
          return s
        })
      }
    } catch {
      setBookmarkedIds((prev) => {
        const s = new Set(prev)
        if (next) s.delete(q.id)
        else s.add(q.id)
        return s
      })
    } finally {
      setBookmarkBusy(false)
    }
  }

  const question = questions[currentQ]
  const isCorrect = selected === question?.correct
  const score = Object.entries(answers).filter(([idx, ans]) => questions[parseInt(idx)]?.correct === ans).length

  const handleSelect = (optionIndex: number) => {
    if (showAnswer || readOnly) return
    setSelected(optionIndex)
  }

  const handleSubmit = () => {
    if (selected === null) return
    setAnswers({ ...answers, [currentQ]: selected })
    setShowAnswer(true)
  }

  /** Let them re-pick on this question after seeing the reteach (wrong answers only). */
  const handleTryAgain = () => {
    const next = { ...answers }
    delete next[currentQ]
    setAnswers(next)
    setSelected(null)
    setShowAnswer(false)
  }

  const submitForGrading = async (all: Record<number, number>) => {
    if (!grade) return
    setGrading(true)
    setGradeError(null)
    try {
      const r = await grade(all)
      setGraderResult(r)
      setCompleted(true)
      const correctCount = r.results.filter((x) => x.isCorrect).length
      onComplete?.(correctCount, r.total || questions.length)
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'Could not submit your answers. Try again.')
    } finally {
      setGrading(false)
    }
  }

  /** Server-graded mode: lock this answer in and move on (no answer reveal until the end). */
  const handleGradedNext = () => {
    if (selected === null) return
    const all = { ...answers, [currentQ]: selected }
    setAnswers(all)
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
      setSelected(all[currentQ + 1] ?? null)
    } else {
      void submitForGrading(all)
    }
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
      setSelected(null)
      setShowAnswer(false)
    } else {
      setCompleted(true)
      onComplete?.(score, questions.length)
    }
  }

  const handleRetryAll = () => {
    setGraderResult(null)
    setGradeError(null)
    setCurrentQ(0)
    setSelected(null)
    setShowAnswer(false)
    setAnswers({})
    setCompleted(false)
  }

  if (!questions.length) {
    return <p className="text-sm text-muted-foreground p-4">No quiz questions yet.</p>
  }

  if (completed) {
    const keyFor = (i: number) => {
      const r = graderResult?.results.find((x) => x.questionIndex === i)
      return r
        ? { correct: r.correctAnswer, explanation: r.explanation || questions[i]?.explanation || '' }
        : { correct: questions[i]?.correct, explanation: questions[i]?.explanation || '' }
    }
    const finalScore = graderResult ? graderResult.results.filter((x) => x.isCorrect).length : score
    const percentage = graderResult ? graderResult.score : Math.round((score / questions.length) * 100)
    const passed = graderResult ? graderResult.passed : percentage >= passPercent
    const missed = questions
      .map((q, i) => ({ q, i, picked: answers[i], key: keyFor(i) }))
      .filter(({ picked, key }) => picked !== key.correct)

    return (
      <div className="p-6 space-y-5">
        <div className="text-center space-y-2">
          <div
            className="text-4xl font-bold"
            style={{ color: passed ? '#22c55e' : percentage >= 50 ? '#f59e0b' : '#ef4444' }}
          >
            {passed ? 'Passed' : 'Not yet'}
          </div>
          <h3 className="text-2xl font-bold">
            {finalScore} / {questions.length} · {percentage}%
          </h3>
          <p className="text-muted-foreground text-sm">
            {passed
              ? 'Nice work — you can continue to the next module.'
              : `You need ${passPercent}% to pass. Review the concepts below, then retry.`}
          </p>
        </div>

        {missed.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 text-left">
            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
              Concepts to review
            </div>
            {missed.map(({ q, i, picked, key }) => (
              <div key={q.id || i} className="text-sm border-t border-border/40 pt-3 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-foreground">{q.question}</p>
                  {bookmark && graded && typeof key.correct === 'number' ? (
                    <Button
                      aria-label={bookmarkedIds.has(q.id) ? 'Remove bookmark' : 'Bookmark question'}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 shrink-0"
                      disabled={bookmarkBusy}
                      onClick={() => void toggleBookmark(q, key)}
                    >
                      <Bookmark className={`h-4 w-4 ${bookmarkedIds.has(q.id) ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </Button>
                  ) : null}
                </div>
                <p className="text-red-600 dark:text-red-400 mt-1">
                  Your answer: {typeof picked === 'number' ? q.options[picked] : '—'}
                </p>
                <p className="text-green-700 dark:text-green-400 mt-0.5">
                  Correct: {typeof key.correct === 'number' ? q.options[key.correct] : '—'}
                </p>
                {key.explanation ? <p className="text-muted-foreground mt-1">{key.explanation}</p> : null}
              </div>
            ))}
            {reviewHref && (
              <Button variant="outline" size="sm" asChild className="mt-1">
                <Link href={reviewHref}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {reviewLabel}
                </Link>
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          <Button variant="outline" onClick={handleRetryAll}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Retry quiz
          </Button>
        </div>
      </div>
    )
  }

  if (!question) return null

  const correctLabel = typeof question.correct === 'number' ? question.options[question.correct] : ''

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">
          Question {currentQ + 1} of {questions.length}
        </Badge>
        <div className="flex items-center gap-2">
          {bookmark && !graded ? (
            <Button
              aria-label={bookmarkedIds.has(question.id) ? 'Remove bookmark' : 'Bookmark question'}
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={bookmarkBusy || readOnly}
              title={bookmarkedIds.has(question.id) ? 'Remove bookmark' : 'Bookmark question'}
              onClick={() => void toggleBookmark(question)}
            >
              <Bookmark
                className={`h-4 w-4 ${bookmarkedIds.has(question.id) ? 'fill-amber-400 text-amber-400' : ''}`}
              />
            </Button>
          ) : null}
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < currentQ
                    ? graded
                      ? 'bg-primary/60'
                      : answers[i] === questions[i].correct
                        ? 'bg-green-500'
                        : 'bg-red-500'
                    : i === currentQ
                      ? 'bg-primary'
                      : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {graded ? (
          <>Choose an answer for each question. Your answers are checked when you press <span className="font-medium text-foreground">Submit answers</span>.</>
        ) : (
          <>Choose an answer, then press <span className="font-medium text-foreground">Check answer</span>.</>
        )}
      </p>

      <div className="text-lg font-medium leading-snug">{question.question}</div>

      <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
        {question.options.map((option, i) => {
          const isSelected = selected === i
          const isCorrectOption = i === question.correct
          const showCorrect = showAnswer && isCorrectOption
          const showWrong = showAnswer && isSelected && !isCorrectOption

          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(i)}
              disabled={showAnswer || readOnly}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                showCorrect
                  ? 'border-green-500 bg-green-500/10 text-green-800 dark:text-green-300'
                  : showWrong
                    ? 'border-red-500 bg-red-500/10 text-red-800 dark:text-red-300'
                    : isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="font-mono text-sm mt-0.5">{String.fromCharCode(65 + i)})</span>
                <span className="flex-1">{option}</span>
                {showCorrect && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />}
                {showWrong && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
              </div>
            </button>
          )
        })}
      </div>

      {showAnswer && (
        <div
          className={`p-4 rounded-lg border space-y-3 ${
            isCorrect
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}
        >
          <div className="flex items-start gap-2">
            {isCorrect ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className={`font-semibold ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {isCorrect ? 'Correct!' : 'Incorrect'}
              </div>
              {!isCorrect && (
                <p className="text-sm">
                  Correct answer: <span className="font-medium text-foreground">{correctLabel}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 pl-0.5">
            <HelpCircle className={`h-4 w-4 shrink-0 mt-0.5 ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div>
              <p className="text-sm font-medium text-foreground mb-0.5">
                {isCorrect ? 'Why this is right' : 'Why this matters — learn it again'}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{question.explanation}</p>
            </div>
          </div>

          {!isCorrect && reviewHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={reviewHref}>
                <BookOpen className="h-4 w-4 mr-2" />
                {reviewLabel}
              </Link>
            </Button>
          )}
        </div>
      )}

      {gradeError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{gradeError}</p>
      )}

      <div className="flex justify-end gap-2 flex-wrap">
        {graded ? (
          <>
            {currentQ > 0 && (
              <Button
                variant="outline"
                disabled={grading}
                onClick={() => {
                  const all = selected === null ? answers : { ...answers, [currentQ]: selected }
                  setAnswers(all)
                  setCurrentQ(currentQ - 1)
                  setSelected(all[currentQ - 1] ?? null)
                }}
              >
                Previous question
              </Button>
            )}
            <Button onClick={handleGradedNext} disabled={selected === null || readOnly || grading}>
              {currentQ < questions.length - 1 ? 'Next question' : grading ? 'Checking…' : 'Submit answers'}
            </Button>
          </>
        ) : !showAnswer ? (
          <Button onClick={handleSubmit} disabled={selected === null || readOnly}>
            Check answer
          </Button>
        ) : (
          <>
            {!isCorrect && (
              <Button variant="outline" onClick={handleTryAgain}>
                Try this question again
              </Button>
            )}
            <Button onClick={handleNext}>
              {currentQ < questions.length - 1 ? 'Next question' : 'See results'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
