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
import { IntegrityMonitor } from '@/components/integrity/IntegrityMonitor'
import { IntegrityConsent, useIntegrityConfig } from '@/components/integrity/IntegrityConsent'
import { QuestionAnswerInput } from '@/components/assessment/QuestionAnswerInput'
import { AdaptiveRunner, type AdaptiveViewPayload } from '@/components/assessment/AdaptiveRunner'
import { metaFor, isCodingType } from '@/lib/question-types'
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
import type { CandidateSectionView } from '@/lib/exam-sections'
import { isMobileUserAgent } from '@/lib/proctoring/fullscreen'
import { useT } from '@/lib/i18n/client'

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

/** Question-type badge: English label from lib/question-types, translated when a catalog entry exists. */
function typeLabel(type: string, td: (key: string, fallback: string) => string): string {
  return td(`assessment.qtype:${type}`, metaFor(type).label)
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
  /** No usable camera: 'allow_flag' (default) = upload an ID photo and continue, flagged; 'block' = can't start. */
  no_camera_policy?: 'block' | 'allow_flag' | null
  questionList: Question[]
  /** Number of questions (the list itself only arrives from POST ./start). */
  question_count?: number
  proctoring_mode?: 'standard' | 'strict'
  kind?: 'standard' | 'cad'
  attempts?: AttemptInfo
  /** Ordered sections (titles, timing, question ids) — absent for tests without sections. */
  sections?: Array<{ id: string; title: string; instructions?: string; time_limit_minutes: number | null; lock_after_leave: boolean; question_ids: string[] }>
}

/** Section payload from POST ./start and ./section. */
interface SectionPayload {
  sections?: CandidateSectionView[]
  current_section_id?: string | null
  questionList?: Question[]
  answers?: Record<string, string | string[]>
}

