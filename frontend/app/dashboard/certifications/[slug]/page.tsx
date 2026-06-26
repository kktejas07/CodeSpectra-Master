'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react'

interface Question {
  id: string
  prompt: string
  choices: string[]
}

interface StartResponse {
  attempt_id: string
  started_at: string
  duration_minutes: number
  passing_score: number
  certification: { id: string; slug: string; title: string; level: string }
  questions: Question[]
}

interface SubmitResponse {
  score: number
  passed: boolean
  correct: number
  total: number
  passing_score: number
  verify_token: string | null
  submitted_at: string
  already_submitted?: boolean
}

/**
 * /dashboard/certifications/[slug]
 *
 * Single-page assessment runner. POSTs to /start to create an attempt and
 * load the question bank, then POSTs to /submit when the user is done.
 * Displays the result inline; a passing attempt gets a shareable verify
 * URL.
 */
export default function CertificationAttemptPage() {
  const params = useParams() as { slug: string }
  const router = useRouter()
  const [data, setData] = useState<StartResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<SubmitResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function start() {
      try {
        const res = await fetch(`/api/certifications/${params.slug}/start`, {
          method: 'POST',
          credentials: 'include',
        })
        if (res.status === 401) {
          router.push('/auth/login')
          return
        }
        if (!res.ok) throw new Error(`start ${res.status}`)
        const json = (await res.json()) as StartResponse
        if (active) setData(json)
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    start()
    return () => {
      active = false
    }
  }, [params.slug, router])

  async function submit() {
    if (!data) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/certifications/${params.slug}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt_id: data.attempt_id, answers }),
      })
      const json = (await res.json()) as SubmitResponse
      setResult(json)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="cert-attempt-loading">
        Starting assessment…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="p-8 space-y-4" data-testid="cert-attempt-error">
        <p className="text-destructive">Failed to start: {error || 'unknown error'}</p>
        <Link href="/dashboard/certifications">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to certifications
          </Button>
        </Link>
      </div>
    )
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="cert-attempt-result">
        <Card className={`p-8 text-center ${result.passed ? 'border-green-500/40 bg-green-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
          {result.passed ? (
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          ) : (
            <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
          )}
          <h1 className="text-2xl font-bold mb-2" data-testid="cert-attempt-score">
            {result.passed ? 'Passed!' : 'Not quite there'}
          </h1>
          <p className="text-muted-foreground mb-4">
            You scored {result.score}% ({result.correct}/{result.total}). Passing score is {result.passing_score}%.
          </p>
          {result.passed && result.verify_token && (
            <div className="space-y-3">
              <p className="text-sm">Your shareable verification link:</p>
              <code className="text-xs block bg-muted/40 p-2 rounded break-all" data-testid="cert-verify-link">
                /cert/verify/{result.verify_token}
              </code>
              <Link href={`/cert/verify/${result.verify_token}`}>
                <Button className="gap-2" data-testid="cert-view-certificate">
                  View certificate <CheckCircle className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}
        </Card>
        <div className="text-center">
          <Link href="/dashboard/certifications">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to all certifications
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const allAnswered = data.questions.every((q) => typeof answers[q.id] === 'number')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="cert-attempt-runner">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/certifications" className="text-xs text-muted-foreground hover:text-primary">
            ← All certifications
          </Link>
          <h1 className="text-2xl font-bold mt-1">{data.certification.title}</h1>
          <p className="text-sm text-muted-foreground">{data.certification.level} · {data.questions.length} questions</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" /> {data.duration_minutes} min
        </div>
      </div>

      <div className="space-y-4">
        {data.questions.map((q, i) => (
          <Card key={q.id} className="p-5" data-testid={`cert-question-${i}`}>
            <p className="font-medium mb-3">
              {i + 1}. {q.prompt}
            </p>
            <div className="space-y-2">
              {q.choices.map((choice, idx) => (
                <label
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition ${
                    answers[q.id] === idx ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                  data-testid={`cert-choice-${i}-${idx}`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === idx}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    className="accent-primary"
                  />
                  <span className="text-sm">{choice}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between sticky bottom-4 bg-background/95 backdrop-blur p-4 rounded border border-border">
        <p className="text-xs text-muted-foreground">
          {Object.keys(answers).length}/{data.questions.length} answered
        </p>
        <Button
          onClick={submit}
          disabled={!allAnswered || submitting}
          data-testid="cert-submit-btn"
          className="gap-2"
        >
          {submitting ? 'Scoring…' : 'Submit assessment'}
        </Button>
      </div>
    </div>
  )
}
