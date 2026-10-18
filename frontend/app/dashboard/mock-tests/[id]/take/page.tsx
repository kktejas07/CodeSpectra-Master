'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, Sparkles, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { usePageGuard } from '@/lib/use-page-guard'
import { MOCK_TESTS } from '@/lib/mock-tests'
import { Illustration } from '@/components/illustrations/spot'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const TEST_DURATION_SEC = 15 * 60

/**
 * Per-browser resume state for one attempt (start time, answers, position).
 * The attempt itself and its start time live on the server; this only keeps a
 * reload from losing the candidate's place. Storage can be unavailable.
 */
type LocalAttemptState = { startedAt?: number; started?: boolean; answers?: Record<number, number>; index?: number }
const localKey = (sessionId: string) => `codespectra_mock_attempt_${sessionId}`
function readLocal(sessionId: string): LocalAttemptState {
  try {
    const raw = window.localStorage.getItem(localKey(sessionId))
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' ? (v as LocalAttemptState) : {}
  } catch { return {} }
}
function writeLocal(sessionId: string, patch: LocalAttemptState) {
  try {
    window.localStorage.setItem(localKey(sessionId), JSON.stringify({ ...readLocal(sessionId), ...patch }))
  } catch { /* storage unavailable */ }
}
function clearLocal(sessionId: string) {
  try { window.localStorage.removeItem(localKey(sessionId)) } catch { /* storage unavailable */ }
}

interface Question {
  id: string
  question: string
  options: string[]
}

interface GradedResult {
  score: number
  total: number
  percentage: number
  review: Array<{ correctIndex: number; explanation: string }>
}