/** Shuffle per section (stable seed), keeping the section order. */
function orderBySections(list: Question[], sections: CandidateSectionView[] | null, seed: number | null): Question[] {
  const shuffle = (qs: Question[]) => (qs.length > 1 && seed !== null ? shuffleArray(qs, seed) : qs)
  if (!sections || sections.length === 0) return shuffle(list)
  const byId = new Map(list.map((q) => [q.id, q]))
  return sections.flatMap((s) => shuffle(s.question_ids.map((id) => byId.get(id)).filter((q): q is Question => !!q)))
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
  const { t, td, fmt } = useT()
  
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
  /** Adaptive test: the server hands out one question at a time (null = normal test). */
  const [adaptiveView, setAdaptiveView] = useState<AdaptiveViewPayload | null>(null)
  /** Sectioned tests: server section state (null = no sections). */
  const [sections, setSections] = useState<CandidateSectionView[] | null>(null)
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null)
  const [switchingSection, setSwitchingSection] = useState(false)
  /** Leaving a lock-after-leave section: ask first. */
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)
  const [sectionTimeLeft, setSectionTimeLeft] = useState<number | null>(null)
  /** Server clock − local clock, so section deadlines display in local time. */
  const clockOffsetRef = useRef(0)
  const sectionTimeUpRef = useRef<string | null>(null)
  const questionSeedRef = useRef<number | null>(null)

  // Shuffle: map of question id -> shuffled options (stable per session)
  const [shuffledOpts, setShuffledOpts] = useState<Record<string, string[]>>({})

  // Verification State
  const [showVerification, setShowVerification] = useState(false)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  /** Result of the stored identity check for this attempt. */
  const [identityStatus, setIdentityStatus] = useState<'verified' | 'needs_review' | null>(null)
  /** What to do once the identity check is stored: start, or retry a submit the server refused without one. */
  const afterIdentityRef = useRef<{ kind: 'start' } | { kind: 'submit'; auto: boolean }>({ kind: 'start' })

  // Recording Consent
  const [recordingConsent, setRecordingConsent] = useState(false)
  // Integrity checks (lib/integrity): opt-in per test by the author; consent before start.
  const integrity = useIntegrityConfig('exam', params.id ? String(params.id) : null, !!user)
  const [integrityConsent, setIntegrityConsent] = useState(false)
  const integrityOn = !!integrity.config?.enabled
  const integrityBlocksStart = integrityOn && !integrityConsent && !integrity.config?.consented
  // Phones can't share the screen or (iPhone) go full screen — tell candidates before they start.
  const [onMobile, setOnMobile] = useState(false)
  useEffect(() => { setOnMobile(isMobileUserAgent(navigator.userAgent)) }, [])

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
          addToast({ type: 'error', title: t('assessment.unavailable') })
          router.push('/')
          return
        }
        const found = await res.json() as Exam & { published?: boolean; submission?: unknown; entry?: EntryInfo; require_token_links?: boolean }

        if (!found || !found.published) {
          addToast({ type: 'error', title: t('assessment.unavailable') })
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
              setAccessError(linkErr.error || t('assessment.linkRevoked'))
              setLoading(false)
              return
            }
          } catch {
            setAccessError(t('assessment.linkUnverified'))
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
          setAccessError(found.entry?.error || t('assessment.cannotStart'))
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
        addToast({ type: 'error', title: t('assessment.loadFailed') })
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
      addToast({ type: 'warning', title: t('assessment.thirtyMinutesLeft') })
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

  // Screen readers: announce time milestones politely (the visible timer itself is not a live region).
  const [timerAnnouncement, setTimerAnnouncement] = useState('')
  const announcedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!hasStarted || isSubmitted) return
    if (timeLeft !== null) {
      for (const m of [15, 10, 5, 1]) {
        const key = `t${m}`
        // Only when the countdown crosses the mark (not when the test starts already below it).
        if (timeLeft <= m * 60 && timeLeft > m * 60 - 30 && !announcedRef.current.has(key)) {
          announcedRef.current.add(key)
          setTimerAnnouncement(t('assessment.minutesLeftAnnounce', { count: m }))
          return
        }
      }
    }
    if (sectionTimeLeft !== null && sectionTimeLeft <= 60 && sectionTimeLeft > 30 && !announcedRef.current.has(`s${currentSectionId}`)) {
      announcedRef.current.add(`s${currentSectionId}`)
      setTimerAnnouncement(t('assessment.sectionMinuteLeftAnnounce'))
    }
  }, [timeLeft, sectionTimeLeft, currentSectionId, hasStarted, isSubmitted, t])

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

  // ─── Sections (server-enforced; the page only follows the server state) ───
  const currentSection = sections?.find((x) => x.id === currentSectionId) ?? null

  /** Apply a section payload from the server (new state, newly visible questions). */
  const applySectionPayload = useCallback((j: SectionPayload) => {
    if (!Array.isArray(j.sections)) return
    const secs = j.sections
    const curId = j.current_section_id ?? null
    setSections(secs)
    setCurrentSectionId(curId)
    setExam((prev) => {
      if (!prev) return prev
      const incoming = Array.isArray(j.questionList) ? j.questionList : []
      const known = new Map(prev.questionList.map((q) => [q.id, q]))
      for (const q of incoming) if (!known.has(q.id)) known.set(q.id, q)
      const list = orderBySections([...known.values()], secs, questionSeedRef.current)
      const first = curId ? list.findIndex((q) => secs.find((x) => x.id === curId)?.question_ids.includes(q.id)) : -1
      if (first >= 0) setCurrentQIndex(first)
      return { ...prev, questionList: list }
    })
  }, [])

  /** Go to a section (or just sync the clock with `null`), saving this section's answers first. */
  const goToSection = useCallback(async (targetId: string | null): Promise<SectionPayload | null> => {
    if (!exam) return null
    setSwitchingSection(true)
    try {
      const res = await csrfFetch(`/api/exams/${exam.id}/section`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: targetId, answers: answersRef.current }),
      })
      const j = await res.json().catch(() => ({})) as SectionPayload & { error?: string }
      applySectionPayload(j)
      if (!res.ok) {
        addToast({ type: 'error', title: t('assessment.sectionChangeFailed'), message: j.error })
        return null
      }
      lastSavedRef.current = JSON.stringify(answersRef.current)
      return j
    } catch {
      addToast({ type: 'error', title: t('assessment.sectionChangeFailed'), message: t('errors.checkConnection') })
      return null
    } finally {
      setSwitchingSection(false)
    }
  }, [exam, applySectionPayload, addToast])

  const requestSection = (targetId: string) => {
    if (switchingSection || targetId === currentSectionId) return
    if (currentSection?.lock_after_leave) setConfirmLeave(targetId)
    else void goToSection(targetId)
  }

  // Section countdown (only when the section ends before the whole test).
  useEffect(() => {
    if (!hasStarted || isSubmitted || !currentSection?.deadline) { setSectionTimeLeft(null); return }
    const dl = Date.parse(currentSection.deadline) + clockOffsetRef.current
    const overall = deadlineLocalRef.current
    if (overall !== null && dl >= overall) { setSectionTimeLeft(null); return }
    const tick = () => setSectionTimeLeft(Math.max(0, Math.round((dl - Date.now()) / 1000)))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [hasStarted, isSubmitted, currentSection?.id, currentSection?.deadline])

  // Section time is up: move on (the server does the same on its next request).
  useEffect(() => {
    if (sectionTimeLeft !== 0 || !currentSection || sectionTimeUpRef.current === currentSection.id || isSubmitting) return
    sectionTimeUpRef.current = currentSection.id
    const idx = sections?.findIndex((x) => x.id === currentSection.id) ?? -1
    const rest = sections ? [...sections.slice(idx + 1), ...sections.slice(0, Math.max(0, idx))] : []
    const next = rest.find((x) => x.status === 'open' || x.status === 'upcoming')
    void (async () => {
      if (next) {
        addToast({ type: 'warning', title: t('assessment.sectionTimeUp', { section: currentSection.title }), message: t('assessment.movingOnTo', { section: next.title }) })
        await goToSection(next.id)
      } else {
        addToast({ type: 'warning', title: t('assessment.lastSectionTimeUp'), message: t('assessment.submittingAnswers') })
        autoSubmitAttemptedRef.current = true
        await submitAssessment(true)
      }
    })()
  }, [sectionTimeLeft, currentSection, sections, isSubmitting])

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
      const j = await res.json().catch(() => ({})) as SectionPayload & {
        error?: string; expired?: boolean; questionList?: Question[]; started_at?: string; deadline?: string | null
        server_now?: string; answers?: Record<string, string | string[]>; attempt_no?: number
        identity_required?: boolean
        adaptive?: AdaptiveViewPayload
      }
      if (res.status === 410 && j.expired) { setTimeUp(true); return }
      if (j.identity_required) {
        afterIdentityRef.current = { kind: 'start' }
        setShowVerification(true)
        addToast({ type: 'error', title: t('assessment.identityNeeded'), message: j.error })
        return
      }
      if (!res.ok || !Array.isArray(j.questionList) || !j.started_at) throw new Error(j.error || t('assessment.couldNotStart'))

      const serverNow = j.server_now ? Date.parse(j.server_now) : Date.now()
      const offset = Date.now() - serverNow
      clockOffsetRef.current = offset
      startedAtRef.current = Date.parse(j.started_at) + offset
      deadlineLocalRef.current = j.deadline ? Date.parse(j.deadline) + offset : null
      const no = j.attempt_no || attemptNo
      setAttemptNo(no)
      setAdaptiveView(j.adaptive ?? null)

      // ponytail: per-candidate question shuffle, stable across refresh via an
      // email+exam seed. Answers/drafts/timings are keyed by question id, so
      // order is cosmetic — grading is unaffected.
      let seed: number | null = null
      if (user) {
        const seedStr = `${user.email || user.uid}:${exam.id}`
        seed = 0
        for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
      }
      questionSeedRef.current = seed
      const secs = Array.isArray(j.sections) && j.sections.length > 0 ? j.sections : null
      // Sectioned tests: shuffled within each section, sections stay in order.
      const list = orderBySections(j.questionList, secs, seed)
      setSections(secs)
      setCurrentSectionId(secs ? (j.current_section_id ?? null) : null)

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
      if (secs && j.current_section_id) {
        const first = list.findIndex((q) => secs.find((x) => x.id === j.current_section_id)?.question_ids.includes(q.id))
        setCurrentQIndex(Math.max(0, first))
      }
      setTimeLeft(deadlineLocalRef.current !== null ? Math.max(0, Math.round((deadlineLocalRef.current - Date.now()) / 1000)) : null)
      setHasStarted(true)
    } catch (e) {
      addToast({ type: 'error', title: t('assessment.couldNotStartTitle'), message: e instanceof Error ? e.message : undefined })
    } finally {
      setStarting(false)
    }
  }

  const handleAutoSubmit = async () => {
    addToast({ type: 'error', title: t('assessment.timeUpAutoSubmitting') })
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
        const err = await res.json().catch(() => ({})) as { error?: string; identity_required?: boolean }
        if (err.identity_required) {
          // Answers stay saved; redo the identity check, then this submit runs again.
          afterIdentityRef.current = { kind: 'submit', auto: autoSubmitted }
          setShowVerification(true)
          addToast({ type: 'error', title: t('assessment.identityNeeded'), message: t('assessment.redoIdentity') })
          return
        }
        throw new Error(err.error || t('assessment.submitFailed'))
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
      addToast({ type: 'success', title: t('assessment.submittedToast') })
    } catch (e: any) {
      const reason = e.message || ''
      if (autoSubmitted) {
        addToast({ type: 'error', title: t('assessment.autoSubmitFailed'), message: `${reason} ${t('assessment.autoSubmitFailedBody')}` })
      } else {
        addToast({ type: 'error', title: t('assessment.submitFailed'), message: reason })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => fmt.clock(seconds)

  const identityDialog = exam && showVerification ? (
    <IdentityVerification
      examId={exam.id}
      examTitle={exam.title}
      requireId={exam.require_id_verification !== false}
      requireFace={exam.require_face_capture !== false}
      noCameraPolicy={exam.no_camera_policy ?? 'allow_flag'}
      inviteToken={searchParams.get('inviteToken')}
      linkToken={searchParams.get('link')}
      onCancel={() => setShowVerification(false)}
      onComplete={(data) => {
        setIdPhoto(data.idPhoto)
        setFacePhoto(data.facePhoto)
        setIdentityStatus(data.needsReview ? 'needs_review' : 'verified')
        setShowVerification(false)
        const next = afterIdentityRef.current
        afterIdentityRef.current = { kind: 'start' }
        if (next.kind === 'submit') void submitAssessment(next.auto)
        else void handleStart()
      }}
    />
  ) : null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('assessment.preparing')}
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
          <h1 className="text-xl font-bold">{windowState === 'closed' ? t('assessment.closed') : t('assessment.notOpenYet')}</h1>
          <p className="text-sm text-muted-foreground">
            {windowState === 'closed'
              ? t('assessment.closedOn', { when: exam.ends_at ? fmtDateTime(exam.ends_at) : t('assessment.itsDeadline') })
              : t('assessment.opensOn', { when: exam.starts_at ? fmtDateTime(exam.starts_at) : t('assessment.itsStartTime') })}
          </p>
          <div className="pt-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/">{t('assessment.returnHome')}</Link>
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
          <h1 className="text-xl font-bold">{accessError === INVITE_ONLY_MESSAGE ? t('assessment.inviteOnlyTitle') : t('assessment.accessDenied')}</h1>
          <p className="text-sm text-muted-foreground">{accessError === INVITE_ONLY_MESSAGE ? t('assessment.inviteOnlyBody') : accessError}</p>
          <div className="pt-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/">{t('assessment.returnHome')}</Link>
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
          <h1 className="text-2xl font-bold tracking-tight">{t('assessment.submittedTitle')}</h1>
          <p className="text-muted-foreground">
            {t('assessment.submittedThanks', { title: exam.title })}
            <br/><br/>
            <strong>{t('assessment.scoreReleasedLater')}</strong>
          </p>
          {attemptInfo && attemptInfo.max > 1 && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-left space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('assessment.attemptsUsed')}</span><span className="font-medium tabular-nums">{t('assessment.nOfM', { n: attemptInfo.used, m: attemptInfo.max })}</span></div>
              {attemptInfo.best && attemptInfo.best.total > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t('assessment.bestReleasedScore')}</span><span className="font-medium tabular-nums">{t('assessment.bestScoreValue', { percent: fmt.percent(attemptInfo.best.score / attemptInfo.best.total), attempt: attemptInfo.best.attempt_no })}</span></div>
              )}
            </div>
          )}
          <div className="pt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {attemptInfo?.can_retake && (
              <Button onClick={() => window.location.reload()}>
                {t('assessment.startAttemptNofM', { n: attemptInfo.used + 1, m: attemptInfo.max })}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/')}>{t('assessment.returnHome')}</Button>
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
          <h1 className="text-xl font-bold">{t('assessment.timeIsUp')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('assessment.timeRanOutBody')}
          </p>
          <Button className="w-full gap-2" onClick={() => submitAssessment(true)} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t('assessment.submitSavedAnswers')}
          </Button>
        </Card>
        {identityDialog}
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
              <p className="text-sm text-muted-foreground mt-1">{t('assessment.signInToTake')}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-2xl p-4 text-sm text-left space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('assessment.duration')}</span><span className="font-medium tabular-nums">{t('assessment.minutesShort', { count: exam.duration })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('assessment.questions')}</span><span className="font-medium tabular-nums">{fmt.number(questionCount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('assessment.level')}</span><span className="font-medium capitalize">{td(`assessment.level:${String(exam.level).toLowerCase()}`, exam.level)}</span></div>
            </div>
            <div className="space-y-2">
              <Button className="w-full gap-2" asChild>
                <Link href={`/auth/login?redirect=${encodeURIComponent(loginRedirect)}`}><LogIn className="h-4 w-4" /> {t('auth.signIn')}</Link>
              </Button>
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href={`/auth/signup?redirect=${encodeURIComponent(loginRedirect)}`}><User className="h-4 w-4" /> {t('auth.createAccountButton')}</Link>
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
              {t('assessment.invitedToComplete', { level: td(`assessment.level:${String(exam.level).toLowerCase()}`, exam.level) })}
            </p>
          </div>

          <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('assessment.duration')}</span>
              <span className="font-semibold tabular-nums">{t('assessment.minutes', { count: exam.duration })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('assessment.questions')}</span>
              <span className="font-semibold tabular-nums">{fmt.number(questionCount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('assessment.format')}</span>
              <span className="font-semibold">{exam.duration > 0 ? t('assessment.formatTimed') : t('assessment.noTimeLimit')}</span>
            </div>
            {exam.sections && exam.sections.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-muted-foreground">{t('assessment.sectionsInOrder')}</p>
                <ol className="space-y-1.5">
                  {exam.sections.map((sec, i) => (
                    <li key={sec.id} className="flex items-start justify-between gap-3">
                      <span className="font-medium"><span className="tabular-nums">{i + 1}.</span> {sec.title}</span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {t('assessment.questionsCount', { count: sec.question_ids.length })} · {sec.time_limit_minutes ? t('assessment.minutesShort', { count: sec.time_limit_minutes }) : t('assessment.sharesTestTime')}
                        {sec.lock_after_leave ? <><br />{t('assessment.locksWhenYouLeave')}</> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {attemptInfo && attemptInfo.max > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('assessment.attempt')}</span>
                <span className="font-semibold tabular-nums">{t('assessment.nOfM', { n: attemptInfo.used + 1, m: attemptInfo.max })}</span>
              </div>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 p-4 rounded-xl flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>
              <strong>{t('assessment.beforeYouStart')}</strong> {t('assessment.beforeYouStartBody', { minutes: exam.duration })}
            </p>
          </div>

          {onMobile && (
            <div role="note" className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 p-3 rounded-xl flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>{t('assessment.useLaptop')}</strong> {t('assessment.useLaptopBody')}</span>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border bg-muted/20 transition-colors hover:border-primary/40">
            <input
              type="checkbox"
              checked={recordingConsent}
              onChange={(e) => setRecordingConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              {t('assessment.recordingConsent')}
            </span>
          </label>

          {user?.has_enrolled_face === false && exam.require_face_capture !== false && (
            <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('assessment.firstTimeFace')}</span>
            </div>
          )}
          {(exam.require_id_verification === false || exam.require_face_capture === false) && (
            <div className="bg-muted/40 border border-border p-3 rounded-xl text-xs text-muted-foreground">
              {t('assessment.identityCheckFor', { mode: exam.require_id_verification === false && exam.require_face_capture === false ? t('assessment.identityConsentOnly') : exam.require_id_verification === false ? t('assessment.identityFaceOnly') : t('assessment.identityIdOnly') })}
            </div>
          )}
          {(exam.require_id_verification !== false || exam.require_face_capture !== false) && (
            <p className="text-xs text-muted-foreground">
              {exam.no_camera_policy === 'block'
                ? t('assessment.needsCamera')
                : t('assessment.noCameraUpload')}
            </p>
          )}
          {resuming && (
            <div className="bg-primary/10 border border-primary/20 text-foreground p-3 rounded-xl text-xs flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>{t('assessment.alreadyStarted')}</span>
            </div>
          )}
          {integrity.config && integrityOn && (
            <IntegrityConsent config={integrity.config} checked={integrityConsent || integrity.config.consented} onChange={setIntegrityConsent} />
          )}
          <Button onClick={() => { afterIdentityRef.current = { kind: 'start' }; setShowVerification(true) }} disabled={starting || integrityBlocksStart} className="w-full text-base font-semibold h-12 rounded-xl gap-2">
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            {resuming ? t('assessment.resume') : t('assessment.start')}
          </Button>
        </Card>

        {identityDialog}
      </div>
      </ExtensionGate>
    )
  }

  // Active Assessment UI
  // Sectioned tests: only the current section's questions are reachable.
  const sectionQIds = currentSection ? new Set(currentSection.question_ids) : null
  const navIdx = exam.questionList.map((q, i) => (!sectionQIds || sectionQIds.has(q.id) ? i : -1)).filter((i) => i >= 0)
  const safeIdx = navIdx.includes(currentQIndex) ? currentQIndex : (navIdx[0] ?? 0)
  const currentQ = exam.questionList[safeIdx] as Question | undefined
  const posInNav = navIdx.indexOf(safeIdx)
  const sectionPos = sections && currentSection ? sections.findIndex((x) => x.id === currentSection.id) : -1
  const nextSection = sections && sectionPos >= 0
    ? [...sections.slice(sectionPos + 1)].find((x) => x.status === 'open' || x.status === 'upcoming') ?? null
    : null
  const isAnsweredId = (id: string) => (Array.isArray(answers[id]) ? (answers[id] as string[]).length > 0 : !!answers[id])
  const sectionStatusLabel: Record<string, string> = { upcoming: t('assessment.secNotStarted'), active: t('assessment.secInProgress'), open: t('assessment.secStarted'), locked: t('assessment.secLocked'), expired: t('assessment.timeIsUp') }

  return (
    <ExtensionGate bypass={extensionBypass}>
    <>
      <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName={t('assessment.candidate')} sessionKind="exam" sessionId={String(params.id)} idPhoto={idPhoto || undefined} identityStatus={identityStatus} examTitle={exam.title}>
      <RealTimeProctor sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted} enforceFullscreen={hasStarted}>
      {/* With integrity checks on, continuous video runs only when the author enabled it. */}
      <SessionRecorder sessionKind="exam" sessionId={String(params.id)} enabled={hasStarted && recordingConsent && (!integrityOn || !!integrity.config?.continuous_video)} />
      {integrity.config && integrityOn && (
        <IntegrityMonitor kind="exam" targetId={String(params.id)} config={integrity.config} active={hasStarted && !isSubmitted} />
      )}
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <a href="#question-panel" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">{t('assessment.skipToQuestion')}</a>
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{timerAnnouncement}</div>
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0">
          <h1 className="font-bold text-lg tracking-tight text-foreground truncate">{exam.title}</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {adaptiveView
              ? <>{t('assessment.adaptiveTest')} · {t('assessment.questionsCount', { count: adaptiveView.total })}</>
              : currentSection
              ? <>{t('assessment.sectionNofM', { n: sectionPos + 1, m: sections!.length, title: currentSection.title })} · {t('assessment.questionNofMLower', { n: posInNav + 1, m: navIdx.length })}</>
              : <>{t('assessment.questionNofM', { n: safeIdx + 1, m: exam.questionList.length })}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {recordingConsent && hasStarted && (!integrityOn || !!integrity.config?.continuous_video) && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              {t('assessment.recording')}
            </div>
          )}
          {sectionTimeLeft !== null && (
            <div role="timer" aria-label={t('assessment.sectionTimeLeftAria')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono font-bold tabular-nums ${
              sectionTimeLeft < 120 ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
            }`}>
              <span className="font-sans font-medium text-xs">{t('assessment.section')}</span>{formatTime(sectionTimeLeft)}
            </div>
          )}
          <div role="timer" aria-label={t('assessment.timeRemainingAria')} className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono font-bold tabular-nums transition-colors duration-300 ${
            timeLeft === null ? 'bg-primary/5 border-primary/20 text-foreground' :
            timeLeft < 300 ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400' :
            timeLeft <= 1800 ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300' : 'bg-primary/5 border-primary/20 text-foreground'
          }`}>
            <Clock className="h-4 w-4" />
            {timeLeft === null ? t('assessment.noTimeLimit') : <>{formatTime(timeLeft)}<span className="hidden sm:inline font-sans font-medium text-xs opacity-80">{t('assessment.left')}</span></>}
          </div>
          <Button onClick={handleManualSubmit} disabled={isSubmitting} variant="destructive" size="sm" className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{t('assessment.submitAssessment')}</span><span className="sm:hidden">{t('assessment.submitShort')}</span>
          </Button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Question List Sidebar */}
        <aside aria-label={t('assessment.questionNavigation')} className={`w-64 border-r border-border bg-muted/20 p-4 overflow-y-auto ${adaptiveView ? 'hidden' : 'hidden md:block'}`}>
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">{currentSection ? currentSection.title : t('assessment.questions')}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('assessment.answeredOf', { n: navIdx.filter((i) => isAnsweredId(exam.questionList[i].id)).length, m: navIdx.length })}
            </span>
          </div>
          <nav aria-label={t('assessment.questionNavigation')} className="space-y-2">
            {navIdx.map((idx, n) => {
              const q = exam.questionList[idx]
              const isAnswered = isAnsweredId(q.id)
              const isActive = idx === safeIdx
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
                  <span className="truncate pr-2" title={q.title}><span className="tabular-nums">{n + 1}.</span> {q.title}</span>
                  {isAnswered && !isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />}
                  <span className="sr-only">{isAnswered ? t('assessment.answeredStatus') : t('assessment.notAnsweredStatus')}</span>
                </button>
              )
            })}
          </nav>
          {sections && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">{t('assessment.sections')}</h3>
              <ol className="space-y-2">
                {sections.map((sec, i) => {
                  const closed = sec.status === 'locked' || sec.status === 'expired'
                  const active = sec.id === currentSectionId
                  return (
                    <li key={sec.id}>
                      <button
                        type="button"
                        onClick={() => requestSection(sec.id)}
                        disabled={closed || active || switchingSection}
                        aria-current={active ? 'step' : undefined}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                          active ? 'border-primary bg-primary/10 text-foreground' : closed ? 'border-border bg-muted/40 text-muted-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {closed && <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                          <span className="truncate"><span className="tabular-nums">{i + 1}.</span> {sec.title}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {sectionStatusLabel[sec.status]} · {t('assessment.questionsCount', { count: sec.question_ids.length })}
                          {sec.time_limit_minutes ? <> · {t('assessment.minutesShort', { count: sec.time_limit_minutes })}</> : null}
                          {sec.lock_after_leave && !closed ? ` · ${t('assessment.locksWhenYouLeave')}` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </aside>

        {/* Right Side: Question Active Area */}
        <div id="question-panel" tabIndex={-1} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 bg-background focus:outline-none">
          <div className="max-w-4xl mx-auto space-y-8">
            {sections && (
              <div className="md:hidden">
                <label htmlFor="section-pick" className="mb-1 block text-xs font-medium text-muted-foreground">{t('assessment.section')}</label>
                <select
                  id="section-pick"
                  className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={currentSectionId ?? ''}
                  disabled={switchingSection}
                  onChange={(e) => requestSection(e.target.value)}
                >
                  {sections.map((sec, i) => (
                    <option key={sec.id} value={sec.id} disabled={sec.status === 'locked' || sec.status === 'expired'}>
                      {i + 1}. {sec.title} ({sectionStatusLabel[sec.status]})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {currentSection?.instructions && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
                <p className="mb-1 font-semibold">{t('assessment.sectionInstructions', { title: currentSection.title })}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{currentSection.instructions}</p>
                {currentSection.lock_after_leave && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('assessment.cantComeBack')}</p>}
              </div>
            )}
            {adaptiveView ? (
              <AdaptiveRunner
                examId={exam.id}
                initial={adaptiveView}
                submitting={isSubmitting}
                onSubmit={handleManualSubmit}
                onExpired={() => { if (!autoSubmitAttemptedRef.current) { autoSubmitAttemptedRef.current = true; void submitAssessment(true) } }}
              />
            ) : !currentQ ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {sections && !currentSection
                  ? t('assessment.allSectionsFinished')
                  : t('assessment.noQuestions')}
                <div className="mt-4">
                  <Button onClick={handleManualSubmit} className="gap-2"><Send className="h-4 w-4" /> {t('assessment.submitAssessment')}</Button>
                </div>
              </div>
            ) : (
            <>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{typeLabel(currentQ.type, td)}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">{t('assessment.questionNofM', { n: posInNav + 1, m: navIdx.length })}</span>
              </div>
              <h2 id="current-question-title" className="text-2xl font-bold tracking-tight text-foreground">{currentQ.title}</h2>
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

            <div className="pt-4" role="group" aria-labelledby="current-question-title" data-integrity-q={isCodingType(currentQ.type) ? currentQ.id : undefined}>
              <QuestionAnswerInput
                question={currentQ}
                value={answers[currentQ.id]}
                shuffledOptions={shuffledOpts[currentQ.id]}
                showSavedBadge
                examContext={{ examId: String(params.id), inviteToken: searchParams.get('inviteToken'), linkToken: searchParams.get('link') }}
                onChange={(v) => {
                  setAnswers((prev) => ({ ...prev, [currentQ.id]: v }))
                  trackAnswer(currentQ.id, "answer")
                }}
              />
            </div>

            {/* Pagination Controls (within the current section for sectioned tests) */}
            <div className="flex items-center justify-between gap-3 pt-8 border-t border-border mt-8 pb-12">
              <Button 
                variant="outline" 
                onClick={() => setCurrentQIndex(navIdx[Math.max(0, posInNav - 1)] ?? safeIdx)}
                disabled={posInNav <= 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" /> {t('common.previous')}
              </Button>
              
              {posInNav < navIdx.length - 1 ? (
                <Button onClick={() => setCurrentQIndex(navIdx[posInNav + 1])}>
                  {t('assessment.nextQuestion')} <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : nextSection ? (
                <Button onClick={() => requestSection(nextSection.id)} disabled={switchingSection}>
                  {switchingSection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t('assessment.nextSection', { title: nextSection.title })} <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleManualSubmit} variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {t('assessment.finishAndSubmit')} <Send className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </main>
    </div>
    </RealTimeProctor>
    </ProctoringWrapper>

    <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('assessment.confirmSubmitTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('assessment.confirmSubmitBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={async () => {
            setShowSubmitConfirm(false)
            await submitAssessment(false)
          }}>
            {t('common.submit')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!confirmLeave} onOpenChange={(o) => { if (!o) setConfirmLeave(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('assessment.leaveSectionTitle', { title: currentSection?.title ?? t('assessment.thisSection') })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('assessment.leaveSectionBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('assessment.stayHere')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const target = confirmLeave; setConfirmLeave(null); if (target) void goToSection(target) }}>
            {t('assessment.leaveAndLock')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {identityDialog}
    </>
    </ExtensionGate>
  )
}
