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
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { INTERVIEW_PREP_QUESTIONS, type InterviewPrepQuestion } from '@/lib/interview-prep-data'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

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
          title: 'Interview Prep Home',
          description: 'This page prepares frontend candidates with 300+ questions and AI quizzes in one place.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-prep-actions"]',
          title: 'Browse Or Quiz',
          description: 'Switch tabs to browse questions or generate a custom AI quiz.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-prep-list"]',
          title: 'Study Answers Deeply',
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
        <DashboardPageHeader
          title="Interview Prep"
          description="Master frontend interviews with 300+ questions and AI-powered quizzes"
          icon={Brain}
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2" data-tour="interview-prep-actions">
        <Button
          variant={tab === 'browse' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('browse')}
        >
          <Lightbulb className="mr-1 h-4 w-4" />
          Browse Questions
        </Button>
        {!quizLocked && (
          <Button
            variant={tab === 'quiz' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('quiz')}
          >
            <Zap className="mr-1 h-4 w-4" />
            AI Quiz
          </Button>
        )}
      </div>

      {/* ═══════════════════════ BROWSE TAB ═══════════════════════════════════════ */}
      {tab === 'browse' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <div className="flex gap-1">
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
                <Label className="text-xs">Difficulty</Label>
                <div className="flex gap-1">
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
                <Label className="text-xs">Search</Label>
                <Input
                  placeholder="Filter questions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
              <span>{stats.total} questions</span>
              <span className="text-green-600">{stats.easy} easy</span>
              <span className="text-yellow-600">{stats.medium} medium</span>
              <span className="text-red-600">{stats.hard} hard</span>
            </div>
          </Card>

          {/* Question list */}
          <div className="space-y-2" data-tour="interview-prep-list">
            {filtered.slice(0, 50).map((q) => {
              const isOpen = expandedId === q.id
              const answer = answers[q.id]
              const isLoading = loadingAnswer === q.id
              return (
                <Card key={q.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
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
                            q.difficulty === 'Easy' ? 'border-green-500 text-green-600'
                              : q.difficulty === 'Medium' ? 'border-yellow-500 text-yellow-600'
                              : 'border-red-500 text-red-600'
                          }`}
                        >
                          {q.difficulty}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{q.id}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{q.question}</p>
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
                    <div className="border-t bg-muted/20 p-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Answer</p>
                        <p className="whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Key Points</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {answer.keyPoints.map((kp, i) => (
                            <li key={i} className="text-muted-foreground">{kp}</li>
                          ))}
                        </ul>
                      </div>
                      {answer.codeExample && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Code Example</p>
                          <pre className="bg-background rounded border p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                            {answer.codeExample}
                          </pre>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Follow-up Question</p>
                        <p className="italic text-muted-foreground">{answer.commonFollowUp}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded bg-blue-50 dark:bg-blue-950/30 p-2">
                        <Lightbulb className="h-4 w-4 text-blue-500 shrink-0" />
                        <p className="text-xs">{answer.tip}</p>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
            {filtered.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                No questions match your filters.
              </Card>
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
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <h3 className="font-semibold">Generate a Custom Quiz</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                AI will generate {quizCount} multiple-choice questions based on your preferences.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
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
                  <Label className="text-xs">Difficulty</Label>
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
                  <Label className="text-xs">Questions (1-10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={quizCount}
                    onChange={(e) => setQuizCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Focus Topic (optional)</Label>
                <Input
                  placeholder="e.g. closures, hooks, server components"
                  value={quizFocus}
                  onChange={(e) => setQuizFocus(e.target.value)}
                />
              </div>
              <Button onClick={generateQuiz} disabled={quizLoading}>
                {quizLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                Generate Quiz
              </Button>
            </Card>
          )}

          {quizLoading && (
            <Card className="p-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">Generating your quiz...</p>
            </Card>
          )}

          {quizQuestions.length > 0 && !quizSubmitted && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-500" />
                  <h3 className="font-semibold">Question {quizIndex + 1} of {quizQuestions.length}</h3>
                </div>
                <Badge variant="outline">{quizQuestions[quizIndex]?.difficulty}</Badge>
              </div>
              <p className="text-sm font-medium leading-relaxed">
                {quizQuestions[quizIndex]?.question}
              </p>
              <div className="space-y-2">
                {quizQuestions[quizIndex]?.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`w-full text-left p-3 rounded border text-sm transition-colors ${
                      quizAnswers[quizIndex] === i
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                        : 'hover:bg-muted/30'
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
                    Submit Quiz
                  </Button>
                )}
              </div>
            </Card>
          )}

          {quizSubmitted && quizScore && (
            <div className="space-y-4">
              <Card className="p-6 text-center space-y-3">
                <p className="text-4xl font-bold">{quizScore.pct}%</p>
                <p className="text-sm text-muted-foreground">
                  {quizScore.correct} / {quizScore.total} correct
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => { setQuizSubmitted(false); setQuizIndex(0) }}>
                    Review Answers
                  </Button>
                  <Button size="sm" onClick={generateQuiz}>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    New Quiz
                  </Button>
                </div>
              </Card>

              {quizQuestions.map((q, i) => {
                const picked = quizAnswers[i]
                const correct = picked === q.correctIndex
                return (
                  <Card key={q.id} className={`p-4 border-l-4 ${correct ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <div className="flex items-start gap-2 mb-2">
                      {correct ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm font-medium">{q.question}</p>
                    </div>
                    <div className="ml-6 space-y-1 text-xs">
                      <p>
                        Your answer: <span className={correct ? 'text-green-600' : 'text-red-600'}>
                          {q.options[picked] ?? 'No answer'}
                        </span>
                      </p>
                      {!correct && (
                        <p>Correct: <span className="text-green-600">{q.options[q.correctIndex]}</span></p>
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