export default function TakeMockTestPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const difficulty = searchParams?.get('difficulty') || 'basic'
  
  // Company and role come from query params (set by the list page). A slug
  // like "goldman-sachs-sde" can't be split reliably, so the only fallback is
  // the sample catalogue by exact id.
  const paramId = params?.id || ''
  const sample = MOCK_TESTS.find((t) => t.id === paramId)
  const company = (searchParams?.get('company') || sample?.company || '').trim()
  const role = (searchParams?.get('role') || sample?.role || '').trim()

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [finished, setFinished] = useState(false)
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION_SEC)
  /** Epoch ms when this attempt's timer started (from the stored attempt). */
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [resumed, setResumed] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [confirmNewOpen, setConfirmNewOpen] = useState(false)
  const [startingNew, setStartingNew] = useState(false)
  const [newTestError, setNewTestError] = useState<string | null>(null)
  const [result, setResult] = useState<GradedResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Each generate call spends an AI credit — never fire it twice for one mount.
  const requestedRef = useRef(false)

  /** Load the server's attempt into the page (fresh or resumed). */
  const applyAttempt = useCallback((data: {
    session_id?: string; questions?: Question[]; created_at?: string; resumed?: boolean
    progress?: { answers?: Record<string, number>; index?: number; started_at?: number | null } | null
  }) => {
    const sid = typeof data.session_id === 'string' ? data.session_id : null
    const isResumed = data.resumed === true
    const browser = sid ? readLocal(sid) : {}
    // Another device (or cleared storage): fall back to the server's autosave.
    const server = isResumed && data.progress && typeof data.progress === 'object' ? data.progress : null
    const local: LocalAttemptState = browser.answers || !server
      ? browser
      : {
          started: true,
          startedAt: typeof server.started_at === 'number' ? server.started_at : browser.startedAt,
          answers: server.answers && typeof server.answers === 'object' ? (server.answers as Record<number, number>) : {},
          index: typeof server.index === 'number' ? server.index : 0,
        }
    // Resumed and already under way (or no local record, e.g. another
    // device): the timer runs from when the attempt started — this browser's
    // record if it has one, else the stored attempt time. A fresh attempt, or
    // one still on the intro screen, starts its clock when Start is pressed.
    const underWay = isResumed && local.started !== false
    const serverStart = data.created_at ? Date.parse(data.created_at) : NaN
    const start = underWay
      ? (typeof local.startedAt === 'number' ? local.startedAt : Number.isFinite(serverStart) ? serverStart : Date.now())
      : Date.now()
    if (sid) writeLocal(sid, underWay ? { startedAt: start, started: true } : { started: false })
    const elapsed = underWay ? Math.min(TEST_DURATION_SEC, Math.max(0, Math.floor((Date.now() - start) / 1000))) : 0
    const qs = Array.isArray(data.questions) ? data.questions : []
    setQuestions(qs)
    setSessionId(sid)
    setResumed(underWay)
    setStartedAtMs(start)
    setTimeLeft(TEST_DURATION_SEC - elapsed)
    setAnswers(underWay && local.answers && typeof local.answers === 'object' ? local.answers : {})
    setCurrentIndex(underWay && typeof local.index === 'number' ? Math.min(Math.max(0, local.index), Math.max(0, qs.length - 1)) : 0)
    setResult(null)
    setSubmitError(null)
    // A resumed attempt whose time is up goes straight to submission.
    setFinished(underWay && elapsed >= TEST_DURATION_SEC)
    setStarted(underWay)
  }, [])

  const requestAttempt = useCallback(async (newAttempt: boolean) => {
    const res = await csrfFetch('/api/mock-tests/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company,
        role,
        difficulty,
        count: 15,
        ...(newAttempt ? { new_attempt: true } : {}),
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Failed to generate test')
    return data
  }, [company, role, difficulty])

  const fetchQuestions = useCallback(async () => {
    if (requestedRef.current) return
    if (!company || !role) {
      setError('This test is missing a company or role. Go back and pick a test.')
      setLoading(false)
      return
    }
    requestedRef.current = true
    try {
      setLoading(true)
      // Reload / second tab returns the in-progress attempt (no credit spent).
      applyAttempt(await requestAttempt(false))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [company, role, applyAttempt, requestAttempt])

  /** "Start a new test": abandons the current attempt and spends one AI credit. */
  const startNewTest = useCallback(async () => {
    if (startingNew) return
    setStartingNew(true)
    setNewTestError(null)
    const oldSession = sessionId
    try {
      const data = await requestAttempt(true)
      if (oldSession) clearLocal(oldSession)
      setError(null)
      applyAttempt(data)
      setConfirmNewOpen(false)
    } catch (err) {
      setNewTestError(err instanceof Error ? err.message : 'Could not start a new test')
    } finally {
      setStartingNew(false)
    }
  }, [startingNew, sessionId, requestAttempt, applyAttempt])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // Deadline-based countdown from the attempt's start time, so a reload or a
  // throttled background tab doesn't add time.
  useEffect(() => {
    if (!started || finished || startedAtMs === null) return
    const tick = () => {
      const left = TEST_DURATION_SEC - Math.floor((Date.now() - startedAtMs) / 1000)
      if (left <= 0) {
        setTimeLeft(0)
        setFinished(true)
        return false
      }
      setTimeLeft(left)
      return true
    }
    if (!tick()) return
    const timer = setInterval(() => { if (!tick()) clearInterval(timer) }, 1000)
    return () => clearInterval(timer)
  }, [started, finished, startedAtMs])

  // Keep this browser's place in the attempt across reloads.
  useEffect(() => {
    if (!sessionId || result) return
    writeLocal(sessionId, { started, answers, index: currentIndex })
  }, [sessionId, started, answers, currentIndex, result])

  // Autosave progress on the server (debounced) so another device can resume.
  useEffect(() => {
    if (!sessionId || !started || result || finished) return
    const t = setTimeout(() => {
      csrfFetch('/api/mock-tests/attempts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answers, index: currentIndex, started_at: startedAtMs }),
      }).catch(() => { /* best effort; the browser copy still holds the place */ })
    }, 1500)
    return () => clearTimeout(t)
  }, [sessionId, started, answers, currentIndex, startedAtMs, result, finished])

  const beginTest = () => {
    // The clock starts when the candidate presses Start on a fresh attempt.
    if (!resumed) {
      const now = Date.now()
      setStartedAtMs(now)
      setTimeLeft(TEST_DURATION_SEC)
      if (sessionId) writeLocal(sessionId, { startedAt: now, started: true })
    }
    setStarted(true)
  }

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

  // Grade on the server (answer key never reaches the client before submit)
  // and save the attempt to the user's history.
  const submitAttempt = useCallback(async () => {
    if (!sessionId || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await csrfFetch('/api/mock-tests/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          answers,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not save your answers')
      setResult(data as GradedResult)
      clearLocal(sessionId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save your answers')
    } finally {
      setSubmitting(false)
    }
  }, [sessionId, answers, submitting])

  useEffect(() => {
    if (finished && !result && !submitting && !submitError) void submitAttempt()
  }, [finished, result, submitting, submitError, submitAttempt])

  const newTestDialog = (
    <AlertDialog open={confirmNewOpen} onOpenChange={(open) => { if (!startingNew) { setConfirmNewOpen(open); if (!open) setNewTestError(null) } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new test?</AlertDialogTitle>
          <AlertDialogDescription>
            {finished && result
              ? 'You get a fresh set of questions for this company and role. This uses 1 AI credit.'
              : 'Your current attempt will be dropped and not scored. You get a fresh set of questions, and this uses 1 AI credit.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {newTestError && <p role="alert" className="text-sm text-destructive">{newTestError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={startingNew}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={startingNew}
            onClick={(e) => { e.preventDefault(); void startNewTest() }}
          >
            {startingNew && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start a new test
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const newTestButton = (variant: 'outline' | 'default' | 'ghost' = 'outline') => (
    <Button variant={variant} onClick={() => setConfirmNewOpen(true)} disabled={startingNew}>
      <RotateCcw className="mr-2 h-4 w-4" /> Start a new test
    </Button>
  )

  if (!gate.ready || loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-6">
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted/60 rounded animate-pulse" />
            <div className="h-4 w-80 bg-muted/40 rounded animate-pulse" />
          </div>
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error || questions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
        <Illustration name="error" className="w-40" />
        <h1 className="text-xl font-bold">Failed to load test</h1>
        <p className="text-muted-foreground">{error || 'No questions received.'}</p>
        <Button onClick={() => router.back()}>Go back</Button>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="flex-1 space-y-6">
        <h1 className="sr-only">{company} mock test</h1>
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to config
        </Button>
        <Card className="rounded-3xl border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
              Before you start: {company} mock test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <ul className="list-disc pl-6 space-y-2">
              <li>This test contains <strong>{questions.length} multiple-choice questions</strong>.</li>
              <li>You have <strong>{Math.floor(TEST_DURATION_SEC / 60)} minutes</strong> to complete it. The timer starts when you press Start and keeps running if you reload.</li>
              <li>Once you submit an answer or skip, you cannot go back.</li>
              <li>The test will automatically submit when the timer runs out.</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full" onClick={beginTest}>
              Start test
            </Button>
          </CardFooter>
        </Card>
        {newTestDialog}
      </div>
    )
  }

  if (finished && !result) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 text-center space-y-4">
        {submitError ? (
          <>
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-bold">Couldn&apos;t save your answers</h1>
            <p className="text-muted-foreground">{submitError}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => { setSubmitError(null) }}>Try again</Button>
              {newTestButton('outline')}
            </div>
            {newTestDialog}
          </>
        ) : (
          <p className="text-muted-foreground">Saving your answers…</p>
        )}
      </div>
    )
  }

  if (finished && result) {
    const { score, percentage } = result

    return (
      <div className="flex-1 space-y-6">
        <h1 className="sr-only">{company} mock test results</h1>
        <Card className="rounded-3xl border-border/70 text-center p-8">
          <div className="mb-6 flex justify-center">
            {percentage >= 70 ? (
              <Illustration name="success" className="w-40" />
            ) : (
              <Illustration name="mock-test" className="w-40" />
            )}
          </div>
          <h2 className="text-3xl font-bold mb-2">Test complete</h2>
          <p className="text-xl text-muted-foreground tabular-nums mb-8">
            You scored {score} out of {questions.length} ({percentage}%)
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => router.push('/dashboard/mock-tests')}>
              Back to tests and history
            </Button>
            {newTestButton('default')}
          </div>
        </Card>
        {newTestDialog}

        <div className="space-y-6">
          <h3 className="text-xl font-semibold">Review your answers</h3>
          {questions.map((q, i) => {
            const correctIndex = result.review[i]?.correctIndex
            const explanation = result.review[i]?.explanation
            const isCorrect = answers[i] === correctIndex
            const skipped = answers[i] === undefined
            return (
              <Card key={i} className={`rounded-3xl ${skipped ? 'border-border/70' : isCorrect ? 'border-green-500/50' : 'border-destructive/50'}`}>
                <CardHeader>
                  <CardTitle className="text-lg flex justify-between gap-4">
                    <span>{i + 1}. {q.question}</span>
                    {skipped ? (
                      <span className="text-sm font-normal text-muted-foreground">Skipped</span>
                    ) : isCorrect ? (
                      <span className="text-sm font-normal text-green-600 dark:text-green-400 flex items-center shrink-0"><CheckCircle2 className="w-4 h-4 mr-1"/> Correct</span>
                    ) : (
                      <span className="text-sm font-normal text-destructive flex items-center shrink-0"><AlertCircle className="w-4 h-4 mr-1"/> Incorrect</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className={`p-3 rounded-xl border ${optIdx === correctIndex ? 'bg-green-500/10 border-green-500/30' : answers[i] === optIdx ? 'bg-destructive/10 border-destructive/30' : ''}`}>
                        {opt}
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/50 p-4 rounded-xl text-sm">
                    <strong>Explanation:</strong> {explanation}
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
    <div className="flex-1 flex flex-col w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">{company} · {role}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className="flex items-center gap-3">
          {newTestButton('ghost')}
          <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full font-mono tabular-nums text-lg" aria-label="Time left">
            <Clock className="h-5 w-5" />
            <span className={timeLeft < 60 ? 'text-destructive font-bold' : ''}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </div>
      {newTestDialog}
      {resumed && (
        <p className="-mt-6 mb-6 text-sm text-muted-foreground">Picked up where you left off. The timer kept running from when you started.</p>
      )}

      <Progress value={((currentIndex + 1) / questions.length) * 100} className="mb-8 h-2" />

      {/* Main Content */}
      <div className="flex-1 grid md:grid-cols-2 gap-8">
        {/* Left Pane - Question */}
        <div className="bg-card border border-border/70 rounded-3xl p-6 flex flex-col">
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
              Skip question
            </Button>
            <Button onClick={handleNext} disabled={!hasAnsweredCurrent} size="lg">
              {currentIndex === questions.length - 1 ? 'Submit test' : 'Submit and next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
