'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Brain, ChevronDown, ChevronUp, Lightbulb, Loader2, Target, Zap, CheckCircle2, XCircle, RotateCcw, Sparkles } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { INTERVIEW_PREP_QUESTIONS, type InterviewPrepQuestion } from '@/lib/interview-prep-data'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { EmptyState } from '@/components/ui/empty-state'

type Tab = 'browse' | 'quiz'

const CATEGORIES = ['All', 'JavaScript', 'React', 'Next.js'] as const
const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard'] as const

interface AnswerData {
  answer: string
  keyPoints: string[]
  commonFollowUp: string
  codeExample?: string
  tip: string
}

interface QuizQuestion {
  id: string
  question: string
  category: string
  difficulty: string
  options: string[]
  correctIndex: number
  explanation: string
}

export default function InterviewPrepPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const addToast = useToast()
  const { lockedFeatures } = useLockedFeatures()
  const quizLocked = lockedFeatures.includes('interview-prep:quiz')

  const [tab, setTab] = useState<Tab>('browse')
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('All')
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('All')
  const [search, setSearch] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerData>>({})
  const [loadingAnswer, setLoadingAnswer] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return INTERVIEW_PREP_QUESTIONS.filter((q) => {
      if (category !== 'All' && q.category !== category) return false
      if (difficulty !== 'All' && q.difficulty !== difficulty) return false
      if (search && !(q.question.toLowerCase()).includes(search.toLowerCase())) return false
      return true
    })
  }, [category, difficulty, search])

  const stats = useMemo(() => {
    const total = filtered.length
    const easy = filtered.filter((q) => q.difficulty === 'Easy').length
    const medium = filtered.filter((q) => q.difficulty === 'Medium').length
    const hard = filtered.filter((q) => q.difficulty === 'Hard').length
    return { total, easy, medium, hard }
  }, [filtered])

  const fetchAnswer = async (q: InterviewPrepQuestion) => {
    if (answers[q.id]) {
      setExpandedId(expandedId === q.id ? null : q.id)
      return
    }
    setLoadingAnswer(q.id)
    try {
      const res = await csrfFetch('/api/ai/interview-prep-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          questionId: q.id,
          question: q.question,
          category: q.category,
          difficulty: q.difficulty,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to generate answer')
      setAnswers((prev) => ({ ...prev, [q.id]: data }))
      setExpandedId(q.id)
    } catch (e) {
      addToast({ type: 'error', title: 'Answer', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setLoadingAnswer(null)
    }
  }

  // ─── Quiz state ────────────────────────────────────────────────────────────────
  const [quizCategory, setQuizCategory] = useState<'JavaScript' | 'React' | 'Next.js' | 'Mixed'>('Mixed')
  const [quizDifficulty, setQuizDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Mixed')
  const [quizCount, setQuizCount] = useState(5)
  const [quizFocus, setQuizFocus] = useState('')
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const generateQuiz = async () => {
    setQuizLoading(true)
    setQuizQuestions([])
    setQuizIndex(0)
    setQuizAnswers({})
    setQuizSubmitted(false)
    try {
      const res = await csrfFetch('/api/ai/interview-prep-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category: quizCategory,
          difficulty: quizDifficulty,
          count: quizCount,
          focusTopic: quizFocus || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to generate quiz')
      setQuizQuestions(data.questions || [])
    } catch (e) {
      addToast({ type: 'error', title: 'Quiz', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setQuizLoading(false)
    }
  }

  const quizScore = useMemo(() => {
    if (!quizSubmitted) return null
    let correct = 0
    quizQuestions.forEach((q, i) => {
      if (quizAnswers[i] === q.correctIndex) correct++
    })
    return { correct, total: quizQuestions.length, pct: Math.round((correct / quizQuestions.length) * 100) }
  }, [quizSubmitted, quizAnswers, quizQuestions])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const interviewPrepTour: TourStep[] = [
        {
          target: '[data-tour="interview-prep-header"]',
          title: 'Interview prep home',
          description: 'This page prepares frontend candidates with 300+ questions and AI quizzes in one place.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-prep-actions"]',
          title: 'Browse or quiz',
          description: 'Switch tabs to browse questions or generate a custom AI quiz.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-prep-list"]',
          title: 'Study answers deeply',
          description: 'Tip: open one question at a time and study its AI answer, key points, and follow-up.',
          position: 'top',
        },
      ]
      autoPlayPageTour('interview-prep', interviewPrepTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="interview-prep-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            className="mb-0"
            title="Interview prep"
            description="Practice for frontend interviews with 300+ questions and AI-generated quizzes."
            icon={<Brain aria-hidden />}
          />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2" data-tour="interview-prep-actions">
        <Button
          variant={tab === 'browse' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('browse')}
        >
          <Lightbulb className="mr-1 h-4 w-4" />
          Browse questions
        </Button>
        {!quizLocked && (
          <Button
            variant={tab === 'quiz' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('quiz')}
          >
            <Zap className="mr-1 h-4 w-4" />
            AI quiz
          </Button>
        )}
      </div>

      {/* ═══════════════════════ BROWSE TAB ═══════════════════════════════════════ */}
      {tab === 'browse' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="rounded-3xl border-border/70 p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Category</p>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((c) => (
                    <Button
                      key={c}
                      variant={category === c ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Difficulty</p>
                <div className="flex flex-wrap gap-1">
                  {DIFFICULTIES.map((d) => (
                    <Button
                      key={d}
                      variant={difficulty === d ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDifficulty(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-50">
                <Label htmlFor="prep-search" className="text-xs">Search</Label>
                <Input
                  id="prep-search"
                  placeholder="Filter questions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs tabular-nums text-muted-foreground">
              <span>{stats.total} questions</span>
              <span className="text-green-700 dark:text-green-400">{stats.easy} easy</span>
              <span className="text-amber-700 dark:text-amber-400">{stats.medium} medium</span>
              <span className="text-red-600 dark:text-red-400">{stats.hard} hard</span>
            </div>
          </Card>

          {/* Question list */}
          <div className="space-y-2" data-tour="interview-prep-list">
            {filtered.slice(0, 50).map((q) => {
              const isOpen = expandedId === q.id
              const answer = answers[q.id]
              const isLoading = loadingAnswer === q.id
              return (
                <Card key={q.id} className="overflow-hidden rounded-2xl border-border/70">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    onClick={() => {
                      if (!answer && !isLoading) fetchAnswer(q)
                      else setExpandedId(isOpen ? null : q.id)
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] shrink-0">{q.category}</Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            q.difficulty === 'Easy' ? 'border-green-500/60 text-green-700 dark:text-green-400'
                              : q.difficulty === 'Medium' ? 'border-amber-500/60 text-amber-700 dark:text-amber-400'
                              : 'border-red-500/60 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {q.difficulty}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{q.id}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug text-foreground">{q.question}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : isOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isOpen && answer && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Answer</p>
                        <p className="whitespace-pre-wrap leading-relaxed text-foreground">{answer.answer}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Key points</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {answer.keyPoints.map((kp, i) => (
                            <li key={i} className="text-muted-foreground">{kp}</li>
                          ))}
                        </ul>
                      </div>
                      {answer.codeExample && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Code example</p>
                          <pre className="bg-background rounded-xl border border-border p-3 font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
                            {answer.codeExample}
                          </pre>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Follow-up question</p>
                        <p className="italic text-muted-foreground">{answer.commonFollowUp}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <Lightbulb className="h-4 w-4 text-primary shrink-0" aria-hidden />
                        <p className="text-xs text-foreground">{answer.tip}</p>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
            {filtered.length === 0 && (
              <EmptyState variant="search" title="No questions match" description="Try another category or clear the search." />
            )}
            {filtered.length > 50 && (
              <p className="text-center text-xs text-muted-foreground py-2">
                Showing 50 of {filtered.length} questions. Adjust filters to narrow down.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════ QUIZ TAB ════════════════════════════════════════ */}
      {tab === 'quiz' && !quizLocked && (
        <div className="space-y-4">
          {quizQuestions.length === 0 && !quizLoading && (
            <Card className="rounded-3xl border-border/70 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="text-base font-semibold text-foreground">Generate a custom quiz</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                AI will generate {quizCount} multiple-choice questions based on your preferences.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Category</p>
                  <div className="flex flex-wrap gap-1">
                    {(['Mixed', 'JavaScript', 'React', 'Next.js'] as const).map((c) => (
                      <Button
                        key={c}
                        variant={quizCategory === c ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setQuizCategory(c)}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Difficulty</p>
                  <div className="flex flex-wrap gap-1">
                    {(['Mixed', 'Easy', 'Medium', 'Hard'] as const).map((d) => (
                      <Button
                        key={d}
                        variant={quizDifficulty === d ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setQuizDifficulty(d)}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quiz-count" className="text-xs">Questions (1–10)</Label>
                  <Input
                    id="quiz-count"
                    type="number"
                    min={1}
                    max={10}
                    value={quizCount}
                    onChange={(e) => setQuizCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="quiz-focus" className="text-xs">Focus topic (optional)</Label>
                <Input
                  id="quiz-focus"
                  placeholder="e.g. closures, hooks, server components"
                  value={quizFocus}
                  onChange={(e) => setQuizFocus(e.target.value)}
                />
              </div>
              <Button onClick={generateQuiz} disabled={quizLoading}>
                {quizLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                Generate quiz
              </Button>
            </Card>
          )}

          {quizLoading && (
            <Card className="rounded-3xl p-8 text-center space-y-3">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">Generating your quiz…</p>
            </Card>
          )}

          {quizQuestions.length > 0 && !quizSubmitted && (
            <Card className="rounded-3xl border-border/70 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" aria-hidden />
                  <h3 className="text-base font-semibold tabular-nums text-foreground">Question {quizIndex + 1} of {quizQuestions.length}</h3>
                </div>
                <Badge variant="outline">{quizQuestions[quizIndex]?.difficulty}</Badge>
              </div>
              <p className="text-sm font-medium leading-relaxed text-foreground">
                {quizQuestions[quizIndex]?.question}
              </p>
              <div className="space-y-2">
                {quizQuestions[quizIndex]?.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={quizAnswers[quizIndex] === i}
                    className={`w-full text-left p-3 rounded-xl border text-sm text-foreground transition-colors duration-200 ${
                      quizAnswers[quizIndex] === i
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40 hover:bg-muted/30'
                    }`}
                    onClick={() => setQuizAnswers((prev) => ({ ...prev, [quizIndex]: i }))}
                  >
                    <span className="font-mono text-xs text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={quizIndex === 0}
                  onClick={() => setQuizIndex((i) => i - 1)}
                >
                  Previous
                </Button>
                {quizIndex < quizQuestions.length - 1 ? (
                  <Button
                    size="sm"
                    disabled={quizAnswers[quizIndex] === undefined}
                    onClick={() => setQuizIndex((i) => i + 1)}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                    onClick={() => setQuizSubmitted(true)}
                  >
                    Submit quiz
                  </Button>
                )}
              </div>
            </Card>
          )}

          {quizSubmitted && quizScore && (
            <div className="space-y-4">
              <Card className="rounded-3xl border-border/70 p-6 text-center space-y-3">
                <p className="text-4xl font-bold tabular-nums text-foreground">{quizScore.pct}%</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {quizScore.correct} / {quizScore.total} correct
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => { setQuizSubmitted(false); setQuizIndex(0) }}>
                    Review answers
                  </Button>
                  <Button size="sm" onClick={generateQuiz}>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    New quiz
                  </Button>
                </div>
              </Card>

              {quizQuestions.map((q, i) => {
                const picked = quizAnswers[i]
                const correct = picked === q.correctIndex
                return (
                  <Card key={q.id} className={`rounded-2xl p-4 border-l-4 ${correct ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div className="flex items-start gap-2 mb-2">
                      {correct ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" aria-hidden />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden />
                      )}
                      <p className="text-sm font-medium text-foreground">{q.question}</p>
                    </div>
                    <div className="ml-6 space-y-1 text-xs text-foreground">
                      <p>
                        Your answer: <span className={correct ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {q.options[picked] ?? 'No answer'}
                        </span>
                      </p>
                      {!correct && (
                        <p>Correct: <span className="text-green-700 dark:text-green-400">{q.options[q.correctIndex]}</span></p>
                      )}
                      <p className="text-muted-foreground mt-1">{q.explanation}</p>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
