'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BrainCircuit, Clock, Flag, AlertTriangle, Loader2,
  CheckCircle2, XCircle, AlertCircle, Send, BarChart3,
} from 'lucide-react'
import { SkeletonCard, SkeletonButton } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { CATEGORY_LABELS, type FluencyQuestion, type FluencyEvaluation, type CategoryBreakdown } from '@/lib/assessments/ai-fluency-types'

interface StoredSession {
  sessionId: string
  firstQuestion: FluencyQuestion
  totalQuestions: number
  categories: string[]
  difficulty: string
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function AiFluencySessionPage() {
  const gate = usePageGuard('user')
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session')

  const [stored, setStored] = useState<StoredSession | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<FluencyQuestion | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [evaluation, setEvaluation] = useState<FluencyEvaluation | null>(null)
  const [showEvaluation, setShowEvaluation] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')
  const [scores, setScores] = useState<number[]>([])
  const [categoryScores, setCategoryScores] = useState<Map<string, number[]>>(new Map())
  const answerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!sessionId) {
      router.push('/dashboard/assessments/ai-fluency/setup')
      return
    }
    try {
      const raw = sessionStorage.getItem(`aifl_${sessionId}`)
      if (!raw) {
        router.push('/dashboard/assessments/ai-fluency/setup')
        return
      }
      const data: StoredSession = JSON.parse(raw)
      setStored(data)
      setCurrentQuestion(data.firstQuestion)
      setTotalQuestions(data.totalQuestions)
    } catch {
      router.push('/dashboard/assessments/ai-fluency/setup')
    }
  }, [sessionId, router])

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const submitAnswer = useCallback(async () => {
    if (!sessionId || !currentQuestion || !answer.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/assessments/ai-fluency/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          answer: answer.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to submit answer.')
        setSubmitting(false)
        return
      }

      const eval_ = data.evaluation as FluencyEvaluation
      setEvaluation(eval_)
      setShowEvaluation(true)
      setScores((prev) => [...prev, eval_.score])

      // Track per-category scores
      setCategoryScores(prev => {
        const next = new Map(prev)
        const cat = currentQuestion.category
        const arr = next.get(cat) || []
        next.set(cat, [...arr, eval_.score])
        return next
      })

      setAnswer('')

      setTimeout(() => {
        setShowEvaluation(false)
        setEvaluation(null)

        if (data.nextQuestion) {
          setCurrentQuestion(data.nextQuestion)
          setQuestionIndex((i) => i + 1)
          answerRef.current?.focus()
        } else {
          handleComplete()
        }
      }, 4000)
    } catch {
      setError('Network error.')
    } finally {
      setSubmitting(false)
    }
  }, [sessionId, currentQuestion, answer])

  const handleComplete = useCallback(async () => {
    if (!sessionId || completing) return
    setCompleting(true)

    try {
      const res = await fetch('/api/assessments/ai-fluency/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })

      const data = await res.json()
      if (res.ok && data.report) {
        sessionStorage.setItem(`aifl_report_${sessionId}`, JSON.stringify(data.report))
        router.push(`/dashboard/assessments/ai-fluency?session=${sessionId}&done=true`)
      }
    } catch {
      setError('Failed to generate report.')
    } finally {
      setCompleting(false)
    }
  }, [sessionId, completing, router])

  if (!gate.ready || !stored) return null

  const isDone = searchParams.get('done') === 'true'

  if (isDone) {
    return <ReportView sessionId={sessionId!} router={router} />
  }

  const progress = totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '--'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">AI Fluency Assessment</span>
          <Badge variant="outline" className="text-[10px]">{stored.difficulty}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime(elapsed)}</span>
          <span>Q{questionIndex + 1}/{totalQuestions}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Score + category bar */}
      {scores.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Avg: <span className="font-medium text-foreground">{avgScore}/10</span></span>
          <span>·</span>
          <span>{scores.length} answered</span>
          {categoryScores.size > 1 && (
            <>
              <span>·</span>
              {Array.from(categoryScores.entries()).map(([cat, sc]) => (
                <span key={cat} className="text-[10px]">
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]?.split(' ')[0]}: {(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1)}
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {/* Question Card */}
      {currentQuestion && !showEvaluation && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {CATEGORY_LABELS[currentQuestion.category]}
            </Badge>
            <Badge variant="outline" className="shrink-0 text-[10px]">{currentQuestion.difficulty}</Badge>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Scenario</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{currentQuestion.scenario}</p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Your Task</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{currentQuestion.task}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Evaluation Display */}
      {showEvaluation && evaluation && (
        <Card className={`p-6 space-y-3 border-2 ${
          evaluation.score >= 7 ? 'border-green-500/40' : evaluation.score >= 4 ? 'border-amber-500/40' : 'border-red-500/40'
        }`}>
          <div className="flex items-center gap-2">
            {evaluation.score >= 7 ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : evaluation.score >= 4 ? (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-semibold">Score: {evaluation.score}/10</span>
          </div>
          {evaluation.detailedFeedback && (
            <p className="text-sm text-muted-foreground">{evaluation.detailedFeedback}</p>
          )}
          {evaluation.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-600 mb-1">Strengths</p>
              {evaluation.strengths.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground">• {s}</p>
              ))}
            </div>
          )}
          {evaluation.improvements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-600 mb-1">Areas to improve</p>
              {evaluation.improvements.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground">• {s}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Answer Input */}
      {!showEvaluation && currentQuestion && (
        <Card className="p-4 space-y-3">
          <textarea
            ref={answerRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here... (be thorough — the AI evaluates depth, accuracy, and practical understanding)"
            className="w-full h-40 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submitAnswer()
              }
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Ctrl+Enter to submit</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleComplete}
                disabled={completing}
              >
                <Flag className="mr-1 h-3 w-3" /> End Early
              </Button>
              <Button
                size="sm"
                onClick={submitAnswer}
                disabled={submitting || !answer.trim()}
              >
                {submitting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                Submit
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function ReportView({ sessionId, router }: { sessionId: string; router: ReturnType<typeof useRouter> }) {
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem(`aifl_report_${sessionId}`)
    if (raw) {
      try { setReport(JSON.parse(raw)) } catch { /* ignore */ }
    }
    setLoading(false)
  }, [sessionId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 bg-muted/60 rounded animate-pulse" />
          <SkeletonButton />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-3 animate-pulse">
          <div className="h-16 w-24 bg-muted/60 rounded" />
          <div className="h-4 w-20 bg-muted/40 rounded" />
        </div>
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p>Report not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/assessments/ai-fluency/setup')}>
          Start New Assessment
        </Button>
      </div>
    )
  }

  const scoreColor = report.overallScore >= 80 ? 'text-green-500' : report.overallScore >= 60 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BrainCircuit className="h-6 w-6 text-primary" /> AI Fluency Report
        </h1>
        <Button variant="outline" onClick={() => router.push('/dashboard/assessments/ai-fluency/setup')}>
          New Assessment
        </Button>
      </div>

      <Card className="p-6 text-center space-y-3">
        <p className={`text-5xl font-bold ${scoreColor}`}>{report.overallScore}</p>
        <p className="text-sm text-muted-foreground">out of 100</p>
        <Badge variant="outline" className="text-sm">{report.level}</Badge>
      </Card>

      {report.summary && (
        <Card className="p-5">
          <p className="text-sm leading-relaxed">{report.summary}</p>
        </Card>
      )}

      {/* Category Breakdown */}
      {report.categoryBreakdown?.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Category Breakdown
          </h3>
          {report.categoryBreakdown.map((cat: CategoryBreakdown) => (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{cat.label}</span>
                <span className="text-muted-foreground">{cat.score}/100 ({cat.count} question{cat.count !== 1 ? 's' : ''})</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    cat.score >= 70 ? 'bg-green-500' : cat.score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, cat.score)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
            <span>Strongest: <span className="text-green-600 font-medium">{report.strongestCategory}</span></span>
            <span>Weakest: <span className="text-amber-600 font-medium">{report.weakestCategory}</span></span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.topStrengths?.length > 0 && (
          <Card className="p-5 space-y-2">
            <h3 className="text-sm font-semibold text-green-600">Top Strengths</h3>
            {report.topStrengths.map((s: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">• {s}</p>
            ))}
          </Card>
        )}
        {report.topImprovements?.length > 0 && (
          <Card className="p-5 space-y-2">
            <h3 className="text-sm font-semibold text-amber-600">Areas to Improve</h3>
            {report.topImprovements.map((s: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground">• {s}</p>
            ))}
          </Card>
        )}
      </div>

      {report.recommendations?.length > 0 && (
        <Card className="p-5 space-y-2">
          <h3 className="text-sm font-semibold">Recommendations</h3>
          {report.recommendations.map((r: string, i: number) => (
            <p key={i} className="text-xs text-muted-foreground">• {r}</p>
          ))}
        </Card>
      )}
    </div>
  )
}
