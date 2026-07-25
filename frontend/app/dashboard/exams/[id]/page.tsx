'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ProctorMonitor } from '@/components/ai/proctor-monitor'
import {
  Clock, AlertTriangle, Send, ArrowLeft, Loader2,
  CheckCircle, XCircle, ChevronRight,
} from 'lucide-react'

interface ExamQuestion {
  id: string
  question: string
  type: 'multiple-choice' | 'short-answer' | 'code'
  options?: string[]
  time_limit_seconds: number
  points: number
}

interface ExamDoc {
  id: string
  title: string
  description: string
  duration_minutes: number
  questions: ExamQuestion[]
  status: string
}

export default function ExamPage() {
  const params = useParams()
  const router = useRouter()
  const gate = usePageGuard()
  const examId = params.id as string

  const [exam, setExam] = useState<ExamDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{ score: number; total: number; details: Array<{ qId: string; correct: boolean; points: number }> } | null>(null)

  useEffect(() => {
    fetch(`/api/exams/${examId}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setExam(data)
          setTimeRemaining((data.duration_minutes || 30) * 60)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [examId])

  // Timer with auto-submit
  useEffect(() => {
    if (!exam || submitted || timeRemaining <= 0) return
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [exam, submitted, timeRemaining])

  const handleSubmit = useCallback(async (autoSubmitted = false) => {
    if (submitted || submitting) return
    setSubmitting(true)
    try {
      const res = await csrfFetch(`/api/exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, auto_submitted: autoSubmitted }),
      })
      const data = await res.json()
      setResults(data)
      setSubmitted(true)
    } catch {
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }, [examId, answers, submitted, submitting])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!gate.ready) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!exam) return <div className="p-8 text-center text-muted-foreground">Exam not found.</div>

  const isLowTime = timeRemaining <= 60 && timeRemaining > 0
  const question = exam.questions[currentQ]

  // Results view
  if (submitted && results) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Card className="p-8 text-center space-y-4">
          <h1 className="text-3xl font-bold">Exam Complete</h1>
          <div className="text-5xl font-bold text-primary">{results.score}/{results.total}</div>
          <p className="text-muted-foreground">
            {results.score / results.total >= 0.7 ? 'Great job!' : 'Keep practicing!'}
          </p>
        </Card>
        <div className="space-y-3">
          {results.details.map((d, i) => (
            <Card key={d.qId} className="p-4 flex items-center gap-3">
              {d.correct ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
              <span className="flex-1 text-sm">Question {i + 1}</span>
              <Badge variant={d.correct ? 'default' : 'destructive'}>{d.points} pts</Badge>
            </Card>
          ))}
        </div>
        <Button onClick={() => router.push('/dashboard/exams')} className="w-full">Back to Exams</Button>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      <ProctorMonitor
        sessionKind="exam"
        sessionId={examId}
        enabled
        enforceFullscreen
        captureInterval={30000}
        kickoutThreshold={5}
        blockKeyboardShortcuts
        lockdownBrowser
        detectFace
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/exams')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-semibold truncate">{exam.title}</h1>
          <Badge variant="outline">{currentQ + 1}/{exam.questions.length}</Badge>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
          timeRemaining === 0 ? 'bg-red-500/20 text-red-400 animate-pulse' :
          isLowTime ? 'bg-red-500/10 text-red-400' : 'bg-muted'
        }`}>
          <Clock className="h-4 w-4" />
          <span className="text-sm font-mono font-medium">{formatTime(timeRemaining)}</span>
          {isLowTime && <AlertTriangle className="h-4 w-4" />}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {question && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Badge>{question.type}</Badge>
                <Badge variant="outline">{question.points} pts</Badge>
                <Badge variant="outline">{question.time_limit_seconds}s limit</Badge>
              </div>
              <p className="text-lg">{question.question}</p>

              {question.type === 'multiple-choice' && question.options && (
                <div className="space-y-2">
                  {question.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setAnswers(a => ({ ...a, [question.id]: opt }))}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        answers[question.id] === opt
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {(question.type === 'short-answer' || question.type === 'code') && (
                <Textarea
                  value={answers[question.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [question.id]: e.target.value }))}
                  placeholder={question.type === 'code' ? 'Write your code here...' : 'Type your answer...'}
                  className="min-h-32 font-mono text-sm"
                />
              )}
            </Card>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                disabled={currentQ === 0}
                onClick={() => setCurrentQ(q => q - 1)}
              >
                Previous
              </Button>

              <div className="flex gap-1">
                {exam.questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                      i === currentQ ? 'bg-primary text-primary-foreground' :
                      answers[exam.questions[i].id] ? 'bg-primary/20 text-primary' :
                      'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              {currentQ < exam.questions.length - 1 ? (
                <Button onClick={() => setCurrentQ(q => q + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={() => handleSubmit(false)} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit Exam
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
