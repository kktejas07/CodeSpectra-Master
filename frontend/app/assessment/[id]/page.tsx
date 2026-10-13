'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Loader2, Clock, AlertTriangle, Send, CheckCircle2, ChevronRight, ChevronLeft, LockKeyhole, ShieldX, User, LogIn } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { calculateCheatingScore, type AnswerEvent } from '@/lib/proctoring/answer-pattern'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'
import { RealTimeProctor } from '@/components/proctoring/RealTimeProctor'
import { ExtensionGate } from '@/components/proctoring/ExtensionGate'
import { IdentityVerification } from '@/components/proctoring/IdentityVerification'
import { SessionRecorder } from '@/components/proctoring/SessionRecorder'
import { QuestionAnswerInput } from '@/components/assessment/QuestionAnswerInput'
import { metaFor } from '@/lib/question-types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
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

interface Question {
  id: string
  type: string
  title: string
  prompt: string
  options?: string[]
  test_cases?: TestCase[]
  starter_code?: string
  language?: string
  pairs?: { left: string; right: string }[]
  matrix?: { rows: string[]; columns: string[] }
  table?: { columns: string[]; rows: string[] }
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string }
  image_url?: string
  regions?: { id: string; x: number; y: number; w: number; h: number; label?: string }[]
}

interface TestCase {
  input: string
  output: string
  explanation?: string
  isSample?: boolean
}

