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
import { useDateFormat } from '@/lib/use-platform-timezone'
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
import { Illustration } from '@/components/illustrations/spot'
import { INVITE_ONLY_MESSAGE } from '@/lib/exam-access'

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
  /** Number of questions (the list itself only arrives from POST ./start). */
  question_count?: number
  proctoring_mode?: 'standard' | 'strict'
  kind?: 'standard' | 'cad'
  attempts?: AttemptInfo
}

/** Server entry check result from GET /api/exams/[id] (same checks as start/submit). */
interface EntryInfo {
  ok: boolean
  error?: string
  status?: number
  attempt_no?: number
  attempt?: { status: 'not_started' | 'running' | 'expired'; started_at?: string; deadline?: string | null }
}

interface AttemptInfo {
  used: number
  max: number
  can_retake: boolean
  best: { score: number; total: number; attempt_no: number } | null
}

export default function CandidateAssessmentPage() {
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { dateTime: fmtDateTime } = useDateFormat()
  
  const isShareLink = searchParams.get('share') === 'true'
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [windowState, setWindowState] = useState<'open' | 'not_started' | 'closed' | null>(null)
  /** Attempts used / allowed after the latest submit (null = unknown or single attempt). */
  const [attemptInfo, setAttemptInfo] = useState<AttemptInfo | null>(null)

  // Assessment State — all hooks declared unconditionally (React rule of hooks)
  const [hasStarted, setHasStarted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  /** Attempt state from the server: resume an attempt in progress, or finalise one whose time ran out. */
  const [entryAttempt, setEntryAttempt] = useState<EntryInfo['attempt'] | null>(null)
  const [attemptNo, setAttemptNo] = useState(1)
  const [timeUp, setTimeUp] = useState(false)
  const [starting, setStarting] = useState(false)
  /** Local-clock deadline (server deadline shifted by the server/client clock offset). */
  const deadlineLocalRef = useRef<number | null>(null)
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
        const linkToken = searchParams.get('link')
        const inviteToken = searchParams.get('inviteToken')
        const qs = new URLSearchParams()
        if (inviteToken) qs.set('inviteToken', inviteToken)
        if (linkToken) qs.set('link', linkToken)
        const res = await fetch(`/api/exams/${params.id}${qs.toString() ? `?${qs}` : ''}`, { credentials: 'include' })
        if (!res.ok) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }
        const found = await res.json() as Exam & { published?: boolean; submission?: unknown; entry?: EntryInfo; require_token_links?: boolean }

        if (!found || !found.published) {
          addToast({ type: 'error', title: 'Assessment unavailable or invalid.' })
          router.push('/')
          return
        }

        // CAD tasks have their own runner (file upload + design rationale).
        if (found.kind === 'cad') {
          router.replace(`/assessment/${params.id}/cad${searchParams.toString() ? `?${searchParams}` : ''}`)
          return
        }

        // Attempt limit (enforced by the server too): show the submitted
        // screen unless this exam allows another attempt.
        if (found.attempts) setAttemptInfo(found.attempts)
        if (found.submission && !found.attempts?.can_retake) {
          setExam(found)
          setIsSubmitted(true)
          setLoading(false)
          return
        }

        // Availability-window display (the server enforces it on start/submit).
        // An attempt already running keeps going until its own deadline.
        const running = found.entry?.ok && found.entry.attempt && found.entry.attempt.status !== 'not_started'
        const nowMs = Date.now()
        const startsMs = found.starts_at ? new Date(found.starts_at).getTime() : NaN
        const endsMs = found.ends_at ? new Date(found.ends_at).getTime() : NaN
        if (!running && !Number.isNaN(endsMs) && nowMs > endsMs) {
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

        // All assessments require login — anonymous users see a login prompt
        // and can never start (regardless of share / invite / open access).
        if (!user) {
          setExam(found)
          setLoading(false)
          return
        }

        // DB-backed share link (?link=TOKEN): logs the visit for the organiser.
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

        // Old ?share=true links only work on open tests (decision: no bypass).
        if (isShareLink && !linkToken && !inviteToken && (found.access_type || 'invite_only') !== 'open') {
          setAccessError(INVITE_ONLY_MESSAGE)
          setLoading(false)
          return
        }

        // Server entry check: invite (right account, not revoked, retakes
        // allowed), link, window, attempts, personal-link requirement.
        if (!found.entry?.ok) {
          setAccessError(found.entry?.error || 'You can’t start this assessment.')
          setLoading(false)
          return
        }
        if (isShareLink) {
          csrfFetch(`/api/exams/${params.id}/public-view`, { method: 'POST', credentials: 'include' }).catch(() => {})
        }

        setAttemptNo(found.entry.attempt_no || 1)
        setEntryAttempt(found.entry.attempt || null)
        if (found.entry.attempt?.status === 'expired') setTimeUp(true)
        setExam(found)
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
      // Recomputed from the server deadline each tick, so sleep/throttling can't stretch it.
      timerRef.current = setTimeout(() => {
        const dl = deadlineLocalRef.current
        setTimeLeft(dl !== null ? Math.max(0, Math.round((dl - Date.now()) / 1000)) : null)
      }, 1000)
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
    // <= not ===: the deadline-based countdown can skip a second.
    if (hasStarted && timeLeft !== null && timeLeft <= 1800 && timeLeft > 0 && (exam?.duration ?? 0) * 60 > 1800 && !isSubmitted && !isSubmitting && !hasWarned30Min.current) {
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
  }, [timeLeft, hasStarted, exam, isSubmitted, isSubmitting, params.id, addToast])

  const localDraftKey = exam ? `codespectra_exam_draft_${exam.id}_${attemptNo}` : null
  useEffect(() => {
    if (localDraftKey && hasStarted && Object.keys(answers).length > 0) {
      try { localStorage.setItem(localDraftKey, JSON.stringify(answers)) } catch { /* storage unavailable */ }
    }
  }, [answers, localDraftKey, hasStarted])

  // Server autosave, throttled (not debounced): at most every 15 s while
  // answers keep changing, so a candidate who never stops typing still saves.
  const answersRef = useRef(answers)
  answersRef.current = answers
  const lastSavedRef = useRef<string>('')
  useEffect(() => {
    if (!exam || !hasStarted || isSubmitted) return
    const save = async () => {
      const snapshot = JSON.stringify(answersRef.current)
      if (snapshot === lastSavedRef.current || snapshot === '{}') return
      try {
        const res = await csrfFetch(`/api/exams/${exam.id}/save-draft`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: answersRef.current }),
        })
        if (res.ok) lastSavedRef.current = snapshot
      } catch { /* retried on the next tick */ }
    }
    const timer = setInterval(save, 15000)
    return () => clearInterval(timer)
  }, [exam, hasStarted, isSubmitted])

  const handleStart = async () => {
    if (!exam || starting) return
    setStarting(true)
    try {
      const res = await csrfFetch(`/api/exams/${exam.id}/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: searchParams.get('inviteToken'), linkToken: searchParams.get('link') }),
      })
      const j = await res.json().catch(() => ({})) as {
        error?: string; expired?: boolean; questionList?: Question[]; started_at?: string; deadline?: string | null
        server_now?: string; answers?: Record<string, string | string[]>; attempt_no?: number
      }
      if (res.status === 410 && j.expired) { setTimeUp(true); return }
      if (!res.ok || !Array.isArray(j.questionList) || !j.started_at) throw new Error(j.error || 'Could not start the assessment')

      const serverNow = j.server_now ? Date.parse(j.server_now) : Date.now()
      const offset = Date.now() - serverNow
      startedAtRef.current = Date.parse(j.started_at) + offset
      deadlineLocalRef.current = j.deadline ? Date.parse(j.deadline) + offset : null
      const no = j.attempt_no || attemptNo
      setAttemptNo(no)

      // ponytail: per-candidate question shuffle, stable across refresh via an
      // email+exam seed. Answers/drafts/timings are keyed by question id, so
      // order is cosmetic — grading is unaffected.
      let list = j.questionList
      if (list.length > 1 && user) {
        const seedStr = `${user.email || user.uid}:${exam.id}`
        let seed = 0
        for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
        list = shuffleArray(list, seed)
      }

      // Resume: the server draft (any device) merged with this device's newer local copy.
      let local: Record<string, string | string[]> = {}
      try {
        const raw = localStorage.getItem(`codespectra_exam_draft_${exam.id}_${no}`)
        if (raw) local = JSON.parse(raw)
      } catch { /* storage unavailable */ }
      const merged: Record<string, string | string[]> = { ...(j.answers || {}), ...local }
      for (const q of list) {
        if (q.type === 'multiple_response' && typeof merged[q.id] === 'string') {
          merged[q.id] = (merged[q.id] as string).split(',').map((x) => x.trim()).filter(Boolean)
        }
      }
      lastSavedRef.current = JSON.stringify(j.answers || {})
      setAnswers(merged)
      setExam({ ...exam, questionList: list })
      setTimeLeft(deadlineLocalRef.current !== null ? Math.max(0, Math.round((deadlineLocalRef.current - Date.now()) / 1000)) : null)
      setHasStarted(true)
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t start the assessment', message: e instanceof Error ? e.message : undefined })
    } finally {
      setStarting(false)
    }
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
          linkToken: searchParams.get('link'),
          // Start time and total time come from the server's attempt record.
          question_timings: questionTimingsRef.current,
        }),
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit')
      }
      const okJson = await res.json().catch(() => ({})) as { attempt_no?: number; max_attempts?: number }
      if (typeof okJson.attempt_no === 'number' && typeof okJson.max_attempts === 'number') {
        const used = okJson.attempt_no
        const max = okJson.max_attempts
        setAttemptInfo((prev) => ({ used, max, can_retake: used < max, best: prev?.best ?? null }))
      }
      setIsSubmitted(true)
      setTimeUp(false)
      try { localStorage.removeItem(`codespectra_exam_draft_${exam.id}_${attemptNo}`) } catch { /* storage unavailable */ }

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
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Preparing your assessment…
      </div>
    )
  }

  if (!exam) return null

  if (windowState === 'closed' || windowState === 'not_started') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full rounded-3xl p-8 text-center border-destructive/30 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto text-destructive">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">{windowState === 'closed' ? 'Assessment closed' : 'Assessment not open yet'}</h1>
          <p className="text-sm text-muted-foreground">
            {windowState === 'closed'
              ? `This assessment closed on ${exam.ends_at ? fmtDateTime(exam.ends_at) : 'its deadline'}. Please contact your administrator if you need access.`
              : `This assessment opens on ${exam.starts_at ? fmtDateTime(exam.starts_at) : 'its scheduled start time'}. Please check back then.`}
          </p>
          <div className="pt-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/">Return home</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full rounded-3xl p-8 text-center border-destructive/30 space-y-4">
          <Illustration name="locked" className="mx-auto w-40" />
          <h1 className="text-xl font-bold">{accessError === INVITE_ONLY_MESSAGE ? 'Invite-only test' : 'Access denied'}</h1>
          <p className="text-sm text-muted-foreground">{accessError}</p>
          <div className="pt-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/">Return home</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Submitted Screen
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full rounded-3xl p-8 text-center border-border/70 space-y-4">
          <Illustration name="success" className="mx-auto w-40" />
          <h1 className="text-2xl font-bold tracking-tight">Assessment submitted</h1>
          <p className="text-muted-foreground">
            Thank you for completing the {exam.title} assessment. Your answers have been saved and sent to the hiring team for review.
            <br/><br/>
            <strong>Your final score will be released after the admin reviews and evaluates your answers.</strong>
          </p>
          {attemptInfo && attemptInfo.max > 1 && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-left space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Attempts used</span><span className="font-medium tabular-nums">{attemptInfo.used} of {attemptInfo.max}</span></div>
              {attemptInfo.best && attemptInfo.best.total > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Best released score</span><span className="font-medium tabular-nums">{Math.round((attemptInfo.best.score / attemptInfo.best.total) * 100)}% (attempt {attemptInfo.best.attempt_no})</span></div>
              )}
            </div>
          )}
          <div className="pt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {attemptInfo?.can_retake && (
              <Button onClick={() => window.location.reload()}>
                Start attempt {attemptInfo.used + 1} of {attemptInfo.max}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/')}>Return to home</Button>
          </div>
        </Card>
      </div>
    )
  }

  // Time ran out while the candidate was away: finalise from the server draft.
  if (timeUp && !hasStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full rounded-3xl p-8 text-center border-border/70 space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 mx-auto text-amber-700 dark:text-amber-300">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">Time is up</h1>
          <p className="text-sm text-muted-foreground">
            The time for this attempt has run out. The answers saved before the deadline will be submitted for review.
          </p>
          <Button className="w-full gap-2" onClick={() => submitAssessment(true)} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit saved answers
          </Button>
        </Card>
      </div>
    )
  }

  const questionCount = exam.question_count ?? exam.questionList.length
  const resuming = entryAttempt?.status === 'running'
  // Extension required only when the organiser chose strict proctoring.
  const extensionBypass = exam.proctoring_mode !== 'strict'

  // Pre-Start Screen
  if (!hasStarted) {
    // Any assessment type requires login to start — anonymous users (with or
    // without the extension) always see the login prompt and can never begin.
    if (!user) {
      const fullQuery = searchParams.toString()
      const loginRedirect = `/assessment/${params.id}${fullQuery ? `?${fullQuery}` : ''}`
      return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-background to-primary/5 p-4">
          <Card className="max-w-md w-full rounded-3xl p-8 text-center border-border/70 space-y-6 shadow-sm dark:shadow-none">
            <Illustration name="assessment" className="mx-auto w-36" />
            <div>
              <h1 className="text-xl font-bold">{exam.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in or create an account to take this assessment</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-2xl p-4 text-sm text-left space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium tabular-nums">{exam.duration} min</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Questions</span><span className="font-medium tabular-nums">{questionCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Level</span><span className="font-medium capitalize">{exam.level}</span></div>
            </div>
            <div className="space-y-2">
              <Button className="w-full gap-2" asChild>
                <Link href={`/auth/login?redirect=${encodeURIComponent(loginRedirect)}`}><LogIn className="h-4 w-4" /> Sign in</Link>
              </Button>
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href={`/auth/signup?redirect=${encodeURIComponent(loginRedirect)}`}><User className="h-4 w-4" /> Create account</Link>
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return (
      <ExtensionGate bypass={extensionBypass}>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-lg w-full rounded-3xl p-8 border-border/70 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">{exam.title}</h1>
            <p className="text-muted-foreground text-sm">
              You have been invited to complete a {exam.level} level technical assessment.
            </p>
          </div>

          <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-semibold tabular-nums">{exam.duration} minutes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Questions</span>
              <span className="font-semibold tabular-nums">{questionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Format</span>
              <span className="font-semibold">{exam.duration > 0 ? 'Timed, submits automatically at zero' : 'No time limit'}</span>
            </div>
            {attemptInfo && attemptInfo.max > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Attempt</span>
                <span className="font-semibold tabular-nums">{attemptInfo.used + 1} of {attemptInfo.max}</span>
              </div>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 p-4 rounded-xl flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>
              <strong>Before you start:</strong> once you begin, the timer cannot be paused. If the timer reaches zero, your assessment will be automatically submitted regardless of completion. Ensure you have a stable internet connection and {exam.duration} minutes of uninterrupted time.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border bg-muted/20 transition-colors hover:border-primary/40">
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
            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>First time here? Your face biometrics will be enrolled during the identity verification step.</span>
            </div>
          )}
          {(exam.require_id_verification === false || exam.require_face_capture === false) && (
            <div className="bg-muted/40 border border-border p-3 rounded-xl text-xs text-muted-foreground">
              Identity check for this assessment: {exam.require_id_verification === false && exam.require_face_capture === false ? 'consent only — no ID or face capture required' : exam.require_id_verification === false ? 'face selfie only — ID skipped' : 'ID only — face capture skipped'}.
            </div>
          )}
          {resuming && (
            <div className="bg-primary/10 border border-primary/20 text-foreground p-3 rounded-xl text-xs flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>You already started this attempt. The timer kept running; your saved answers will be restored.</span>
            </div>
          )}
          <Button onClick={() => setShowVerification(true)} disabled={starting} className="w-full text-base font-semibold h-12 rounded-xl gap-2">
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {resuming ? 'Resume assessment' : 'Start assessment'}
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
              void handleStart()
            }}
          />
        )}
      </div>
      </ExtensionGate>
    )
  }

  // Active Assessment UI
  const currentQ = exam.questionList[currentQIndex]

  return (
    <ExtensionGate bypass={extensionBypass}>
    <>
      <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName="Candidate" sessionKind="exam" sessionId={String(params.id)} idPhoto={idPhoto || undefined}>
      <RealTimeProctor sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted} enforceFullscreen={hasStarted}>
      <SessionRecorder sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted && recordingConsent} />
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0">
          <h1 className="font-bold text-lg tracking-tight text-foreground truncate">{exam.title}</h1>
          <p className="text-xs text-muted-foreground tabular-nums">Question {currentQIndex + 1} of {exam.questionList.length}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {recordingConsent && hasStarted && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              Recording
            </div>
          )}
          <div role="timer" aria-label="Time remaining" className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono font-bold tabular-nums transition-colors duration-300 ${
            timeLeft === null ? 'bg-primary/5 border-primary/20 text-foreground' :
            timeLeft < 300 ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' :
            timeLeft <= 1800 ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300' : 'bg-primary/5 border-primary/20 text-foreground'
          }`}>
            <Clock className="h-4 w-4" />
            {timeLeft === null ? 'No time limit' : <>{formatTime(timeLeft)}<span className="hidden sm:inline font-sans font-medium text-xs opacity-80">left</span></>}
          </div>
          <Button onClick={handleManualSubmit} disabled={isSubmitting} variant="destructive" size="sm" className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Submit assessment</span><span className="sm:hidden">Submit</span>
          </Button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question List Sidebar */}
        <aside className="w-64 border-r border-border bg-muted/20 p-4 overflow-y-auto hidden md:block">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Questions</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {exam.questionList.filter((q) => (Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : !!answers[q.id])).length}/{exam.questionList.length} answered
            </span>
          </div>
          <div className="space-y-2">
            {exam.questionList.map((q, idx) => {
              const isAnswered = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : !!answers[q.id]
              const isActive = idx === currentQIndex
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  aria-current={isActive ? 'step' : undefined}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-150 flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? 'bg-primary text-primary-foreground font-medium shadow-sm' :
                    isAnswered ? 'bg-primary/10 text-foreground border border-primary/20 hover:bg-primary/15' : 'bg-card text-foreground border border-border hover:bg-muted'
                  }`}
                >
                  <span className="truncate pr-2" title={q.title}><span className="tabular-nums">{idx + 1}.</span> {q.title}</span>
                  {isAnswered && !isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Right Side: Question Active Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 bg-background">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{typeLabel(currentQ.type)}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">Question {currentQIndex + 1} of {exam.questionList.length}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{currentQ.title}</h2>
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2 prose-p:text-[15px] prose-p:leading-relaxed prose-p:mb-4 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-normal prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-[15px] prose-strong:text-foreground prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:px-4 prose-blockquote:py-3 prose-table:border prose-table:border-border/40 prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-td:border-t prose-td:border-border/20 prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-img:rounded-lg p-5 sm:p-6 rounded-2xl bg-card border border-border/70 text-foreground">
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
            <div className="flex items-center justify-between gap-3 pt-8 border-t border-border mt-8 pb-12">
              <Button 
                variant="outline" 
                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> Previous
              </Button>
              
              {currentQIndex < exam.questionList.length - 1 ? (
                <Button onClick={() => setCurrentQIndex(prev => Math.min(exam.questionList.length - 1, prev + 1))}>
                  Next question <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleManualSubmit} variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Finish and submit <Send className="h-4 w-4 ml-2" />
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
