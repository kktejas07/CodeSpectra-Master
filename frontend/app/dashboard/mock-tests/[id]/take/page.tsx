'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { usePageGuard } from '@/lib/use-page-guard'

interface Question {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export default function TakeMockTestPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const difficulty = searchParams?.get('difficulty') || 'basic'
  
  // Parse company/role from id, e.g. "tcs-software-engineer"
  const paramId = params?.id || ''
  const [company, role] = paramId.split('-', 2).concat(paramId.split('-').slice(2).join(' ')).map(s => s || '')

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [finished, setFinished] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15 * 60) // 15 mins default

  const fetchQuestions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await csrfFetch('/api/mock-tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.toUpperCase(),
          role: role.replace(/-/g, ' '),
          difficulty,
          count: 15
        })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to generate test')
      }
      const data = await res.json()
      setQuestions(data.questions || [])
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [company, role, difficulty])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  useEffect(() => {
    if (!started || finished) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setFinished(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [started, finished])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setFinished(true)
    }
  }

  const calculateScore = () => {
    let score = 0
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) score++
    })
    return score
  }

  if (!gate.ready || loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-6">
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted/60 rounded mx-auto animate-pulse" />
            <div className="h-4 w-80 bg-muted/40 rounded mx-auto animate-pulse" />
          </div>
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error || questions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Failed to load test</h2>
        <p className="text-muted-foreground">{error || 'No questions received.'}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to config
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-primary" />
              Guidelines for {company.toUpperCase()} Mock Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <ul className="list-disc pl-6 space-y-2">
              <li>This test contains <strong>{questions.length} multiple-choice questions</strong>.</li>
              <li>You have <strong>{Math.floor(timeLeft / 60)} minutes</strong> to complete it.</li>
              <li>Once you submit an answer or skip, you cannot go back.</li>
              <li>The test will automatically submit when the timer runs out.</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full" onClick={() => setStarted(true)}>
              Start Test Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (finished) {
    const score = calculateScore()
    const percentage = Math.round((score / questions.length) * 100)
    
    return (
      <div className="flex-1 space-y-8 p-4 md:p-8 pt-6 max-w-4xl mx-auto">
        <Card className="text-center p-8">
          <div className="mb-6 flex justify-center">
            {percentage >= 70 ? (
              <div className="h-24 w-24 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
            ) : (
              <div className="h-24 w-24 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertCircle className="h-12 w-12 text-yellow-500" />
              </div>
            )}
          </div>
          <h2 className="text-3xl font-bold mb-2">Test Completed</h2>
          <p className="text-xl text-muted-foreground mb-8">
            You scored {score} out of {questions.length} ({percentage}%)
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => router.push('/dashboard/mock-tests')}>
              Back to Tests
            </Button>
            <Button onClick={() => window.location.reload()}>
              Retake Test
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <h3 className="text-2xl font-bold">Review Answers</h3>
          {questions.map((q, i) => {
            const isCorrect = answers[i] === q.correctIndex
            const skipped = answers[i] === undefined
            return (
              <Card key={i} className={skipped ? 'border-muted' : isCorrect ? 'border-green-500/50' : 'border-destructive/50'}>
                <CardHeader>
                  <CardTitle className="text-lg flex justify-between gap-4">
                    <span>{i + 1}. {q.question}</span>
                    {skipped ? (
                      <span className="text-sm font-normal text-muted-foreground">Skipped</span>
                    ) : isCorrect ? (
                      <span className="text-sm font-normal text-green-500 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1"/> Correct</span>
                    ) : (
                      <span className="text-sm font-normal text-destructive flex items-center"><AlertCircle className="w-4 h-4 mr-1"/> Incorrect</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className={`p-3 rounded-md border ${optIdx === q.correctIndex ? 'bg-green-500/10 border-green-500/30' : answers[i] === optIdx ? 'bg-destructive/10 border-destructive/30' : ''}`}>
                        {opt}
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/50 p-4 rounded-md text-sm">
                    <strong>Explanation:</strong> {q.explanation}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  const currentQ = questions[currentIndex]
  const hasAnsweredCurrent = answers[currentIndex] !== undefined

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 pt-6 max-w-5xl mx-auto w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold">{company.toUpperCase()} - {role.replace(/-/g, ' ')}</h2>
          <p className="text-sm text-muted-foreground">Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full font-mono text-lg">
          <Clock className="h-5 w-5" />
          <span className={timeLeft < 60 ? 'text-destructive font-bold' : ''}>
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <Progress value={((currentIndex + 1) / questions.length) * 100} className="mb-8 h-2" />

      {/* Main Content */}
      <div className="flex-1 grid md:grid-cols-2 gap-8">
        {/* Left Pane - Question */}
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-medium leading-relaxed mb-4">
            {currentQ.question}
          </h3>
        </div>

        {/* Right Pane - Options */}
        <div className="flex flex-col h-full">
          <RadioGroup 
            className="gap-4 flex-1"
            value={hasAnsweredCurrent ? answers[currentIndex].toString() : undefined}
            onValueChange={(val) => setAnswers(prev => ({ ...prev, [currentIndex]: parseInt(val) }))}
          >
            {currentQ.options.map((option, idx) => (
              <Label
                key={idx}
                htmlFor={`option-${idx}`}
                className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary`}
              >
                <RadioGroupItem value={idx.toString()} id={`option-${idx}`} />
                <span className="font-normal text-base leading-relaxed">{option}</span>
              </Label>
            ))}
          </RadioGroup>

          <div className="flex justify-between items-center mt-8 pt-6 border-t">
            <Button variant="ghost" onClick={handleNext} className="text-muted-foreground">
              Skip Question
            </Button>
            <Button onClick={handleNext} disabled={!hasAnsweredCurrent} size="lg">
              {currentIndex === questions.length - 1 ? 'Submit Test' : 'Submit & Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