// ponytail: Fisher-Yates shuffle with optional seed for reproducibility.
// Deterministic seed ensures same user sees same order on re-visit.
function shuffleArray<T>(arr: T[], seed?: number): T[] {
  const copy = [...arr]
  let rng = seed ?? Math.random()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor((typeof seed === 'number' ? pseudoRandom(rng + i) : Math.random()) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ponytail: Simple LCG for seeded shuffle — not cryptographically secure, good enough for anti-copy
function pseudoRandom(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

function typeLabel(type: string): string {
  return metaFor(type).label
}

interface Exam {
  id: string
  title: string
  level: string
  duration: number
  starts_at?: string | null
  ends_at?: string | null
  access_type?: 'invite_only' | 'open'
  require_id_verification?: boolean | null
  require_face_capture?: boolean | null
  questionList: Question[]
}

export default function CandidateAssessmentPage() {
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  
  const isShareLink = searchParams.get('share') === 'true'
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [windowState, setWindowState] = useState<'open' | 'not_started' | 'closed' | null>(null)

  // Assessment State — all hooks declared unconditionally (React rule of hooks)
  const [hasStarted, setHasStarted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  // Shuffle: map of question id -> shuffled options (stable per session)
  const [shuffledOpts, setShuffledOpts] = useState<Record<string, string[]>>({})

  // Verification State
  const [showVerification, setShowVerification] = useState(false)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)

  // Recording Consent
  const [recordingConsent, setRecordingConsent] = useState(false)

  // Timer Ref for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Answer pattern tracking
  const answerEventsRef = useRef<AnswerEvent[]>([])
  const questionViewTimeRef = useRef<number>(Date.now())
  const questionViewIdRef = useRef<string>('')
  const startedAtRef = useRef<number>(0)
  const questionTimingsRef = useRef<Record<string, number>>({})
  // Auto-submit must fire exactly once — without this guard a failed
  // auto-submit (isSubmitting false again, timeLeft still 0) re-triggers
  // every render into an infinite 403 retry loop.
  const autoSubmitAttemptedRef = useRef(false)

  const trackQuestionView = useCallback((qId: string) => {
    // Record time spent on previous question
    if (questionViewIdRef.current && questionViewIdRef.current !== qId) {
      const timeSpent = Date.now() - questionViewTimeRef.current
      answerEventsRef.current.push({
        questionId: questionViewIdRef.current,
        timestamp: Date.now(),
        action: 'skip',
        timeSpent,
      })
      // Track cumulative time per question
      questionTimingsRef.current[questionViewIdRef.current] = 
        (questionTimingsRef.current[questionViewIdRef.current] || 0) + timeSpent
    }
    questionViewIdRef.current = qId
    questionViewTimeRef.current = Date.now()
  }, [])

  const trackAnswer = useCallback((qId: string, action: 'answer' | 'paste' = 'answer') => {
    const timeSpent = Date.now() - questionViewTimeRef.current
    answerEventsRef.current.push({
      questionId: qId,
      timestamp: Date.now(),
      action,
      timeSpent,
      answerLength: (answers[qId] || '').length,
    })
    // Track cumulative time per question
    questionTimingsRef.current[qId] = (questionTimingsRef.current[qId] || 0) + timeSpent
    questionViewTimeRef.current = Date.now()
  }, [answers])

  // Shuffle options once when exam loads or starts
  const sessionSeed = useRef(Math.floor(Math.random() * 2147483647))
  useEffect(() => {
    if (!exam) return
    const map: Record<string, string[]> = {}
    for (const q of exam.questionList) {
      if (q.options && q.options.length > 0 && ['mcq', 'multiple_response', 'true_false', 'yes_no', 'ordering', 'ranking'].includes(q.type)) {
        const qSeed = q.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + sessionSeed.current
        map[q.id] = shuffleArray(q.options, qSeed)
      }
    }
    setShuffledOpts(map)
  }, [exam])

  // Track question views when currentQIndex changes
  useEffect(() => {
    if (hasStarted && exam?.questionList?.[currentQIndex]) {
      trackQuestionView(exam.questionList[currentQIndex].id)
    }
  }, [currentQIndex, hasStarted, exam, trackQuestionView])

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await fetch(`/api/exams/${params.id}`, { credentials: 'include' })
        if (!res.ok) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }
        const found = await res.json()

        if (!found || !found.published) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }

        // Availability-window entry gate (displayed before any access logic;
        // hard enforcement happens server-side in the submit route).
        const nowMs = Date.now()
        const startsMs = found.starts_at ? new Date(found.starts_at).getTime() : NaN
        const endsMs = found.ends_at ? new Date(found.ends_at).getTime() : NaN
        if (!Number.isNaN(endsMs) && nowMs > endsMs) {
          setExam(found)
          setWindowState('closed')
          setLoading(false)
          return
        }
        if (!Number.isNaN(startsMs) && nowMs < startsMs) {
          setExam(found)
          setWindowState('not_started')
          setLoading(false)
          return
        }
        setWindowState('open')

        // Server-checked share-link validation (?link=TOKEN records live in
        // assessment_links; revoked/expired/over-limit links are rejected
        // here with no questions ever shown).
        const linkToken = searchParams.get('link')
        if (linkToken) {
          try {
            const linkRes = await fetch(`/api/exams/${params.id}/links?token=${encodeURIComponent(linkToken)}`)
            if (!linkRes.ok) {
              const linkErr = await linkRes.json().catch(() => ({}))
              setAccessError(linkErr.error || 'This link has expired or been revoked.')
              setLoading(false)
              return
            }
          } catch {
            setAccessError('This link could not be verified. Please try again.')
            setLoading(false)
            return
          }
        }

        const accType = found.access_type || 'invite_only'
        const inviteToken = searchParams.get('inviteToken')
        const inviteEmail = searchParams.get('inviteEmail')

        // All assessments require login — anonymous users see a login prompt
        // and can never start (regardless of share / invite / open access).
        if (!user) {
          setExam(found)
          setLoading(false)
          return
        }

        // Share link: skip invite-only check. Track public link view.
        // Hard guarantee: exams with require_token_links reject bare
        // ?share=true — a validated ?link= token (above) or invite is mandatory.
        if (isShareLink && !linkToken) {
          const needsToken = (found as { require_token_links?: boolean }).require_token_links === true
          if (needsToken) {
            setAccessError('This assessment requires a personal link. Legacy share links are disabled — ask your administrator for an invite link.')
            setLoading(false)
            return
          }
          csrfFetch(`/api/exams/${params.id}/public-view`, { method: 'POST', credentials: 'include' }).catch(() => {})
        } else if (isShareLink) {
          csrfFetch(`/api/exams/${params.id}/public-view`, { method: 'POST', credentials: 'include' }).catch(() => {})
        } else if (accType === 'invite_only') {
          if (!inviteToken) {
            setAccessError('This assessment is invite-only. A valid invitation link is required.')
            setLoading(false)
            return
          }
          const verifyRes = await fetch(`/api/assessment/invite/${inviteToken}`, { credentials: 'include' })
          if (!verifyRes.ok) {
            const verifyErr = await verifyRes.json().catch(() => ({ error: 'Invalid or expired invitation' }))
            setAccessError(verifyErr.error || 'Invalid or expired invitation link')
            setLoading(false)
            return
          }
          const verifyJson = await verifyRes.json()
          if (verifyJson.email && verifyJson.email.toLowerCase() !== (user.email || '').toLowerCase()) {
            setAccessError('This invitation belongs to a different account. Sign in with the invited email address to continue.')
            setLoading(false)
            return
          }
          if (inviteEmail && verifyJson.email?.toLowerCase() !== inviteEmail.toLowerCase()) {
            setAccessError('Email mismatch — this invitation belongs to a different candidate.')
            setLoading(false)
            return
          }
        }

        // ponytail: per-candidate question shuffle, stable across refresh via
        // an email+exam seed. Answers/drafts/timings are all keyed by question
        // id, so order is cosmetic — grading is unaffected, same as the
        // existing per-question option shuffle.
        if (Array.isArray(found.questionList) && found.questionList.length > 1 && user) {
          const seedStr = `${user.email || user.uid}:${found.id}`
          let seed = 0
          for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
          setExam({ ...found, questionList: shuffleArray(found.questionList, seed) })
        } else {
          setExam(found)
        }
        if (typeof window !== 'undefined') {
          try {
            const draft = localStorage.getItem(`codespectra_exam_draft_${params.id}`)
            if (draft) {
              const parsed = JSON.parse(draft)
              if (found.questionList) {
                for (const q of found.questionList) {
                  if (q.type === 'multiple_response' && typeof parsed[q.id] === 'string') {
                    parsed[q.id] = parsed[q.id].split(',').map((s: string) => s.trim()).filter(Boolean)
                  }
                }
              }
              setAnswers(parsed)
            }
          } catch (e) {
            console.error('Failed to load draft:', e)
          }
        }
      } catch {
        addToast({ type: 'error', title: 'Failed to load assessment' })
      } finally {
        setLoading(false)
      }
    }
    if (params.id) fetchExam()
  }, [params.id, router, searchParams, user])

  // Timer Logic
  useEffect(() => {
    if (hasStarted && timeLeft !== null && timeLeft > 0 && !isSubmitted && !isSubmitting) {
      timerRef.current = setTimeout(() => setTimeLeft(prev => (prev !== null ? prev - 1 : 0)), 1000)
    } else if (hasStarted && timeLeft === 0 && !isSubmitted && !isSubmitting && !autoSubmitAttemptedRef.current) {
      autoSubmitAttemptedRef.current = true
      handleAutoSubmit()
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasStarted, timeLeft, isSubmitted, isSubmitting])

  // 30-minute warning
  const hasWarned30Min = useRef(false)
  useEffect(() => {
    if (timeLeft === 1800 && !isSubmitted && !isSubmitting && !hasWarned30Min.current) {
      hasWarned30Min.current = true
      addToast({ type: 'warning', title: '30 minutes remaining!' })
      csrfFetch('/api/proctor/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_kind: 'exam',
          session_id: params.id,
          event_type: 'timer_warning_30min',
          meta: { time_left: 1800, timestamp: new Date().toISOString() },
        }),
      }).catch(() => {})
    }
  }, [timeLeft, isSubmitted, isSubmitting, params.id, addToast])

  useEffect(() => {
    if (exam && Object.keys(answers).length > 0) {
      localStorage.setItem(`codespectra_exam_draft_${exam.id}`, JSON.stringify(answers))
    }
  }, [answers, exam])

  // Auto-save to server every 30 seconds (debounced)
  useEffect(() => {
    if (!exam || !hasStarted || Object.keys(answers).length === 0) return
    const timer = setTimeout(async () => {
      try {
        await csrfFetch(`/api/exams/${exam.id}/save-draft`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        })
      } catch { /* fire-and-forget */ }
    }, 30000)
    return () => clearTimeout(timer)
  }, [answers, exam, hasStarted])

  const handleStart = () => {
    if (!exam) return
    setHasStarted(true)
    startedAtRef.current = Date.now()
    // Convert duration (minutes) to seconds
    setTimeLeft(exam.duration * 60)
  }

  const handleAutoSubmit = async () => {
    addToast({ type: 'error', title: 'Time is up! Auto-submitting...' })
    await submitAssessment(true)
  }

  const handleManualSubmit = () => {
    setShowSubmitConfirm(true)
  }

  const submitAssessment = async (autoSubmitted = false) => {
    if (!exam) return
    setIsSubmitting(true)
    try {
      const serialized: Record<string, string> = {}
      for (const [k, v] of Object.entries(answers)) {
        serialized[k] = Array.isArray(v) ? v.join(', ') : v
      }
      const res = await csrfFetch(`/api/exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: serialized,
          auto_submitted: autoSubmitted,
          idPhoto,
          facePhoto,
          inviteToken: searchParams.get('inviteToken'),
          // Timing data
          question_timings: questionTimingsRef.current,
          total_time_ms: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
          started_at: startedAtRef.current ? new Date(startedAtRef.current).toISOString() : null,
        }),
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit')
      }
      setIsSubmitted(true)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`codespectra_exam_draft_${exam.id}`)
      }

      // Send answer pattern scoring
      try {
        const cheatingScore = calculateCheatingScore(answerEventsRef.current)
        await csrfFetch('/api/proctor/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_kind: 'exam',
            session_id: exam.id,
            event_type: 'answer_pattern_score',
            meta: {
              score: cheatingScore.total,
              flags: cheatingScore.flags,
              breakdown: cheatingScore.breakdown,
              total_answers: answerEventsRef.current.filter(e => e.action === 'answer').length,
              total_pastes: answerEventsRef.current.filter(e => e.action === 'paste').length,
              timestamp: new Date().toISOString(),
            },
          }),
        })
      } catch { /* fire-and-forget */ }
      addToast({ type: 'success', title: 'Assessment submitted successfully!' })
    } catch (e: any) {
      const reason = e.message || ''
      if (autoSubmitted) {
        addToast({ type: 'error', title: 'Auto-submit failed', message: `${reason} Your answers are auto-saved on this device — do not close this tab. Contact your administrator with your email address.` })
      } else {
        addToast({ type: 'error', title: 'Failed to submit', message: reason })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Preparing your environment...
      </div>
    )
  }

  if (!exam) return null

  if (windowState === 'closed' || windowState === 'not_started') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center border-destructive/30 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto text-destructive">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">{windowState === 'closed' ? 'Assessment Closed' : 'Assessment Not Yet Open'}</h1>
          <p className="text-sm text-muted-foreground">
            {windowState === 'closed'
              ? `This assessment closed on ${exam.ends_at ? new Date(exam.ends_at).toLocaleString() : 'its deadline'}. Please contact your administrator if you need access.`
              : `This assessment opens on ${exam.starts_at ? new Date(exam.starts_at).toLocaleString() : 'its scheduled start time'}. Please check back then.`}
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="outline" className="w-full">Return Home</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center border-destructive/30 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto text-destructive">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="text-sm text-muted-foreground">{accessError}</p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="outline" className="w-full">Return Home</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Pre-Start Screen
  if (!hasStarted) {
    // Any assessment type requires login to start — anonymous users (with or
    // without the extension) always see the login prompt and can never begin.
    if (!user) {
      const fullQuery = searchParams.toString()
      const loginRedirect = `/assessment/${params.id}${fullQuery ? `?${fullQuery}` : ''}`
      return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-background to-primary/5 p-4">
          <Card className="max-w-md w-full p-8 text-center border-primary/20 space-y-6 shadow-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{exam.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in or create an account to take this assessment</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-left space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Duration:</span><span className="font-medium">{exam.duration} min</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Questions:</span><span className="font-medium">{exam.questionList.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Level:</span><span className="font-medium">{exam.level}</span></div>
            </div>
            <div className="space-y-2">
              <Link href={`/auth/login?redirect=${encodeURIComponent(loginRedirect)}`}>
                <Button className="w-full gap-2"><LogIn className="h-4 w-4" /> Sign In</Button>
              </Link>
              <Link href={`/auth/signup?redirect=${encodeURIComponent(loginRedirect)}`}>
                <Button variant="outline" className="w-full gap-2"><User className="h-4 w-4" /> Create Account</Button>
              </Link>
            </div>
          </Card>
        </div>
      )
    }

    return (
      <ExtensionGate>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-lg w-full p-8 border-primary/20 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">{exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              You have been invited to complete a {exam.level} level technical assessment.
            </p>
          </div>

          <div className="bg-muted/30 border rounded-lg p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-semibold">{exam.duration} Minutes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Questions:</span>
              <span className="font-semibold">{exam.questionList.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Format:</span>
              <span className="font-semibold">Strict Timing, Auto-Submit</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-lg flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>
              <strong>Warning:</strong> Once you begin, the timer cannot be paused. If the timer reaches zero, your assessment will be automatically submitted regardless of completion. Ensure you have a stable internet connection and {exam.duration} minutes of uninterrupted time.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border bg-muted/20">
            <input
              type="checkbox"
              checked={recordingConsent}
              onChange={(e) => setRecordingConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I consent to session recording (webcam and screen) during this assessment. The recording is used solely for proctoring integrity verification and will be stored securely.
            </span>
          </label>

          {user?.has_enrolled_face === false && exam.require_face_capture !== false && (
            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>First time here? Your face biometrics will be enrolled during the identity verification step.</span>
            </div>
          )}
          {(exam.require_id_verification === false || exam.require_face_capture === false) && (
            <div className="bg-muted/40 border border-border p-3 rounded-lg text-xs text-muted-foreground">
              Identity check for this assessment: {exam.require_id_verification === false && exam.require_face_capture === false ? 'consent only — no ID or face capture required' : exam.require_id_verification === false ? 'face selfie only — ID skipped' : 'ID only — face capture skipped'}.
            </div>
          )}
          <Button onClick={() => setShowVerification(true)} className="w-full text-lg h-12">
            Start Assessment Now
          </Button>
        </Card>

        {showVerification && (
          <IdentityVerification
            examTitle={exam.title}
            requireId={exam.require_id_verification !== false}
            requireFace={exam.require_face_capture !== false}
            onCancel={() => setShowVerification(false)}
            onComplete={(data) => {
              setIdPhoto(data.idPhoto)
              setFacePhoto(data.facePhoto)
              setShowVerification(false)
              handleStart()
            }}
          />
        )}
      </div>
      </ExtensionGate>
    )
  }

  // Submitted Screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center border-primary/20 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mx-auto text-green-500 mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Assessment Submitted</h1>
          <p className="text-muted-foreground">
            Thank you for completing the {exam.title} assessment. Your results have been securely recorded and sent to the technical team for review. 
            <br/><br/>
            <strong>Your final score will be released after the admin reviews and evaluates your answers.</strong>
          </p>
          <div className="pt-4">
            <Button variant="outline" onClick={() => router.push('/')}>Return to Home</Button>
          </div>
        </Card>
      </div>
    )
  }

  // Active Assessment UI
  const currentQ = exam.questionList[currentQIndex]

  return (
    <ExtensionGate>
    <>
      <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName="Candidate" sessionKind="exam" sessionId={String(params.id)} idPhoto={idPhoto || undefined}>
      <RealTimeProctor sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted}>
      <SessionRecorder sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted && recordingConsent} />
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card px-6 py-3 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="font-bold text-lg">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">Question {currentQIndex + 1} of {exam.questionList.length}</p>
        </div>
        <div className="flex items-center gap-4">
          {recordingConsent && hasStarted && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              Recording
            </div>
          )}
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono font-bold ${
            (timeLeft || 0) < 300 ? 'bg-red-500/10 border-red-500/30 text-red-600' :
            (timeLeft || 0) <= 1800 ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-muted/50 border-border'
          }`}>
            <Clock className="h-4 w-4" />
            {formatTime(timeLeft || 0)} Remaining
          </div>
          <Button onClick={handleManualSubmit} disabled={isSubmitting} variant="destructive" size="sm" className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit Assessment
          </Button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question List Sidebar */}
        <aside className="w-64 border-r border-border bg-muted/10 p-4 overflow-y-auto hidden md:block">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Overview</h3>
          <div className="space-y-2">
            {exam.questionList.map((q, idx) => {
              const isAnswered = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : !!answers[q.id]
              const isActive = idx === currentQIndex
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${
                    isActive ? 'bg-primary text-primary-foreground font-medium' :
                    isAnswered ? 'bg-primary/10 text-foreground hover:bg-primary/20' : 'bg-card text-foreground border hover:bg-muted'
                  }`}
                >
                  <span className="truncate pr-2" title={q.title}>Q{idx + 1}: {q.title}</span>
                  {isAnswered && !isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right Side: Question Active Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-background/50">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
              <Badge variant="outline" className="uppercase tracking-widest">{typeLabel(currentQ.type)}</Badge>
              <h2 className="text-2xl font-bold">{currentQ.title}</h2>
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2 prose-p:text-[15px] prose-p:leading-relaxed prose-p:mb-4 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-[15px] prose-strong:text-foreground prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-table:border prose-table:border-border/40 prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-td:border-t prose-td:border-border/20 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-img:rounded-lg p-4 rounded-lg bg-card border">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code: ({ className, children, ...props }: any) => {
                      const isInline = !className
                      return isInline
                        ? <code className="rounded bg-muted/60 px-1.5 py-0.5 text-sm font-normal" {...props}>{children}</code>
                        : <code className={className} {...props}>{children}</code>
                    },
                  }}
                >
                  {currentQ.prompt}
                </ReactMarkdown>
              </div>
            </div>

            <div className="pt-4">
              <QuestionAnswerInput
                question={currentQ}
                value={answers[currentQ.id]}
                shuffledOptions={shuffledOpts[currentQ.id]}
                showSavedBadge
                onChange={(v) => {
                  setAnswers((prev) => ({ ...prev, [currentQ.id]: v }))
                  trackAnswer(currentQ.id, "answer")
                }}
              />
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-8 border-t mt-8 pb-12">
              <Button 
                variant="outline" 
                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Previous
              </Button>
              
              {currentQIndex < exam.questionList.length - 1 ? (
                <Button onClick={() => setCurrentQIndex(prev => Math.min(exam.questionList.length - 1, prev + 1))}>
                  Next Question <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleManualSubmit} variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Complete Assessment <Send className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
    </RealTimeProctor>
    </ProctoringWrapper>

    <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
          <AlertDialogDescription>
            You cannot return to the assessment once submitted. Please verify all your answers before submitting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={async () => {
            setShowSubmitConfirm(false)
            await submitAssessment(false)
          }}>
            Submit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
    </ExtensionGate>
  )
}
