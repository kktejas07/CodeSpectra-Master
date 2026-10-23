'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Loader2, ArrowLeft, Download, ShieldAlert, CheckCircle2, User, Eye, X, AlertTriangle, Copy, Minimize2, Maximize2, Send, CheckCheck, MoreHorizontal, Link, Mail, Trash2, Clock, XCircle, Bell, Sparkles, MessageSquare, ChevronDown, Camera, Fingerprint, Keyboard, Award, Film } from 'lucide-react'
import { SkeletonStats, SkeletonTable, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useDateFormat } from '@/lib/use-platform-timezone'
import { useToast } from '@/lib/toast-context'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn, BulkAction } from '@/components/ui/data-table'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader } from '@/components/app/page-kit'
import { parseCodingAnswer, isCodingType } from '@/lib/coding-answer'
import { ScoreHistogram, StatusDonut, QuestionBars } from '@/components/assessment/results-charts'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { CompareCandidates } from '@/components/assessment/CompareCandidates'
import { ExtendedAnswerView, TraitScoresPanel, hasExtendedView, useAnswerFiles } from '@/components/assessment/ExtendedAnswerView'
import { HiringOutcomePanel, OutcomeBadge, OutcomeBulkDialog } from '@/components/assessment/HiringOutcome'
import { OUTCOME_LABELS, isOutcomeStatus } from '@/lib/hiring-outcomes'
import { useAdminT } from '@/lib/i18n/admin'


interface CandidateResult {
  id: string
  inviteId: string
  name: string
  email: string
  status: string
  score: number | null
  maxScore: number | null
  submittedAt: string | null
  invitedAt: string | null
  inviteToken?: string | null
  reminderCount?: number
  proctoringFlags: number
  idPhoto?: string | null
  facePhoto?: string | null
  userId?: string
  released?: boolean
  deliveryStatus?: string | null
  graded?: boolean
  needsReview?: boolean
  source?: string
  attemptNo?: number
  maxAttempts?: number
  bestScore?: number | null
  bestAttemptNo?: number | null
  kind?: string
  /** Took the test without a camera (uploaded ID photo): check identity by hand. */
  identityReview?: boolean
  /** Advisory face match (0–1) of the ID photo vs the live selfie. */
  faceMatch?: number | null
  /** This candidate's certificate for the test, if one was issued. */
  certificate?: { id: string; revokedAt: string | null; verifyToken: string | null } | null
  /** Sectioned tests: score per section. */
  sectionScores?: SectionScoreRow[]
  /** Recorded hiring outcome (shortlisted, hired, …). */
  outcome?: string | null
  totalTimeMs?: number | null
}

interface SectionScoreRow { id: string; title: string; score: number; max: number; percent: number | null }

interface IdentityCheckInfo {
  method?: 'camera' | 'no_camera_upload' | null
  needs_manual_review?: boolean
  no_camera_reason?: 'no_device' | 'permission_denied' | 'error' | null
  face_match?: { status?: string; similarity?: number; likely_match?: boolean } | null
  upload_scan_status?: 'clean' | 'unscanned' | null
}

const NO_CAMERA_REVIEW_LABEL = 'No camera — needs manual identity review'

interface Exam {
  id: string
  title: string
  level: string
  duration: number
  issue_certificates?: boolean
  /** Ordered sections (id + title); empty for tests without sections. */
  sections?: Array<{ id: string; title: string }>
  publicLinkViews?: number
  plagiarismReport?: {
    score: number
    pairs: number
    aiFlags: number
    bankMatches: number
    leaks: number
    checked_at: string
  } | null
}

interface QuestionDetail {
  qId: string
  correct: boolean
  points: number
  answer: string
  pending_review?: boolean
  awarded?: number
  remarks?: string
  requires_human_review?: boolean
  confidence?: number
  jev_agree?: boolean | null
  jev_confidence?: number | null
  graded_by?: string | null
}

interface ReviewData {
  examTitle: string
  questions: Array<{ id: string; title?: string; question?: string; prompt?: string; type: string; options?: string[]; correct_answer?: string; answer?: string; points?: number; score?: number }>
  submission: {
    answers: Record<string, string>
    details: QuestionDetail[]
    score: number
    max_score: number
    has_pending_review?: boolean
    submitted_at: string
    released_at: string | null
    id_photo?: string | null
    face_photo?: string | null
    identity_check?: IdentityCheckInfo | null
    question_timings?: Record<string, number>
    total_time_ms?: number
    started_at?: string | null
    section_scores?: SectionScoreRow[]
  }
  /** Hiring outcome doc (status, ratings, history), if recorded. */
  outcome?: { status?: string; ratings?: Record<string, { value: number; notes?: string; by_email?: string; at?: string }>; history?: Array<{ at: string; by_email?: string; kind: 'status' | 'rating'; from?: string | number | null; to?: string | number | null; period?: number; notes?: string }> } | null
  proctorEvents: Array<{ event_type: string; meta: Record<string, unknown>; created_at: string }>
  candidate: { name: string; email: string }
  /** CAD task attempts: uploaded files + design rationale (graded as the 'cad' question). */
  cad?: {
    files: Array<{ id: string; kind: 'native' | 'step'; name: string; size: number; scan_status?: 'clean' | 'unscanned' }>
    rationale: string
    task_code: string | null
  } | null
  attempts?: {
    attempt_no: number
    max_attempts: number
    best: { score: number; max_score: number; attempt_no: number } | null
  }
}

const PROCTOR_LABELS: Record<string, string> = {
  tab_blur: 'Tab switch',
  tab_focus: 'Tab return',
  copy: 'Copy',
  paste: 'Paste',
  fullscreen_exit: 'Fullscreen exit',
  fullscreen_enter: 'Fullscreen enter',
  right_click: 'Right click',
  visibility_change: 'Visibility change',
  window_blur: 'Window blur',
  window_focus: 'Window focus',
  screenshot: 'Screenshot',
  clipboard_copy: 'Copy attempt',
  clipboard_paste: 'Paste attempt',
  alt_tab_detected: 'Alt+Tab',
  right_click_blocked: 'Right click blocked',
  keyboard_shortcut_blocked: 'Blocked shortcut',
  hardware_port_audit: 'Hardware port audit',
  usb_device_plugged: 'USB device plugged',
  usb_device_unplugged: 'USB device unplugged',
  screen_share_started: 'Screen share started',
  screen_share_ended: 'Screen share ended',
  screen_capture_detected: 'Screen capture detected',
  prohibited_app_detected: 'Prohibited app detected',
  remote_desktop_detected: 'Remote desktop detected',
  rapid_window_resize: 'Rapid window resize',
  secondary_voice_detected: 'Secondary voice detected',
  volume_anomaly_detected: 'Volume anomaly',
  tab_focus_lost: 'Tab switch',
  copy_paste_attempt: 'Copy-paste attempt',
  hardware_port_anomaly: 'Hardware port anomaly',
  eye_blink_detected: 'Eye blink detected',
  eye_gaze_changed: 'Eye gaze changed',
  head_pose_turned_away: 'Head turned away',
  browser_fingerprint_captured: 'Device fingerprint captured',
  browser_fingerprint_changed: 'Device change detected',
  face_match_mismatch: 'Face mismatch',
  face_match_restored: 'Face verified',
  keyboard_dynamics_snapshot: 'Typing pattern analysis',
  answer_pattern_score: 'Answer pattern score',
  identity_no_camera: NO_CAMERA_REVIEW_LABEL,
  identity_check_completed: 'Identity check completed',
}

const PROCTOR_ICONS: Record<string, React.ReactNode> = {
  tab_blur: <Minimize2 className="w-3 h-3" />,
  tab_focus: <Maximize2 className="w-3 h-3" />,
  copy: <Copy className="w-3 h-3" />,
  paste: <Copy className="w-3 h-3" />,
  eye_blink_detected: <Eye className="w-3 h-3" />,
  eye_gaze_changed: <Eye className="w-3 h-3" />,
  head_pose_turned_away: <AlertTriangle className="w-3 h-3" />,
  browser_fingerprint_captured: <Fingerprint className="w-3 h-3" />,
  browser_fingerprint_changed: <Fingerprint className="w-3 h-3" />,
  face_match_mismatch: <Camera className="w-3 h-3" />,
  face_match_restored: <Camera className="w-3 h-3" />,
  keyboard_dynamics_snapshot: <Keyboard className="w-3 h-3" />,
  answer_pattern_score: <ShieldAlert className="w-3 h-3" />,
  identity_no_camera: <Camera className="w-3 h-3" />,
  identity_check_completed: <Camera className="w-3 h-3" />,
}

const PROCTOR_RISK_HIGH = new Set(['copy', 'paste', 'right_click', 'clipboard_copy', 'clipboard_paste', 'right_click_blocked', 'copy_paste_attempt', 'keyboard_shortcut_blocked', 'face_match_mismatch', 'answer_pattern_score'])
const PROCTOR_RISK_WARN = new Set(['tab_blur', 'tab_focus_lost', 'fullscreen_exit', 'window_blur', 'visibility_change', 'alt_tab_detected', 'prohibited_app_detected', 'remote_desktop_detected', 'screen_share_started', 'screen_capture_detected', 'secondary_voice_detected', 'volume_anomaly_detected', 'rapid_window_resize', 'usb_device_plugged', 'head_pose_turned_away', 'browser_fingerprint_changed', 'identity_no_camera'])
const PROCTOR_RISK_INFO = new Set(['eye_blink_detected', 'eye_gaze_changed', 'face_match_restored', 'browser_fingerprint_captured', 'keyboard_dynamics_snapshot', 'identity_check_completed'])


// Keys every event carries that are noise for a human reviewer.
const PROCTOR_META_HIDDEN = new Set(['ua', 'timestamp', 'id', 'user_id', 'session_id', 'created_at', 'event_type', 'session_kind', 'source'])

const PROCTOR_META_LABELS: Record<string, string> = {
  total: 'Devices', safe: 'Safe', warn: 'Review', blocked: 'Blocked',
  multi_monitor: 'Multi-monitor', screen_count: 'Monitors', browser: 'Browser',
  os: 'Operating system', device: 'Device type', ip: 'IP address',
  textLength: 'Characters', preview: 'Content', appName: 'Application',
  category: 'Category', url: 'URL', title: 'Page title', deviceName: 'Device',
  deviceType: 'Type', isBlocked: 'Blocked?', manufacturer: 'Manufacturer',
  indicator: 'Detected signal', displaySurface: 'Capture surface',
  trackKinds: 'Stream type', state: 'Permission state', count: 'Count',
  removedCount: 'Removed', audioLevelDb: 'Audio level', speechDetected: 'Speech',
  key: 'Key', label: 'Shortcut',
  blink_count: 'Total blinks', new_blinks: 'New blinks', gaze_direction: 'Gaze direction',
  yaw: 'Head yaw', pitch: 'Head pitch',
  hash: 'Fingerprint hash', original_hash: 'Original hash', current_hash: 'Current hash',
  original_screen: 'Original screen', current_screen: 'Current screen',
  score: 'Score', mismatch_count: 'Mismatch count', threshold: 'Threshold',
  avg_flight_time: 'Avg flight time', avg_dwell_time: 'Avg dwell time',
  typing_speed_cpm: 'Typing speed (CPM)', rhythm_variance: 'Rhythm variance',
  total_keystrokes: 'Total keystrokes', backspace_ratio: 'Backspace ratio',
  is_suspicious: 'Suspicious?', flags: 'Flags', breakdown: 'Breakdown',
  paste_score: 'Paste score', speed_score: 'Speed score',
  pattern_score: 'Pattern score', clipboard_score: 'Clipboard score',
  total_answers: 'Total answers', total_pastes: 'Total pastes',
  reason: 'Reason', scan: 'Virus scan', attempt_no: 'Attempt', id_photo: 'ID photo', face_photo: 'Face photo',
  face_similarity: 'Face match (advisory)', face_match_advisory: 'Face match note',
}

const humanize = (k: string): string =>
  PROCTOR_META_LABELS[k] || k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

/** Friendly, human-readable rendering of a proctoring event's metadata. */
function ProctorMetaDetails({ event_type, meta }: { event_type: string; meta: Record<string, unknown> }) {
  const { t: ta } = useAdminT()
  // Hardware port audit gets a purpose-built summary.
  if (event_type === 'hardware_port_audit') {
    const devices = Array.isArray(meta.devices) ? (meta.devices as Array<Record<string, unknown>>) : []
    const verdictClass = (v: unknown) => (v === 'blocked' ? 'text-red-600 dark:text-red-400' : v === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400')
    const verdictLabel = (v: unknown) => (v === 'blocked' ? 'Blocked' : v === 'warn' ? 'Review' : 'Safe')
    return (
      <div className="px-4 pb-3 border-t border-muted/50 space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
          <span className="text-muted-foreground">{ta('assessForm.devices')} <b className="text-foreground">{Number(meta.total ?? 0)}</b></span>
          {devices.length > 0 && (
            <>
              <span className="text-green-600 dark:text-green-400">{ta('assessForm.safe', { Number: Number(meta.safe ?? 0) })}</span>
              <span className="text-amber-600 dark:text-amber-400">{ta('assessForm.review', { Number: Number(meta.warn ?? 0) })}</span>
              <span className="text-red-600 dark:text-red-400">{ta('assessForm.blocked', { Number: Number(meta.blocked ?? 0) })}</span>
            </>
          )}
          <span className="text-muted-foreground">{ta('assessForm.monitors')} <b className="text-foreground">{Number(meta.screen_count ?? 1)}</b></span>
          {meta.multi_monitor === true && <span className="text-red-600 dark:text-red-400 font-semibold">{ta('assessForm.multiMonitorDetected')}</span>}
          {meta.browser ? <span className="text-muted-foreground">{String(meta.browser)}</span> : null}
          {meta.os ? <span className="text-muted-foreground">{String(meta.os)}</span> : null}
          {meta.ip ? <span className="text-muted-foreground">IP {String(meta.ip)}</span> : null}
        </div>
        {devices.length > 0 && (
          <div className="space-y-1 pt-1">
            {devices.map((d, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                <span className={`shrink-0 font-medium ${verdictClass(d.verdict)}`}>{verdictLabel(d.verdict)}</span>
                <span className="text-foreground">{String(d.productName || d.name || 'Unknown device')}</span>
                {d.reason ? <span className="text-muted-foreground">— {String(d.reason)}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Everything else renders as labelled key/value rows (noise keys filtered out).
  const entries = Object.entries(meta)
    .filter(([k]) => !PROCTOR_META_HIDDEN.has(k))
    .map(([k, v]) => {
      let value: string
      if (typeof v === 'boolean') value = v ? 'Yes' : 'No'
      else if (v === null || v === undefined) value = ''
      else if (typeof v === 'object') value = JSON.stringify(v)
      else value = String(v)
      return { label: humanize(k), value }
    })
    .filter(e => e.value !== '')

  if (entries.length === 0) return null

  return (
    <div className="px-4 pb-3 border-t border-muted/50 space-y-1 pt-1">
      {entries.map(({ label, value }) => (
        <div key={label} className="text-xs flex gap-2">
          <span className="text-muted-foreground shrink-0 w-32">{label}:</span>
          <span className="text-foreground wrap-break-word">{value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ExamResultsPage() {
  const gate = usePageGuard('tenant_admin')
  // Format all dates in the platform timezone (Settings → General).
  const { dateTime: fmtDateTime, date: fmtDate, time: fmtTime } = useDateFormat()
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const { t: tx } = useAdminT()
  const [exam, setExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [loading, setLoading] = useState(true)
  /** Compare view (2–4 candidate user ids) and bulk outcome dialog. */
  const [compareIds, setCompareIds] = useState<string[] | null>(null)
  const [outcomeIds, setOutcomeIds] = useState<string[] | null>(null)
  const [reviewCandidate, setReviewCandidate] = useState<CandidateResult | null>(null)
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  // Wave 6: file / video answers of the candidate under review.
  const answerFiles = useAnswerFiles(String(params.id), reviewData ? (reviewCandidate?.userId || reviewCandidate?.id) : null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [bulkReleasing, setBulkReleasing] = useState(false)
  const [issuingCerts, setIssuingCerts] = useState(false)
  // Jev second-opinion availability (null = not checked yet). Grades work
  // without it; unverified free-text grades are flagged for human review.
  const [jevConfigured, setJevConfigured] = useState<boolean | null>(null)
  // Per-question aggregates for the difficulty chart (null = not loaded).
  const [questionStats, setQuestionStats] = useState<Array<{
    qId: string; title: string; type: string; max: number;
    avgPct: number | null; graded: number; answered: number; total: number
  }> | null>(null)
  const [manualGrades, setManualGrades] = useState<Record<string, number>>({})
  const [savingGrades, setSavingGrades] = useState(false)
  const [aiGrading, setAiGrading] = useState<Record<string, boolean>>({})
  const [aiFeedback, setAiFeedback] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [showProctorLog, setShowProctorLog] = useState(true)
  const [showRawProctorMeta, setShowRawProctorMeta] = useState(false)
  const [proctorFilter, setProctorFilter] = useState<'all' | 'high' | 'warn' | 'info'>('all')
  const [resultFilter, setResultFilter] = useState<'all' | 'completed' | 'in_progress' | 'pending' | 'ungraded' | 'flagged'>('all')
  const [exportingReport, setExportingReport] = useState(false)
  const [showReleaseAllConfirm, setShowReleaseAllConfirm] = useState(false)
  // Cutoff release dialog state
  const [releaseCutoff, setReleaseCutoff] = useState(40)
  const [releaseResult, setReleaseResult] = useState<{
    released: number; passed: number; failed: number; skipped_pending: number; cutoff: number
  } | null>(null)
  const [examsList, setExamsList] = useState<{ id: string; title: string }[]>([])
  const [advanceTarget, setAdvanceTarget] = useState('')
  const [advancing, setAdvancing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  // On-demand plagiarism check (deterministic pairs + AI semantic checks).
  const [plagOpen, setPlagOpen] = useState(false)
  const [plagRunning, setPlagRunning] = useState(false)
  const [plagResult, setPlagResult] = useState<{
    score: number
    suspiciousPairs: Array<{ name1: string; name2: string; questionId: string; similarity: number; bothCorrect: boolean; aiSemanticMatch?: boolean; aiConfidence?: number }>
    aiGeneratedFlags: Array<{ name: string; questionId: string; probability: number; reason: string }>
    questionBankMatches: Array<{ name: string; questionId: string; matchType: string }>
    leaks: unknown
  } | null>(null)

  const runPlagiarismCheck = async () => {
    setPlagOpen(true)
    setPlagRunning(true)
    setPlagResult(null)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/plagiarism`, {
        method: 'POST',
        credentials: 'include',
      })
      const text = await res.text()
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`Server answered ${res.status} with a non-JSON page — retry.`)
      }
      if (!res.ok) throw new Error(json?.error || `Check failed (${res.status})`)
      setPlagResult(json)
      // Refresh the header badge (report is persisted on the exam).
      await fetchData().catch(() => {})
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Plagiarism check failed' })
      setPlagOpen(false)
    } finally {
      setPlagRunning(false)
    }
  }

  // Invite recovery — invites stuck in `used` with no matching submission
  // (invite-lockout chain). Resetting flips them back to pending so the
  // candidate can resubmit from the same browser (draft restores).
  const [stuckInvites, setStuckInvites] = useState<Array<{
    token: string; email: string; full_name: string; status: string;
    created_at: string | null; updated_at: string | null; has_draft: boolean | null
  }>>([])
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recovering, setRecovering] = useState<string | null>(null)

  const fetchRecovery = useCallback(async () => {
    if (!params.id) return
    setRecoveryLoading(true)
    try {
      const res = await fetch(`/api/admin/exams/${params.id}/invites/recover`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setStuckInvites(json.data || [])
    } catch { /* ignore — recovery panel simply stays empty */ }
    finally { setRecoveryLoading(false) }
  }, [params.id])

  const resetInvites = async (tokens: string[] | 'all', label: string) => {
    if (!params.id || recovering) return
    setRecovering(label)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(Array.isArray(tokens) ? { tokens } : { all: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Reset failed')
      addToast({ type: 'success', title: `Invite reset — ${json.reset} candidate(s) can resubmit` })
      await fetchRecovery()
      await fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Reset failed', message: e instanceof Error ? e.message : '' })
    } finally {
      setRecovering(null)
    }
  }

  /** `silent`: refresh rows in place (no skeleton, no redirect on error) — used after outcome edits. */
  const fetchData = useCallback(async (silent = false) => {
    if (!params.id) return
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/admin/exams/${params.id}/results`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load results')
      setExam(json.exam)
      // Pre-fill the release cutoff with the exam's saved pass mark.
      if (typeof json.exam?.passing_score === 'number') setReleaseCutoff(json.exam.passing_score)
      setResults((json.results || []).map((r: CandidateResult) => ({
        ...r,
        inviteId: r.id,
      })))
    } catch {
      addToast({ type: 'error', title: 'Failed to load results' })
      if (!silent) router.push('/dashboard/admin/assessments')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchRecovery() }, [fetchRecovery])
  useEffect(() => {
    fetch('/api/admin/jev-status', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setJevConfigured(j.configured === true))
      .catch(() => setJevConfigured(false))
  }, [])
  useEffect(() => {
    if (!params.id) return
    fetch(`/api/admin/exams/${params.id}/question-stats`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setQuestionStats(Array.isArray(j.data) ? j.data : []))
      .catch(() => setQuestionStats([]))
  }, [params.id])

  // Real-time polling for proctor events when review modal is open
  useEffect(() => {
    if (!reviewCandidate) return
    const pollProctorEvents = async () => {
      try {
        const uid = reviewCandidate.userId || reviewCandidate.id
        const res = await fetch(`/api/admin/exams/${params.id}/submissions/${uid}`, { credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          if (json.proctorEvents && reviewData) {
            setReviewData(prev => prev ? { ...prev, proctorEvents: json.proctorEvents } : null)
          }
        }
      } catch { /* ignore */ }
    }
    // Poll every 5 seconds while review modal is open
    const interval = setInterval(pollProctorEvents, 5000)
    return () => clearInterval(interval)
  }, [reviewCandidate, params.id])

  const openReview = async (row: CandidateResult) => {
    setReviewCandidate(row)
    setReviewData(null)
    setReviewLoading(true)
    setManualGrades({})
    setRemarks({})
    setAiFeedback({})
    setAiGrading({})
    try {
      const uid = row.userId || row.id
      const res = await fetch(`/api/admin/exams/${params.id}/submissions/${uid}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load review')
      if (!json.submission) {
        addToast({ type: 'info', title: 'No submission found — candidate may not have completed the assessment' })
        setReviewCandidate(null)
        return
      }
      setReviewData(json)
    } catch {
      addToast({ type: 'error', title: 'Failed to load submission details' })
      setReviewCandidate(null)
    } finally {
      setReviewLoading(false)
    }
  }

  const aiGradeQuestion = async (qId: string) => {
    if (!reviewCandidate) return
    setAiGrading(prev => ({ ...prev, [qId]: true }))
    try {
      const uid = reviewCandidate.userId || reviewCandidate.id
      const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${uid}/ai-grade`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'AI grading failed')
      setManualGrades(prev => ({ ...prev, [qId]: json.recommended }))
      if (json.feedback) setAiFeedback(prev => ({ ...prev, [qId]: json.feedback }))
      addToast({ type: 'success', title: `AI suggested ${json.recommended}/${json.max_points} (${json.verdict})` })
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'AI grading failed' })
    } finally {
      setAiGrading(prev => ({ ...prev, [qId]: false }))
    }
  }

  const [bulkGrading, setBulkGrading] = useState<{ running: boolean; done: number; total: number; failed: string[] }>({ running: false, done: 0, total: 0, failed: [] })

  const aiGradeAll = async () => {
    if (!reviewData || !reviewCandidate || bulkGrading.running) return
    const uid = reviewCandidate.userId || reviewCandidate.id
    // Grade whatever still needs review: pending questions, or any question the
    // candidate answered but that hasn't been awarded points yet.
    // CAD submissions are files — a person scores them, never the AI.
    const gradable = reviewData.questions.filter(q => q.type !== 'cad')
    const needsGrade = gradable.filter(q => {
      const detail = reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)
      return detail?.pending_review === true || (detail?.awarded === undefined && !detail?.correct)
    })
    const questions = needsGrade.length > 0 ? needsGrade : gradable.filter(q => !!reviewData.submission.answers[q.id])
    const withAnswer = questions.filter(q => !!reviewData.submission.answers[q.id])
    const blank = questions.filter(q => !reviewData.submission.answers[q.id])
    // Unanswered questions are an automatic 0 — no LLM round-trip needed.
    for (const q of blank) {
      setManualGrades(prev => ({ ...prev, [q.id]: 0 }))
    }
    if (withAnswer.length === 0 && blank.length === 0) {
      addToast({ type: 'error', title: 'No questions to grade' })
      return
    }
    if (withAnswer.length === 0) {
      addToast({ type: 'success', title: `${blank.length} unanswered question(s) set to 0`, message: 'Click Save manual grades to persist.' })
      return
    }
    setBulkGrading({ running: true, done: 0, total: withAnswer.length, failed: [] })
    const failed: string[] = []
    for (let i = 0; i < withAnswer.length; i++) {
      const q = withAnswer[i]
      try {
        const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${uid}/ai-grade`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qId: q.id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'd')
        setManualGrades(prev => ({ ...prev, [q.id]: json.recommended }))
        if (json.feedback) {
          setAiFeedback(prev => ({ ...prev, [q.id]: json.feedback }))
          setRemarks(prev => ({ ...prev, [q.id]: json.feedback }))
        }
      } catch {
        failed.push(q.id)
      }
      setBulkGrading(prev => ({ ...prev, done: prev.done + 1 }))
    }
    setBulkGrading(prev => ({ ...prev, running: false, failed }))
    if (failed.length > 0) {
      addToast({ type: 'error', title: `Graded ${withAnswer.length - failed.length}/${withAnswer.length}`, message: `${failed.length} question(s) could not be graded — check them manually.` })
    } else {
      addToast({ type: 'success', title: `AI graded ${withAnswer.length} question(s)`, message: `Review the suggestions, then click Save manual grades.${blank.length > 0 ? ` ${blank.length} unanswered question(s) set to 0.` : ''}` })
    }
  }

    const [bulkGradeIds, setBulkGradeIds] = useState<string[] | null>(null)
    // Chunked grading progress (visible in the dialog below). Batches of 2
    // keep every request under the ~100s proxy limit — batches of 4 still
    // died with 524s on free-text-heavy exams (LLM chain walks + rate-limit
    // backoffs + per-grade pacing add up fast).
    const [gradeProg, setGradeProg] = useState<{
      done: number; total: number; graded: number; failed: number; running: boolean
      items: Array<{ id: string; name: string; status: 'pending' | 'grading' | 'done' | 'failed'; detail: string }>
    } | null>(null)
    const gradeCancelRef = useRef(false)
    const GRADE_CHUNK = 2

    const postGradeChunk = async (chunk: string[]) => {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/ai-grade-all`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: chunk }),
      })
      const text = await res.text()
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        throw new Error(
          `Server answered ${res.status} with a non-JSON page (usually a proxy timeout on a long request) — retry; already-graded answers are kept so re-running only grades the rest.`
        )
      }
      if (!res.ok) throw new Error(json?.error || `Bulk grading failed (${res.status})`)
      return json
    }

  const gradeCandidates = async (ids: string[]) => {
    if (!ids.length || gradeProg?.running) return
    gradeCancelRef.current = false
    setBulkGradeIds(ids)
    const nameOf = (id: string) => {
      const r = results.find((x) => (x.userId || x.id) === id)
      return r ? r.name : id
    }
    const items: Array<{ id: string; name: string; status: 'pending' | 'grading' | 'done' | 'failed'; detail: string }> =
      ids.map((id) => ({ id, name: nameOf(id), status: 'pending', detail: 'Waiting…' }))
    const setItem = (id: string, patch: Partial<(typeof items)[number]>) => {
      setGradeProg(prev => (prev ? { ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : prev))
    }
    setGradeProg({ done: 0, total: ids.length, graded: 0, failed: 0, running: true, items })
    let graded = 0
    let failed = 0
    const failedIds = new Set<string>()
    try {
      for (let i = 0; i < ids.length; i += GRADE_CHUNK) {
        if (gradeCancelRef.current) break
        const chunk = ids.slice(i, i + GRADE_CHUNK)
        chunk.forEach((c) => setItem(c, { status: 'grading', detail: 'Grading…' }))
        try {
          // The server caps free-text grades per request and reports hasMore;
          // call back until the chunk is fully graded. Each round persists, so
          // stopping/exiting never loses completed work.
          let json = await postGradeChunk(chunk)
          graded += json.graded || 0
          failed += json.failed || 0
          let rounds = 0
          let lastGraded = json.graded || 0
          while (json.hasMore && !gradeCancelRef.current && rounds < 40) {
            rounds++
            json = await postGradeChunk(chunk)
            graded += json.graded || 0
            failed += json.failed || 0
            setGradeProg(prev => (prev ? { ...prev, graded, failed } : prev))
            // No progress in a round = stuck (e.g. persistent rate limit) — stop
            // rather than spin forever; re-running picks up the remainder.
            if ((json.graded || 0) === 0 && lastGraded === 0) break
            lastGraded = json.graded || 0
          }
          const byUser = new Map<string, { graded: number; failed: string[] }>()
          for (const r of json.results || []) {
            if (r?.userId) byUser.set(r.userId, { graded: r.graded || 0, failed: Array.isArray(r.failed) ? r.failed : [] })
          }
          for (const c of chunk) {
            const u = byUser.get(c)
            if (json.hasMore && !u) {
              setItem(c, { status: 'grading', detail: 'Remainder still pending — retry, or grade manually in review.' })
            } else if (!u) {
              failedIds.add(c)
              setItem(c, { status: 'failed', detail: 'No result returned — retry grades only the remainder.' })
            } else if (u.failed.length > 0) {
              failedIds.add(c)
              setItem(c, { status: 'failed', detail: `${u.graded} graded, ${u.failed.length} question(s) failed — retry picks up the rest.` })
            } else {
              setItem(c, { status: 'done', detail: u.graded > 0 ? `${u.graded} question(s) graded` : 'Nothing pending — already graded.' })
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Batch failed.'
          failed += chunk.length
          chunk.forEach((c) => {
            failedIds.add(c)
            setItem(c, { status: 'failed', detail: msg })
          })
        }
        setGradeProg(prev => (prev ? { ...prev, done: Math.min(ids.length, i + chunk.length), graded, failed } : prev))
      }
      const cancelled = gradeCancelRef.current
      addToast({
        type: failed > 0 ? 'warning' : 'success',
        title: cancelled
          ? `Grading stopped — ${graded} question(s) graded so far`
          : `AI graded ${graded} question(s) across ${ids.length - failedIds.size} candidate(s)`,
        message: failed > 0
          ? `${failed} question(s) failed or rate-limited — click Grade again and it picks up only the rest.`
          : 'Grades saved. List refreshed below.',
      })
      setResults(prev => prev.map(r => {
        if (ids.includes(r.userId || r.id)) {
          return { ...r, graded: !failedIds.has(r.userId || '') ? true : r.graded }
        }
        return r
      }))
      await fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Bulk grading failed' })
    } finally {
      setBulkGradeIds(null)
      setGradeProg(prev => (prev ? { ...prev, running: false } : prev))
    }
  }

  const releaseScore = async (userId: string, name: string) => {
    setReleasing(userId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${userId}/release`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        if (json?.blocked) {
          addToast({ type: 'error', title: 'Grading pending', message: `Score for ${name} cannot be released until manual grading is complete.` })
        } else {
          addToast({ type: 'error', title: json?.error || 'Failed to release score' })
        }
        return
      }
      addToast({ type: 'success', title: `Score released for ${name}` })
      setReviewData(prev => prev ? { ...prev, submission: { ...prev.submission, released_at: json.released_at } } : null)
      setResults(prev => prev.map(r => r.userId === userId ? { ...r, released: true } : r))
    } catch {
      addToast({ type: 'error', title: `Failed to release score for ${name}` })
    } finally {
      setReleasing(null)
    }
  }

  const [resendingId, setResendingId] = useState<string | null>(null)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [bulkReminding, setBulkReminding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<{ id: string; name: string } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ certId: string; userId: string; name: string } | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revoking, setRevoking] = useState(false)

  const revokeCertificate = async () => {
    if (!revokeTarget || revoking) return
    const reason = revokeReason.trim()
    if (reason.length < 5) {
      addToast({ type: 'error', title: 'Give a reason (at least 5 characters)' })
      return
    }
    setRevoking(true)
    try {
      const res = await csrfFetch(`/api/admin/certifications/${encodeURIComponent(revokeTarget.certId)}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string; revokedAt?: string }
      if (!res.ok) throw new Error(json.error || 'Could not revoke the certificate')
      const { userId, certId, name } = revokeTarget
      setResults((prev) => prev.map((r) => (r.userId === userId && r.certificate?.id === certId
        ? { ...r, certificate: { ...r.certificate, revokedAt: json.revokedAt || new Date().toISOString() } }
        : r)))
      addToast({ type: 'success', title: `${name}'s certificate is revoked`, message: 'Its verify link now shows it as revoked.' })
      setRevokeTarget(null)
      setRevokeReason('')
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Could not revoke the certificate' })
    } finally {
      setRevoking(false)
    }
  }

  const resendInvite = async (inviteId: string, name: string) => {
    setResendingId(inviteId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/${inviteId}/resend`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to resend')
      addToast({ type: 'success', title: `Invite resent to ${name}` })
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Failed to resend invite' })
    } finally {
      setResendingId(null)
    }
  }

  const sendReminder = async (inviteId: string, name: string) => {
    setRemindingId(inviteId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/${inviteId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'reminder' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send reminder')
      addToast({ type: 'success', title: `Reminder sent to ${name}` })
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Failed to send reminder' })
    } finally {
      setRemindingId(null)
    }
  }

  const remindAllPending = async () => {
    setBulkReminding(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/remind`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: `Reminders sent to ${json.sent} of ${json.total} pending candidates` })
    } catch {
      addToast({ type: 'error', title: 'Failed to send reminders' })
    } finally {
      setBulkReminding(false)
    }
  }

  const deleteInvite = async (inviteId: string, name: string) => {
    setDeletingId(inviteId)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const j = await res.json().catch(() => ({})) as { error?: string; deleted?: boolean; revoked?: boolean }
      if (!res.ok) throw new Error(j.error || '')
      if (j.deleted) {
        addToast({ type: 'success', title: `Invite deleted for ${name}` })
        setResults(prev => prev.filter(r => r.inviteId !== inviteId))
      } else {
        // The candidate already submitted: the link is withdrawn, results stay.
        addToast({ type: 'success', title: `Invite withdrawn for ${name}`, message: 'Their submitted results are kept.' })
      }
    } catch (e) {
      addToast({ type: 'error', title: `Failed to withdraw invite for ${name}`, message: e instanceof Error && e.message ? e.message : undefined })
    } finally {
      setDeletingId(null)
    }
  }

  const copyInviteLink = (row: CandidateResult) => {
    // The invite route looks up by token, not by the invite doc id.
    if (!row.inviteToken) {
      addToast({ type: 'error', title: 'No invite link for this candidate', message: 'Use resend invite to send a fresh link.' })
      return
    }
    const link = `${window.location.origin}/assessment/invite/${encodeURIComponent(row.inviteToken)}`
    navigator.clipboard.writeText(link).then(
      () => addToast({ type: 'success', title: `Invite link copied for ${row.name}` }),
      () => addToast({ type: 'error', title: 'Could not copy the link' }),
    )
  }

  const downloadReviewPdf = () => {
    if (!reviewData || !reviewCandidate) return
    // Print the live review modal via a dedicated print stylesheet. This keeps
    // markdown, syntax-highlighted code, badges, and verdicts pixel-identical
    // to what the admin sees on screen (jsPDF cannot reproduce them).
    window.print()
    addToast({ type: 'info', title: 'Choose "Save as PDF" in the print dialog' })
  }

  const exportCSV = () => {
    const secs = exam?.sections ?? []
    const headers = ['Candidate', 'Email', 'Status', 'Score (%)', 'Submitted At', 'Integrity Flags', 'Graded', 'Released', 'Outcome', ...secs.map((x) => `${x.title} (%)`)]
    const rows = results.map((r: CandidateResult) => [
      r.name || '',
      r.email || '',
      r.status || '',
      r.score !== null ? String(r.score) : '',
      r.submittedAt ? fmtDateTime(r.submittedAt) : '',
      String(r.proctoringFlags || 0),
      r.graded ? 'Yes' : 'No',
      r.released ? 'Yes' : 'No',
      isOutcomeStatus(r.outcome) ? OUTCOME_LABELS[r.outcome] : '',
      ...secs.map((x) => {
        const sc = r.sectionScores?.find((y) => y.id === x.id)
        return sc && sc.percent !== null ? String(sc.percent) : ''
      }),
    ])
    // Candidate-controlled text (names) must not run as a spreadsheet formula.
    const cell = (c: unknown) => {
      let v = String(c ?? '')
      if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
      return `"${v.replace(/"/g, '""')}"`
    }
    const csv = [headers, ...rows]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(exam?.title || 'exam').replace(/[^a-z0-9]+/gi, '_')}_results_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking right after click() can cancel the download in Safari/Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const formatProctorType = (type: string): string => PROCTOR_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const proctorColor = (type: string): string => {
    if (PROCTOR_RISK_HIGH.has(type)) return 'border-l-[3px] border-l-red-500 text-red-700 dark:text-red-400 border-border/50 bg-red-500/5'
    if (PROCTOR_RISK_WARN.has(type)) return 'border-l-[3px] border-l-amber-500 text-amber-400 border-border/50 bg-amber-500/5'
    if (PROCTOR_RISK_INFO.has(type)) return 'border-l-[3px] border-l-primary text-primary border-border/50 bg-blue-500/5'
    return 'border-l-[3px] border-l-muted-foreground text-muted-foreground border-border/50 bg-muted/20'
  }

  const recordAuditLog = async (action: string, target: string, details: string) => {
    try {
      await csrfFetch('/api/admin/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, details }),
      })
    } catch { /* audit log is best-effort */ }
  }

  const exportProctorReport = async () => {
    if (!params.id) return
    setExportingReport(true)
    try {
      const res = await fetch(`/api/admin/exams/${params.id}/proctor-report`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch report')

      const examData = json.exam
      const candidates = json.candidates || []

      // Everything below is candidate-controlled (names, photos, event meta):
      // escape every interpolation and only allow image data URLs / https.
      const esc = (v: unknown) => String(v ?? '').replace(/[&<>"'`]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch] as string))
      const safeImg = (v: unknown) => {
        const s = String(v ?? '')
        return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(s) || /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ''
      }
      const formatEvtType = (t: string) => esc(PROCTOR_LABELS[t] || String(t).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))

      let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'"><title>Proctor Report — ${esc(examData.title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; } h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; } th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; font-size: 12px; }
  th { background: #f9fafb; font-weight: 600; } .pass { color: #15803d; } .fail { color: #dc2626; }
  .evt { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  .evt-red { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .evt-amber { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .evt-blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .evt-gray { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
  img { max-width: 120px; border-radius: 4px; border: 1px solid #e5e7eb; }
  .meta { color: #6b7280; font-size: 11px; } .summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 8px 0; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:right;margin-bottom:12px"><button id="print-report" type="button" style="padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;background:#fff">Print / Save PDF</button></div>
<h1>Proctor Report: ${esc(examData.title)}</h1>
<p class="meta">Level: ${esc(examData.level)} | Duration: ${esc(examData.duration)} min | Generated: ${fmtDateTime(new Date())}</p>
<p class="meta">Total Candidates: ${esc(json.total_candidates)} | Total Proctor Events: ${esc(json.total_events)}</p>
<h2>Event type summary</h2>
<div class="summary-box"><table><tr><th>Event type</th><th>Count</th></tr>`

      for (const [type, count] of Object.entries(json.event_type_summary || {})) {
        html += `<tr><td>${formatEvtType(type)}</td><td>${esc(count)}</td></tr>`
      }
      html += `</table></div>`

      for (const c of candidates) {
        const pct = c.max_score > 0 ? Math.round((c.score / c.max_score) * 100) : null
        const passed = pct !== null && pct >= 50
        const rating = (c.event_count || 0) === 0 ? 'Clean' : (c.event_count || 0) < 5 ? 'Low risk' : (c.event_count || 0) < 15 ? 'Medium risk' : 'High risk'

        html += `<h2>${esc(c.name || 'Unknown')} <span class="meta">(${esc(c.email || 'N/A')})</span></h2>`
        html += `<div class="summary-box">`
        html += `<table><tr><th>Score</th><th>Pass/Fail</th><th>Submitted</th><th>Integrity events</th><th>Rating</th></tr>`
        html += `<tr><td>${pct !== null ? pct + '%' : '--'}</td><td class="${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</td>`
        html += `<td>${c.submitted_at ? fmtDateTime(c.submitted_at) : '--'}</td>`
        html += `<td>${esc(Number(c.event_count) || 0)}</td><td><strong>${rating}</strong></td></tr></table>`

        const idImg = safeImg(c.id_photo)
        const faceImg = safeImg(c.face_photo)
        if (idImg || faceImg) {
          html += `<div style="margin-top:8px">`
          if (idImg) html += `<div style="display:inline-block;margin-right:12px"><div class="meta">ID photo</div><img src="${esc(idImg)}" alt="ID document photo" /></div>`
          if (faceImg) html += `<div style="display:inline-block"><div class="meta">Face photo</div><img src="${esc(faceImg)}" alt="Candidate face photo" /></div>`
          html += `</div>`
        }

        // Eye gaze / blink / head pose summary
        const eyeBlinkEvts = (c.proctor_events || []).filter((e: any) => ['eye_blink_detected', 'eye_gaze_changed', 'head_pose_turned_away'].includes(e.event_type))
        const kbEvts = (c.proctor_events || []).filter((e: any) => e.event_type === 'keyboard_dynamics_snapshot')
        const fpEvts = (c.proctor_events || []).filter((e: any) => ['browser_fingerprint_captured', 'browser_fingerprint_changed'].includes(e.event_type))
        const faceEvts = (c.proctor_events || []).filter((e: any) => ['face_match_mismatch', 'face_match_restored'].includes(e.event_type))
        const answerEvts = (c.proctor_events || []).filter((e: any) => e.event_type === 'answer_pattern_score')

        html += `<div style="margin-top:8px" class="meta">`
        html += `Eye/Blink Events: ${eyeBlinkEvts.length} | `
        html += `Typing Analysis: ${kbEvts.length} | `
        html += `Device Fingerprint: ${fpEvts.length} | `
        html += `Face Verification: ${faceEvts.length}`
        if (answerEvts.length > 0) {
          const lastAnswerEvt = answerEvts[answerEvts.length - 1]
          const score = (lastAnswerEvt.meta as any)?.score
          html += ` | Answer Pattern Score: ${score !== undefined ? esc(score) : 'N/A'}`
        }
        html += `</div></div>`

        if (c.proctor_events && c.proctor_events.length > 0) {
          html += `<h3>Proctoring event log</h3><table><tr><th>Event</th><th>Time</th><th>Details</th></tr>`
          for (const evt of c.proctor_events) {
            const evtType = formatEvtType(evt.event_type)
            const time = evt.created_at ? fmtDateTime(evt.created_at) : '--'
            const meta = evt.meta || {}
            const details = Object.entries(meta)
              .filter(([k]) => !['ua', 'timestamp', 'id', 'user_id', 'session_id', 'created_at', 'event_type', 'session_kind', 'source', 'ip', 'browser', 'os', 'device'].includes(k))
              .map(([k, v]) => `${esc(k.replace(/_/g, ' '))}: ${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
              .join('; ')
            html += `<tr><td>${evtType}</td><td class="meta">${esc(time)}</td><td class="meta">${details}</td></tr>`
          }
          html += `</table>`
        }
      }

      html += `</body></html>`

      const win = window.open('', '_blank')
      if (win) {
        win.opener = null
        win.document.write(html)
        win.document.close()
        win.document.getElementById('print-report')?.addEventListener('click', () => win.print())
      }
      addToast({ type: 'success', title: 'Proctor report generated' })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to export report', message: e.message || '' })
    } finally {
      setExportingReport(false)
    }
  }

  const releaseAllWithAudit = async () => {
    setBulkReleasing(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/release-scores`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoff: releaseCutoff }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setReleaseCutoff(json.cutoff ?? releaseCutoff)
      setReleaseResult({
        released: json.released || 0,
        passed: json.passed || 0,
        failed: json.failed || 0,
        skipped_pending: json.skipped_pending || 0,
        cutoff: json.cutoff ?? releaseCutoff,
      })
      addToast({
        type: json.released === 0 ? 'info' : 'success',
        title: json.released === 0
          ? 'No unreleased scores found'
          : `${json.released} scores released (${json.passed} passed, ${json.failed} below cutoff)`,
        message: [
          json.certificates_issued > 0 ? `${json.certificates_issued} certificate${json.certificates_issued === 1 ? '' : 's'} issued.` : null,
          json.skipped_pending > 0 ? `${json.skipped_pending} ungraded submission(s) stayed locked.` : null,
        ].filter(Boolean).join(' ') || undefined,
      })

      if (json.released > 0) {
        await recordAuditLog('release_scores', String(params.id), `Released ${json.released} scores at ${json.cutoff}% cutoff`)
      }

      // Refresh results
      fetchData()
    } catch {
      addToast({ type: 'error', title: 'Bulk release failed' })
    } finally {
      setBulkReleasing(false)
    }
  }

  // Certificates for results released before certificates existed (idempotent on the server).
  const issueMissingCertificates = async () => {
    setIssuingCerts(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/release-scores/certificates`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not issue certificates')
      const issued = Number(json.issued) || 0
      addToast({
        type: issued > 0 ? 'success' : 'info',
        title: issued > 0
          ? `${issued} certificate${issued === 1 ? '' : 's'} issued`
          : 'No missing certificates',
        message: [
          `${Number(json.checked) || 0} passing candidate${json.checked === 1 ? '' : 's'} checked at ${json.cutoff ?? '—'}% pass mark.`,
          json.failed > 0 ? `${json.failed} could not be issued; try again.` : null,
        ].filter(Boolean).join(' '),
      })
      if (issued > 0) {
        await recordAuditLog('issue_missing_certificates', String(params.id), `Issued ${issued} missing certificates`)
      }
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Could not issue certificates' })
    } finally {
      setIssuingCerts(false)
    }
  }

  const openReleaseDialog = () => {
    setReleaseResult(null)
    setAdvanceTarget('')
    setShowReleaseAllConfirm(true)
    if (examsList.length === 0) {
      fetch('/api/exams', { credentials: 'include' })
        .then((r) => r.json())
        .then((j) => setExamsList((j.data || []).filter((e: { id: string }) => e.id !== params.id).map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))))
        .catch(() => {})
    }
  }

  // Live preview from rows on screen: releasable = submitted + graded + unreleased.
  const releasablePreview = results.filter((r) => r.status === 'completed' && r.graded && !r.released)
  const blockedPreviewCount = results.filter((r) => r.status === 'completed' && !r.graded && !r.released).length
  const passPreview = releasablePreview.filter((r) => (r.score ?? 0) >= releaseCutoff)
  const failPreview = releasablePreview.filter((r) => (r.score ?? 0) < releaseCutoff)

  const exportPassPdf = async () => {
    const cutoff = releaseResult?.cutoff ?? releaseCutoff
    // Post-release ground truth: released rows at/above the applied cutoff.
    const list = results
      .filter((r) => r.released && (r.score ?? 0) >= cutoff)
      .map((r) => ({ name: r.name, email: r.email, score: r.score }))
    if (list.length === 0) {
      addToast({ type: 'info', title: 'No passed candidates to export yet' })
      return
    }
    setExportingPdf(true)
    try {
      const { downloadPassListPdf } = await import('@/lib/pass-list-pdf')
      await downloadPassListPdf(exam?.title || 'Assessment', cutoff, list)
    } catch {
      addToast({ type: 'error', title: 'PDF export failed' })
    } finally {
      setExportingPdf(false)
    }
  }

  const advancePassers = async () => {
    if (!advanceTarget) {
      addToast({ type: 'error', title: 'Pick the next-round assessment first' })
      return
    }
    setAdvancing(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/advance`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetExamId: advanceTarget }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Advance failed')
      const notSent = Math.max(0, (json.advanced || 0) - (json.emailed || 0))
      addToast({
        type: notSent > 0 ? 'warning' : 'success',
        title: `${json.advanced} candidate(s) advanced to ${json.target?.title || 'next round'}`,
        message: [
          notSent > 0 ? `${notSent} invite email(s) could not be sent — use resend on the next round's results page.` : '',
          json.skipped > 0 ? `${json.skipped} skipped (already invited or missing email).` : '',
        ].filter(Boolean).join(' ') || undefined,
      })
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Advance failed' })
    } finally {
      setAdvancing(false)
    }
  }

  const saveGradesWithAudit = async () => {
    if (!reviewCandidate) return
    // ponytail: saving used to send ONLY the boxes the admin typed in, so a
    // question the AI graded but flagged for review (value shown, never
    // touched) stayed pending_review forever and blocked release. Saving is an
    // explicit "I've reviewed this candidate", so every still-pending question
    // is now committed with its shown value (admin override wins).
    const pendingDetails = (reviewData?.submission.details || []).filter(d => d.pending_review === true)
    if (Object.keys(manualGrades).length === 0 && pendingDetails.length === 0) return
    const grades: Record<string, number> = {}
    for (const d of pendingDetails) {
      grades[d.qId] = manualGrades[d.qId] ?? d.awarded ?? 0
    }
    Object.assign(grades, manualGrades)
    setSavingGrades(true)
    try {
      const uid = reviewCandidate.userId || reviewCandidate.id
      const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ grades, remarks }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: 'Grades saved successfully' })

      await recordAuditLog('grade_submission', String(params.id), `Graded user ${reviewCandidate.name || uid}`)

      // Update local state
      if (reviewData) {
        const updatedDetails = reviewData.submission.details.map(d => {
          if (grades[d.qId] !== undefined) {
            const remark = remarks[d.qId]
            return {
              ...d,
              awarded: grades[d.qId],
              correct: grades[d.qId] > 0,
              pending_review: false,
              ...(remark && remark.trim() ? { remarks: remark.trim() } : {}),
            }
          }
          return d
        })
        setReviewData({
          ...reviewData,
          submission: { ...reviewData.submission, details: updatedDetails, score: json.score, has_pending_review: json.has_pending_review }
        })
      }
      const savedMax = reviewData?.submission.max_score || 0
      setResults(prev => prev.map(r => {
        if ((r.userId || r.id) === uid) {
          const max = r.maxScore || savedMax
          const pct = max > 0 ? Math.min(100, Math.round((json.score / max) * 100)) : json.score
          return { ...r, score: pct }
        }
        return r
      }))
      setManualGrades({})
      setRemarks({})
      setAiFeedback({})
    } catch {
      addToast({ type: 'error', title: 'Failed to save grades' })
    } finally {
      setSavingGrades(false)
    }
  }

  const columns: DataTableColumn<CandidateResult>[] = [
    {
      key: 'name',
      header: 'Candidate',
      sortable: true,
      cell: (row: CandidateResult) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'invitedAt',
      header: 'Invited',
      sortable: true,
      cell: (row: CandidateResult) => (
        row.invitedAt ? (
          <div>
            <div className="text-sm">{fmtDate(row.invitedAt)}</div>
            <div className="text-xs text-muted-foreground">{fmtTime(row.invitedAt)}</div>
            {!!row.reminderCount && !row.submittedAt && <div className="text-xs text-muted-foreground">{tx('automations.nudges.remindedTimes', { count: row.reminderCount })}</div>}
          </div>
        ) : <span className="text-xs text-muted-foreground">--</span>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortable: true,
      cell: (row: CandidateResult) => (
        row.submittedAt ? (
          <div>
            <div className="text-sm">{fmtDate(row.submittedAt)}</div>
            <div className="text-xs text-muted-foreground">{fmtTime(row.submittedAt)}</div>
          </div>
        ) : <span className="text-xs text-muted-foreground">--</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cell: (row: CandidateResult) => (
        row.source === 'invite' ? (
          <Badge variant="outline" className="text-xs"><Mail className="w-3 h-3 mr-1" />{tx('assessForm.invite')}</Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-primary border-blue-500/20"><Link className="w-3 h-3 mr-1" />{tx('assessForm.public')}</Badge>
        )
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: CandidateResult) => {
        const badges: Record<string, React.ReactNode> = {
          pending: <Badge variant="outline" className="text-muted-foreground">{tx('assessForm.invited')}</Badge>,
          in_progress: <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-500/20">{tx('assessForm.inProgress')}</Badge>,
          completed: <Badge variant="success">{tx('assessForm.completed')}</Badge>,
          expired: <Badge variant="secondary" className="text-amber-700 dark:text-amber-400">{tx('assessForm.expired')}</Badge>,
        }
        return badges[row.status] || <Badge variant="outline">{row.status}</Badge>
      },
    },
    {
      key: 'graded',
      header: 'Graded',
      cell: (row: CandidateResult) => {
        if (row.status !== 'completed') return <span className="text-xs text-muted-foreground">--</span>
        if (row.graded) return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {tx('assessForm.graded')}</span>
        if (row.needsReview) return <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1" title={tx('assessForm.aiGradedButAQuestionIs')}><Clock className="w-3 h-3"/> {tx('assessForm.needsReview')}</span>
        return <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {tx('assessForm.notGraded')}</span>
      },
    },
    {
      key: 'deliveryStatus',
      header: 'Email',
      cell: (row: CandidateResult) => {
        if (row.deliveryStatus === 'sending') {
          return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> {tx('assessForm.sending')}</span>
        }
        if (row.deliveryStatus === 'sent') {
          return <span className="text-xs text-primary flex items-center gap-1"><Send className="w-3 h-3"/> {tx('assessForm.sent')}</span>
        }
        if (row.deliveryStatus === 'opened') {
          return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><Eye className="w-3 h-3"/> {tx('assessForm.opened')}</span>
        }
        if (row.deliveryStatus === 'delivered') {
          return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {tx('assessForm.delivered')}</span>
        }
        if (row.deliveryStatus === 'failed' || row.deliveryStatus === 'bounced') {
          return <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3"/> {row.deliveryStatus === 'bounced' ? 'Bounced' : 'Failed'}</span>
        }
        if (row.status === 'completed') {
          return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {tx('assessForm.delivered')}</span>
        }
        return <span className="text-xs text-muted-foreground">--</span>
      },
    },
    {
      key: 'proctoringFlags',
      header: 'Integrity',
      cell: (row: CandidateResult) => (
        <div>
        <div className="flex items-center gap-2">
          {row.proctoringFlags === 0 ? (
            <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {tx('assessForm.clean')}</span>
          ) : (
            <span className="text-red-600 dark:text-red-400 text-xs flex items-center gap-1 font-bold">
              <ShieldAlert className="w-3 h-3"/> {row.proctoringFlags} {tx('assessForm.flags')}
            </span>
          )}
        </div>
        {row.identityReview && (
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1" title={tx('assessForm.theCandidateHadNoWorkingCamera')}>
            <Camera className="w-3 h-3 shrink-0" /> {NO_CAMERA_REVIEW_LABEL}
          </div>
        )}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      sortable: true,
      cell: (row: CandidateResult) => (
        <div>
          <div className="font-mono font-medium">
            {row.score !== null ? `${row.score}%` : '--'}
          </div>
          {row.maxAttempts !== undefined && row.maxAttempts > 1 && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {tx('assessForm.attempt')} {row.attemptNo ?? 1} {tx('assessForm.of')} {row.maxAttempts}
              {row.bestScore !== null && row.bestScore !== undefined && (row.attemptNo ?? 1) > 1 ? ` · best ${row.bestScore}%` : ''}
            </div>
          )}
        </div>
      ),
    },
    ...((exam?.sections?.length ?? 0) > 0 ? [{
      key: 'sectionScores',
      header: 'Sections',
      cell: (row: CandidateResult) => (
        row.sectionScores && row.sectionScores.length > 0 ? (
          <ul className="space-y-0.5 text-[11px]">
            {row.sectionScores.map((sc) => (
              <li key={sc.id} className="flex justify-between gap-2">
                <span className="max-w-[8rem] truncate text-muted-foreground" title={sc.title}>{sc.title}</span>
                <span className="font-mono tabular-nums">{sc.percent !== null ? `${sc.percent}%` : '--'}</span>
              </li>
            ))}
          </ul>
        ) : <span className="text-xs text-muted-foreground">--</span>
      ),
    } as DataTableColumn<CandidateResult>] : []),
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (row: CandidateResult) => <OutcomeBadge status={row.outcome} />,
    },
    {
      key: 'released',
      header: 'Released',
      cell: (row: CandidateResult) => (
        row.released ? (
          <div>
            <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1"><CheckCheck className="w-3 h-3" /> {tx('assessForm.released')}</span>
            {row.certificate && (
              row.certificate.revokedAt
                ? <span className="text-[11px] text-destructive">{tx('assessForm.certificateRevoked')}</span>
                : <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Award className="w-3 h-3" /> {tx('assessForm.certificateIssued')}</span>
            )}
          </div>
        ) : row.status === 'completed' ? (
          <span className="text-muted-foreground text-xs">{tx('assessForm.pending')}</span>
        ) : null
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-1 justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={tx('assessForm.inviteActions')}
                disabled={resendingId === row.inviteId || deletingId === row.inviteId}
              >
                {resendingId === row.inviteId || deletingId === row.inviteId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <MoreHorizontal className="w-3.5 h-3.5" />
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {row.status === 'completed' && (
                <DropdownMenuItem onClick={() => openReview(row)} className="gap-2">
                  <Eye className="h-4 w-4" /> {tx('assessForm.review2')}
                </DropdownMenuItem>
              )}
              {(row.userId || row.status === 'completed') && (
                <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/assessments/${params.id}/recordings?user=${encodeURIComponent(row.userId || row.id)}`)} className="gap-2">
                  <Film className="h-4 w-4" /> {tx('assessForm.recordings')}
                </DropdownMenuItem>
              )}
              {row.status === 'completed' && row.graded === false && (
                <DropdownMenuItem disabled className="gap-2 text-amber-700 dark:text-amber-400">
                  <Clock className="h-4 w-4" /> {tx('assessForm.gradingPending')}
                </DropdownMenuItem>
              )}
              {row.status === 'completed' && row.graded && !row.released && (
                <DropdownMenuItem onClick={() => releaseScore(row.userId || row.id, row.name)} className="gap-2 text-green-600 dark:text-green-400 focus:text-green-600">
                  <Send className="h-4 w-4" /> {tx('assessForm.releaseScore')}
                </DropdownMenuItem>
              )}
              {row.status !== 'completed' && (
                <>
                  <DropdownMenuItem onClick={() => resendInvite(row.inviteId, row.name)} className="gap-2">
                    <Mail className="h-4 w-4" /> {tx('assessForm.resendInvite')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => sendReminder(row.inviteId, row.name)} className="gap-2">
                    <Bell className="h-4 w-4" /> {tx('assessForm.sendReminder')}
                  </DropdownMenuItem>
                </>
              )}
              {row.certificate && !row.certificate.revokedAt && row.userId && (
                <DropdownMenuItem
                  onClick={() => { setRevokeReason(''); setRevokeTarget({ certId: row.certificate!.id, userId: row.userId!, name: row.name }) }}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Award className="h-4 w-4" /> {tx('assessForm.revokeCertificate')}
                </DropdownMenuItem>
              )}
              {row.inviteToken && (
                <DropdownMenuItem onClick={() => copyInviteLink(row)} className="gap-2">
                  <Link className="h-4 w-4" /> {tx('assessForm.copyInviteLink')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmDeleteInvite({ id: row.inviteId, name: row.name })} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> {tx('assessForm.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="space-y-2">
          <SkeletonText lines={1} />
          <SkeletonText lines={2} />
        </div>
        <SkeletonStats />
        <SkeletonTable rows={5} />
      </div>
    )
  }

  if (!exam) return null

  const completedCount = results.filter(r => r.status === 'completed').length
  const unreleasedCount = results.filter(r => r.status === 'completed' && !r.released).length
  const pendingGradingCount = results.filter(r => r.status === 'completed' && r.graded === false).length

  const inProgressCount = results.filter(r => r.status === 'in_progress').length
  const pendingCount = results.filter(r => r.status === 'pending').length
  const flaggedCount = results.filter(r => r.proctoringFlags > 0 || r.identityReview).length

  const filteredResults = results.filter(r => {
    switch (resultFilter) {
      case 'completed': return r.status === 'completed'
      case 'in_progress': return r.status === 'in_progress'
      case 'pending': return r.status === 'pending'
      case 'ungraded': return r.status === 'completed' && r.graded === false
      case 'flagged': return r.proctoringFlags > 0 || r.identityReview === true
      default: return true
    }
  })

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-3">
        <button type="button" className="flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => router.push('/dashboard/admin/assessments')}>
          <ArrowLeft className="h-4 w-4" /> {tx('assessForm.backToAssessments')}
        </button>
        <PageHeader
          className="mb-0"
          title={<>Results: {exam.title}</>}
          description={tx('assessForm.reviewSubmissionsGradeOpenAnswersCheck')}
          icon={<CheckCheck />}
          actions={
            <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => router.push(`/dashboard/admin/assessments/${params.id}/recordings`)}>
              <Film className="h-4 w-4" /> {tx('assessForm.recordings')}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => router.push(`/dashboard/admin/assessments/${params.id}/integrity`)}>
              <ShieldAlert className="h-4 w-4" /> {tx('assessForm.integrity')}
            </Button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{exam.level}</Badge>
            <Badge variant="outline">{tx('assessForm.mins', { duration: exam.duration })}</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-primary">{tx('assessForm.submitted', { completedCount: completedCount })}</Badge>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">{tx('assessForm.invited2', { length: results.length })}</Badge>
            {(exam.publicLinkViews ?? 0) > 0 && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Link className="w-3 h-3 mr-1" />
                {exam.publicLinkViews} {tx('assessForm.publicLinkViews')}
              </Badge>
            )}
          {pendingGradingCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
              <Clock className="w-3.5 h-3.5" /> {pendingGradingCount} {tx('assessForm.awaitingGrading')}
            </Badge>
          )}
          {jevConfigured !== null && (
            <SecondOpinionHint
              text={jevConfigured
                ? 'A second AI model double-checks each AI grade on written and code answers. If it disagrees, the answer is flagged for a person to review.'
                : 'Not set up. Written and code answers are still graded by AI, but every one is flagged for a person to review.'}
            >
              <Badge
                variant="secondary"
                className={jevConfigured ? 'gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20' : 'gap-1 bg-muted text-muted-foreground'}
              >
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden /> {jevConfigured ? 'Second-opinion check on' : 'Second-opinion check off'}
              </Badge>
            </SecondOpinionHint>
          )}
          {exam?.plagiarismReport && (
            <Badge
              variant="secondary"
              title={`Checked ${fmtDateTime(exam.plagiarismReport.checked_at)} · ${exam.plagiarismReport.pairs} pair(s), ${exam.plagiarismReport.aiFlags} AI flag(s), ${exam.plagiarismReport.bankMatches} bank match(es)`}
              className={exam.plagiarismReport.score > 0 ? 'gap-1 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' : 'gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'}
            >
              <ShieldAlert className="w-3.5 h-3.5" /> {tx('assessForm.plagiarism')} {exam.plagiarismReport.score}/100
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingGradingCount > 0 && (
            <Button
              variant="outline"
              className="gap-2 text-primary border-primary/40 hover:bg-primary/10"
              onClick={() => gradeCandidates(results.filter(r => r.status === 'completed' && r.graded === false).map(r => r.userId || r.id))}
              disabled={!!bulkGradeIds}
            >
              {bulkGradeIds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {bulkGradeIds ? `Grading ${bulkGradeIds.length}…` : `Grade all pending (${pendingGradingCount})`}
            </Button>
          )}
          {unreleasedCount > 0 && (
            <Button
              variant="default"
              className="gap-2"
              onClick={openReleaseDialog}
              disabled={bulkReleasing}
            >
              {bulkReleasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {tx('assessForm.releaseAll')}{unreleasedCount})
            </Button>
          )}
          {exam?.issue_certificates !== false && results.some((r) => r.released) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={issueMissingCertificates}
              disabled={issuingCerts}
              title={tx('assessForm.issueCertificatesToReleasedCandidatesAt')}
            >
              {issuingCerts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              {tx('assessForm.issueMissingCertificates')}
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportProctorReport}
            disabled={exportingReport}
          >
            {exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {tx('assessForm.exportReport')}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={runPlagiarismCheck}
            disabled={plagRunning}
            title={tx('assessForm.crossSubmissionCopyDetectionAiAuthorship')}
          >
            {plagRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            {tx('assessForm.checkPlagiarism')}
          </Button>
          <Button variant="outline" className="gap-2" onClick={remindAllPending} disabled={bulkReminding}>
            {bulkReminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            {tx('assessForm.remindAllPending')}
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" /> {tx('assessForm.exportCsv')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          ['all', 'All invited', results.length, 'text-foreground', ''],
          ['pending', 'Invited', pendingCount, 'text-muted-foreground', ''],
          ['in_progress', 'In progress', inProgressCount, 'text-blue-600 dark:text-blue-400', ''],
          ['completed', 'Submitted', completedCount, 'text-green-700 dark:text-green-400', ''],
          ['ungraded', 'Awaiting grading', pendingGradingCount, 'text-amber-600 dark:text-amber-400', ''],
          ['flagged', 'Flagged for review', flaggedCount, 'text-red-600 dark:text-red-400', ''],
        ] as const).map(([key, label, count, color, _]) => (
          <button
            key={key}
            type="button"
            onClick={() => setResultFilter(key)}
            aria-pressed={resultFilter === key}
            className={`rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${resultFilter === key ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/70 bg-card hover:bg-muted/50'} ${count === 0 ? 'opacity-60' : ''}`}
          >
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      {/* Analytics — computed from rows already on screen, no extra calls
          except question-stats (graded answers only). Empty states hide. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScoreHistogram rows={results} />
        <StatusDonut rows={results} />
        {questionStats && questionStats.length > 0 && <QuestionBars stats={questionStats} />}
      </div>

      {resultFilter !== 'all' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{tx('assessForm.showingOfCandidates', { length: filteredResults.length, length2: results.length })}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setResultFilter('all')}>{tx('assessForm.showAll')}</Button>
        </div>
      )}

      {/* Invite recovery — only renders when stuck invites exist */}
      {!recoveryLoading && stuckInvites.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold">{tx('assessForm.inviteRecoveryStuck', { length: stuckInvites.length })}</h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => void resetInvites('all', 'all')}
              disabled={!!recovering}
            >
              {recovering === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {tx('assessForm.resetAllToPending')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx('assessForm.theseInvitesShowAsUsedBut')}
          </p>
          <div className="border rounded-md divide-y divide-border/40 max-h-56 overflow-y-auto bg-card">
            {stuckInvites.map((s) => (
              <div key={s.token} className="flex items-center gap-2 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.full_name || s.email.split('@')[0] || 'Candidate'}</p>
                  <p className="text-muted-foreground truncate">{s.email}</p>
                </div>
                {s.has_draft === true && (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400 shrink-0">{tx('assessForm.draftSaved')}</Badge>
                )}
                {s.has_draft === false && (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground shrink-0">{tx('assessForm.noDraft')}</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0"
                  onClick={() => void resetInvites([s.token], s.token)}
                  disabled={!!recovering}
                >
                  {recovering === s.token ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reset'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border rounded-lg p-1">
        <DataTable 
          data={filteredResults} 
          columns={columns} 
          searchKeys={['name', 'email']}
          searchPlaceholder="Search candidates..."
          bulkActions={[
            {
              label: 'Compare',
              variant: 'outline',
              icon: <Eye className="w-3.5 h-3.5 mr-1" />,
              onClick: async (rowIds) => {
                const uids = [...new Set(rowIds.map((id) => results.find((c) => c.id === id)).filter((r): r is CandidateResult => !!r && r.status === 'completed' && !!r.userId).map((r) => r.userId as string))]
                if (uids.length < 2 || uids.length > 4) {
                  addToast({ type: 'error', title: 'Select 2 to 4 candidates who submitted', message: `You selected ${uids.length} with a submission.` })
                  return
                }
                setCompareIds(uids)
              },
            },
            {
              label: 'Record outcome',
              variant: 'outline',
              icon: <Award className="w-3.5 h-3.5 mr-1" />,
              onClick: async (rowIds) => {
                const uids = [...new Set(rowIds.map((id) => results.find((c) => c.id === id)).filter((r): r is CandidateResult => !!r && r.status === 'completed' && !!r.userId).map((r) => r.userId as string))]
                if (uids.length === 0) {
                  addToast({ type: 'error', title: 'Select candidates who submitted this test' })
                  return
                }
                setOutcomeIds(uids)
              },
            },
            {
              label: bulkGradeIds ? `Grading ${bulkGradeIds.length}…` : 'Grade with AI',
              variant: 'default',
              icon: bulkGradeIds ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />,
              onClick: async (rowIds) => {
                const ids = rowIds.map(id => {
                  const r = results.find(c => c.id === id)
                  return r?.userId || r?.id || id
                })
                const gradeIds = ids.filter((uid, i, arr) => arr.indexOf(uid) === i)
                await gradeCandidates(gradeIds)
              },
            },
            {
              label: 'Release scores',
              variant: 'default',
              icon: <Send className="w-3.5 h-3.5 mr-1" />,
              onClick: async (ids) => {
                for (const id of ids) {
                  const r = results.find(c => c.id === id)
                  if (r && r.status === 'completed' && r.graded && !r.released) {
                    await releaseScore(r.userId || r.id, r.name)
                  }
                }
              },
            },
            {
              label: 'Send reminder',
              variant: 'outline',
              icon: <Bell className="w-3.5 h-3.5 mr-1" />,
              onClick: async (ids) => {
                for (const id of ids) {
                  const r = results.find(c => c.id === id)
                  if (r && r.status !== 'completed') {
                    await sendReminder(r.inviteId, r.name)
                  }
                }
              },
            },
          ]}
        />
      </div>

      {compareIds && exam && (
        <CompareCandidates
          examId={exam.id}
          userIds={compareIds}
          open={!!compareIds}
          onOpenChange={(o) => { if (!o) setCompareIds(null) }}
          onChanged={() => { void fetchData(true) }}
        />
      )}
      {outcomeIds && exam && (
        <OutcomeBulkDialog
          open={!!outcomeIds}
          onOpenChange={(o) => { if (!o) setOutcomeIds(null) }}
          examId={exam.id}
          userIds={outcomeIds}
          onSaved={() => { void fetchData(true) }}
        />
      )}

      {reviewCandidate && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background print-review-overlay overflow-hidden">
          {/* Header — sticky */}
          <div className="flex items-center justify-between border-b px-4 sm:px-6 py-3 sm:py-4 shrink-0 gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-base sm:text-lg truncate">Review: {reviewCandidate.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{reviewCandidate.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setReviewCandidate(null); setReviewData(null) }} className="gap-1.5 shrink-0">
              <X className="h-4 w-4" /> <span className="hidden sm:inline">{tx('assessForm.close')}</span>
            </Button>
          </div>

          {reviewLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> {tx('assessForm.loadingReviewData')}
            </div>
          ) : reviewData ? (
            <>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 print-review-body">
                  {/* Candidate Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm border rounded-lg p-4 bg-muted/30">
                    <div>
                      <span className="text-muted-foreground block text-xs">{tx('assessForm.score')}</span>
                      <span className="text-xl font-bold">{reviewData.submission.score}/{reviewData.submission.max_score}</span>
                      {reviewData.submission.has_pending_review && (
                        <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">{tx('assessForm.partialPendingReview')}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">{tx('assessForm.percentage')}</span>
                      <span className="text-xl font-bold">
                        {reviewData.submission.max_score > 0
                          ? `${Math.round((reviewData.submission.score / reviewData.submission.max_score) * 100)}%`
                          : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">{tx('assessForm.submitted2')}</span>
                      <span className="text-sm font-medium">
                        {reviewData.submission.submitted_at
                          ? fmtDateTime(reviewData.submission.submitted_at)
                          : '--'}
                      </span>
                      {reviewData.attempts && reviewData.attempts.max_attempts > 1 && (
                        <span className="block text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {tx('assessForm.attempt')} {reviewData.attempts.attempt_no} {tx('assessForm.of')} {reviewData.attempts.max_attempts}
                          {reviewData.attempts.best && reviewData.attempts.best.max_score > 0 && reviewData.attempts.attempt_no > 1
                            ? ` · best ${Math.round((reviewData.attempts.best.score / reviewData.attempts.best.max_score) * 100)}% (attempt ${reviewData.attempts.best.attempt_no})`
                            : ''}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">{tx('assessForm.timeUsed')}</span>
                      <span className="text-xl font-bold">
                        {reviewData.submission.total_time_ms
                          ? `${Math.floor(reviewData.submission.total_time_ms / 60000)}m ${Math.floor((reviewData.submission.total_time_ms % 60000) / 1000)}s`
                          : '--'}
                      </span>
                      {reviewData.submission.total_time_ms && reviewData.submission.total_time_ms < 60000 && (
                        <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">{tx('assessForm.veryFastSubmission')}</span>
                      )}
                    </div>
                  </div>

                  {reviewData.submission.section_scores && reviewData.submission.section_scores.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h4 className="mb-2 text-sm font-semibold">{tx('assessForm.scoreBySection')}</h4>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {reviewData.submission.section_scores.map((sc) => (
                          <div key={sc.id} className="rounded-lg border bg-muted/30 p-3">
                            <p className="truncate text-xs text-muted-foreground" title={sc.title}>{sc.title}</p>
                            <p className="text-lg font-bold tabular-nums">{sc.percent !== null ? `${sc.percent}%` : '--'}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{tx('assessForm.points', { score: sc.score, max: sc.max })}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(reviewCandidate.userId || reviewCandidate.id) && exam && (
                    <HiringOutcomePanel
                      key={`${reviewCandidate.userId || reviewCandidate.id}:${reviewData.outcome?.history?.length ?? 0}:${reviewData.outcome?.status ?? ''}`}
                      examId={exam.id}
                      userId={reviewCandidate.userId || reviewCandidate.id}
                      outcome={reviewData.outcome ?? null}
                      onSaved={async () => {
                        const uid = reviewCandidate.userId || reviewCandidate.id
                        const res = await fetch(`/api/admin/exams/${params.id}/submissions/${uid}`, { credentials: 'include' })
                        const json = await res.json().catch(() => null)
                        if (res.ok && json?.submission) setReviewData((prev) => (prev ? { ...prev, outcome: json.outcome ?? null } : prev))
                        void fetchData(true)
                      }}
                    />
                  )}

                  {/* Answer Review */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" /> {tx('assessForm.answerReview')}
                      {reviewData.submission.has_pending_review && (
                        <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                          <Clock className="w-3 h-3 mr-1" /> {tx('assessForm.pendingManualGrading')}
                        </Badge>
                      )}
                    </h4>
                    {(() => {
                      const pendingIdx = reviewData.questions
                        .map((q, i) => (reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)?.pending_review === true ? i + 1 : null))
                        .filter((n): n is number => n !== null)
                      if (pendingIdx.length === 0) return null
                      return (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                          <p className="font-semibold">
                            {pendingIdx.length} {tx('assessForm.question')}{pendingIdx.length === 1 ? '' : 's'} {tx('assessForm.needReviewBeforeThisScoreCan')}
                          </p>
                          <p className="break-words">
                            {pendingIdx.map((n) => `Q${n}`).join(', ')}
                          </p>
                          <p className="text-amber-700/80 dark:text-amber-300/80">
                            {tx('assessForm.scrollToTheHighlightedRowsSet')} <strong>{tx('assessForm.saveManualGrades')}</strong> {tx('assessForm.thatClearsThem')}
                          </p>
                        </div>
                      )
                    })()}
                    <TraitScoresPanel questions={reviewData.questions as Array<Record<string, unknown>>} answers={reviewData.submission.answers} />
                    {reviewData.questions.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">{tx('assessForm.noQuestionsFound')}</p>
                    ) : (
                      reviewData.questions.map((q, i) => {
                        const detail = reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)
                        const userAnswer = reviewData.submission.answers[q.id] || ''
                        // Coding answers are stored as {"language":"...","code":"..."} —
                        // parse once so the UI shows code, not the JSON envelope.
                        const parsedCoding = isCodingType(q.type) ? parseCodingAnswer(userAnswer) : null
                        const showStructuredCode = !!parsedCoding?.isStructured
                        const isMcq = ['multiple-choice', 'mcq', 'true_false', 'multiple_response'].includes(q.type)
                        const isPendingReview = detail?.pending_review === true
                        const isManuallyGraded = detail?.awarded !== undefined && !isPendingReview
                        const modelAnswer = q.answer || q.correct_answer || ''
                        const maxPoints = q.points || q.score || detail?.points || 10
                        const timeSpent = reviewData.submission.question_timings?.[q.id] || 0
                        const isSuspiciouslyFast = timeSpent > 0 && timeSpent < 3000
                        const totalTimeMs = reviewData.submission.total_time_ms || 0
                        const isSuspiciouslySlow = timeSpent > 0 && totalTimeMs > 0 && timeSpent > totalTimeMs * 0.5

                        return (
                          <div key={q.id} className={`border rounded-lg p-3 sm:p-4 space-y-2 ${isPendingReview ? 'border-amber-500/40 bg-amber-500/5' : ''} ${isSuspiciouslyFast ? 'border-red-500/40 bg-red-500/5' : ''}`}>
                            <div className="flex items-start justify-between gap-2 sm:gap-4">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-muted-foreground">Q{i + 1}. {q.type}</span>
                                <div className="text-sm font-medium mt-0.5 prose prose-sm dark:prose-invert max-w-full overflow-hidden prose-p:text-sm prose-pre:text-xs prose-code:text-xs">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                  >
                                    {q.prompt || q.question || q.title || ''}
                                  </ReactMarkdown>
                                </div>
                              </div>
                              {/* Timing display */}
                              {timeSpent > 0 && (
                                <div className="flex items-center gap-1 text-xs shrink-0">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className={isSuspiciouslyFast ? 'text-red-600 dark:text-red-400 font-semibold' : isSuspiciouslySlow ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}>
                                    {timeSpent < 1000 ? `${timeSpent}ms` : `${(timeSpent / 1000).toFixed(1)}s`}
                                  </span>
                                  {isSuspiciouslyFast && (
                                    <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10 ml-1">{tx('assessForm.fast')}</Badge>
                                  )}
                                  {isSuspiciouslySlow && (
                                    <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 ml-1">{tx('assessForm.slow')}</Badge>
                                  )}
                                </div>
                              )}
                              {isPendingReview ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  {detail?.requires_human_review && (
                                    <Badge variant="outline" className="text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30 shrink-0">
                                      <AlertTriangle className="w-3 h-3 mr-1" /> {tx('assessForm.aiUncertain')}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 shrink-0">
                                    <Clock className="w-3 h-3 mr-1" /> {tx('assessForm.pending')}
                                  </Badge>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {detail?.requires_human_review && (
                                    <Badge variant="outline" className="text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30 shrink-0" title={tx('assessForm.theAiWasNotConfidentAbout')}>
                                      <AlertTriangle className="w-3 h-3 mr-1" /> {tx('assessForm.reviewRecommended')}
                                    </Badge>
                                  )}
                                  {detail?.jev_agree !== undefined && detail?.jev_agree !== null && (
                                    <SecondOpinionHint
                                      text={detail.jev_agree
                                        ? 'A second AI model checked this grade and agrees with it.'
                                        : 'A second AI model checked this grade and disagrees. Check this answer yourself before relying on the score.'}
                                    >
                                      <Badge
                                        variant="outline"
                                        className={detail.jev_agree ? 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30 shrink-0' : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30 shrink-0'}
                                      >
                                        <ShieldAlert className="w-3 h-3 mr-1" aria-hidden /> {tx('assessForm.secondOpinion')} {detail.jev_agree ? 'agrees' : 'disagrees'}{detail.jev_confidence !== undefined && detail.jev_confidence !== null ? ` (${Math.round(detail.jev_confidence * 100)}% sure)` : ''}
                                      </Badge>
                                    </SecondOpinionHint>
                                  )}
                                  <Badge variant={detail?.correct ? 'default' : 'secondary'} className={`shrink-0 ${detail?.correct ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30' : 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30'}`}>
                                    {isManuallyGraded ? `+${detail.awarded}/${maxPoints}` : detail?.correct ? `+${detail.points}` : '0'}
                                  </Badge>
                                </div>
                              )}
                            </div>

                            {/* MCQ-type options display */}
                            {isMcq && q.options && (
                              <div className="flex flex-col items-start gap-1.5 mt-1 w-full">
                                {q.options.map((opt, oi) => {
                                  const optLower = opt.toLowerCase()
                                  // multiple_response stores a comma-separated set; compare as sets
                                  const userSet = q.type === 'multiple_response'
                                    ? userAnswer.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                                    : [userAnswer.toLowerCase()]
                                  const correctAns = q.correct_answer || q.answer || ''
                                  const correctSet = q.type === 'multiple_response'
                                    ? correctAns.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                                    : [correctAns.toLowerCase()]
                                  const isSelected = userSet.includes(optLower)
                                  const isCorrectAnswer = correctSet.includes(optLower)
                                  const optClass = isSelected && isCorrectAnswer
                                    ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/40'
                                    : isSelected && !isCorrectAnswer
                                      ? 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40 line-through'
                                      : !isSelected && isCorrectAnswer
                                        ? 'bg-green-500/10 text-green-600/70 dark:text-green-400/70 border-green-500/20'
                                        : 'text-muted-foreground'
                                  return (
                                    <div
                                      key={oi}
                                      className={`text-xs rounded-md border px-2.5 py-1 wrap-break-word whitespace-pre-wrap w-full text-left ${optClass}`}
                                    >
                                      {opt}
                                      {isSelected ? ' (selected)' : ''}
                                      {!isSelected && isCorrectAnswer ? ' (correct)' : ''}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Non-MCQ: show candidate answer + model answer side by side */}
                            {!isMcq && (
                              <div className="mt-2 space-y-2">
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground block mb-1">{tx('assessForm.candidateSAnswer')}</span>
                                  {userAnswer ? (
                                    hasExtendedView(q.type) ? (
                                      <ExtendedAnswerView question={q as never} answer={userAnswer} examId={String(params.id)} files={answerFiles} />
                                    ) : showStructuredCode ? (
                                      <div className="space-y-1.5">
                                        <Badge variant="outline" className="text-[10px] font-mono">{parsedCoding?.language || 'code'}</Badge>
                                        <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto border wrap-break-word">{parsedCoding?.code || '(empty code)'}</pre>
                                      </div>
                                    ) : (
                                      <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto border wrap-break-word">{userAnswer}</pre>
                                    )
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">{tx('assessForm.noAnswerProvided')}</span>
                                  )}
                                </div>
                                {q.type === 'cad' && reviewData.cad && (
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-medium text-muted-foreground block">{tx('assessForm.uploadedFiles')}</span>
                                    {reviewData.cad.files.length === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">{tx('assessForm.noFilesWereUploadedTimeRan')}</span>
                                    ) : (
                                      <ul className="space-y-1">
                                        {reviewData.cad.files.map((f) => (
                                          <li key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
                                            <a
                                              href={`/api/exams/${params.id}/cad-submission/files/${f.id}`}
                                              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                              download
                                            >
                                              <Download className="w-3.5 h-3.5" aria-hidden /> {f.name}
                                            </a>
                                            <span className="text-muted-foreground tabular-nums">
                                              {f.kind === 'step' ? 'STEP export' : 'Native file'} · {f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                                            </span>
                                            {f.scan_status === 'unscanned' && (
                                              <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">{tx('assessForm.notVirusScanned')}</Badge>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                                {modelAnswer && (
                                  <div>
                                    <span className="text-xs font-medium text-green-600 dark:text-green-400 block mb-1">{tx('assessForm.modelAnswerRubric2')}</span>
                                    <pre className="text-xs font-mono bg-green-500/5 border border-green-500/20 text-green-700 dark:text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto wrap-break-word">{modelAnswer}</pre>
                                  </div>
                                )}

                                {/* Manual grading input for pending review questions */}
                                {(isPendingReview || isManuallyGraded) && (
                                  <div className="pt-3 border-t border-dashed space-y-3">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                      <label className="text-xs font-medium text-muted-foreground shrink-0">{tx('assessForm.awardPoints')}</label>
                                      <input aria-label={tx('assessForm.awardPoints2')}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={manualGrades[q.id] ?? detail?.awarded ?? (isPendingReview && !userAnswer ? 0 : '')}
                                        onChange={(e) => {
                                          const v = e.target.value.replace(/[^0-9]/g, '')
                                          const num = v === '' ? 0 : Math.min(maxPoints, Math.max(0, parseInt(v) || 0))
                                          setManualGrades(prev => ({ ...prev, [q.id]: num }))
                                        }}
                                        className="w-16 sm:w-20 h-8 px-2 text-sm border rounded-md bg-background"
                                        placeholder="0"
                                      />
                                      <span className="text-xs text-muted-foreground">/ {maxPoints}</span>
                                      {q.type !== 'cad' && <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 text-xs h-8"
                                        onClick={() => aiGradeQuestion(q.id)}
                                        disabled={aiGrading[q.id]}
                                      >
                                        {aiGrading[q.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        {aiGrading[q.id] ? 'Grading…' : 'AI Grade'}
                                      </Button>}
                                    </div>

                                    {aiFeedback[q.id] && (
                                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                          <Sparkles className="w-3.5 h-3.5" /> {tx('assessForm.aiFeedbackReviewEditBeforeSaving')}
                                          {detail?.confidence !== undefined && (
                                            <span className="ml-2 font-normal opacity-80">
                                              (Confidence: {Math.round(detail.confidence * 100)}%)
                                            </span>
                                          )}
                                          {detail?.graded_by && (
                                            <span className="ml-2 font-normal opacity-80" title={tx('assessForm.llmThatProducedThisGrade')}>
                                              · {detail.graded_by}
                                            </span>
                                          )}
                                        </span>
                                        <textarea
                                          value={aiFeedback[q.id]}
                                          onChange={(e) => setAiFeedback(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          className="w-full min-h-20 px-3 py-2 text-xs border rounded-md bg-background"
                                          placeholder={tx('assessForm.feedbackShownToTheCandidateOn')}
                                        />
                                      </div>
                                    )}

                                    {/* Persisted remarks shown to candidate on release */}
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5" /> {tx('assessForm.remarksFeedbackForCandidate')}
                                      </label>
                                      <textarea aria-label={tx('assessForm.remarksFeedbackForCandidate')}
                                        value={remarks[q.id] ?? detail?.remarks ?? (detail?.awarded !== undefined ? aiFeedback[q.id] ?? '' : '')}
                                        onChange={(e) => setRemarks(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        className="w-full min-h-16 px-3 py-2 text-xs border rounded-md bg-background"
                                        placeholder={tx('assessForm.whereTheyWentWrongWhatS')}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                    {/* AI Grade All + Save Grades buttons */}
                    <div className="space-y-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 text-blue-600 border-blue-500/40 hover:bg-blue-500/10 dark:text-blue-400"
                        onClick={aiGradeAll}
                        disabled={bulkGrading.running || reviewData.questions.length === 0}
                      >
                        {bulkGrading.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {bulkGrading.running
                          ? `Grading… ${bulkGrading.done}/${bulkGrading.total}`
                          : bulkGrading.failed.length > 0
                            ? `Grade all (${bulkGrading.total - bulkGrading.failed.length}/${bulkGrading.total} graded)`
                            : 'Grade all with AI'}
                      </Button>
                      {bulkGrading.running && (
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${bulkGrading.total > 0 ? (bulkGrading.done / bulkGrading.total) * 100 : 0}%` }} />
                        </div>
                      )}
                      {Object.keys(manualGrades).length > 0 && (
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          onClick={saveGradesWithAudit}
                          disabled={savingGrades}
                        >
                          {savingGrades ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {tx('assessForm.saveManualGrades')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Proctoring Events */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setShowProctorLog(v => !v)}
                        className="flex items-center gap-2 font-semibold text-sm text-left flex-1 min-w-0"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" /> <span className="truncate">{tx('assessForm.proctoringLog')}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{tx('assessForm.events', { length: reviewData.proctorEvents.length })}</Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRawProctorMeta(v => !v)}
                        title={tx('assessForm.toggleRawJsonDetails')}
                        className={`text-[11px] px-2 py-0.5 rounded-md border font-medium shrink-0 transition-colors ${showRawProctorMeta ? 'border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {tx('assessForm.rawJson')}
                      </button>
                      <ChevronDown
                        onClick={() => setShowProctorLog(v => !v)}
                        className={`w-4 h-4 text-muted-foreground shrink-0 cursor-pointer transition-transform ${showProctorLog ? '' : '-rotate-90'}`}
                      />
                    </div>
                    {showProctorLog && (
                      <>
                        {(() => {
                          const allEvents = reviewData.proctorEvents
                          const highRisk = allEvents.filter(e => PROCTOR_RISK_HIGH.has(e.event_type))
                          const warnRisk = allEvents.filter(e => PROCTOR_RISK_WARN.has(e.event_type))
                          const infoRisk = allEvents.filter(e => PROCTOR_RISK_INFO.has(e.event_type))
                          
                          const tabSwitches = allEvents.filter(e => ['tab_blur', 'visibility_change', 'alt_tab_detected', 'window_blur'].includes(e.event_type)).length
                          const copyPaste = allEvents.filter(e => ['copy', 'paste', 'clipboard_copy', 'clipboard_paste', 'copy_paste_attempt'].includes(e.event_type)).length
                          const aiProxy = allEvents.filter(e => ['prohibited_app_detected', 'remote_desktop_detected', 'screen_share_started'].includes(e.event_type)).length
                          const hwAnomalies = allEvents.filter(e => ['usb_device_plugged', 'secondary_voice_detected', 'face_match_mismatch', 'browser_fingerprint_changed'].includes(e.event_type)).length

                          const filteredEvents = allEvents.filter(e => {
                            if (proctorFilter === 'high') return PROCTOR_RISK_HIGH.has(e.event_type)
                            if (proctorFilter === 'warn') return PROCTOR_RISK_WARN.has(e.event_type)
                            if (proctorFilter === 'info') return PROCTOR_RISK_INFO.has(e.event_type)
                            return true
                          })
                          
                          return (
                            <div className="space-y-3">
                              {allEvents.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  <button
                                    type="button"
                                    aria-pressed={proctorFilter === 'all'}
                                    onClick={() => setProctorFilter('all')}
                                    className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${proctorFilter === 'all' ? 'bg-muted border-foreground/30' : 'bg-card hover:bg-muted/50'}`}
                                  >
                                    <span className="block text-lg font-bold tabular-nums">{allEvents.length}</span>
                                    <span className="block text-[11px] text-muted-foreground font-medium">{tx('assessForm.total')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={proctorFilter === 'high'}
                                    onClick={() => setProctorFilter('high')}
                                    className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${proctorFilter === 'high' ? 'bg-red-500/10 border-red-500/40' : 'bg-card hover:bg-red-500/5'}`}
                                  >
                                    <span className="block text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{highRisk.length}</span>
                                    <span className="block text-[11px] text-red-600/80 dark:text-red-400/80 font-medium">{tx('assessForm.highRisk')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={proctorFilter === 'warn'}
                                    onClick={() => setProctorFilter('warn')}
                                    className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${proctorFilter === 'warn' ? 'bg-amber-500/10 border-amber-500/40' : 'bg-card hover:bg-amber-500/5'}`}
                                  >
                                    <span className="block text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{warnRisk.length}</span>
                                    <span className="block text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium">{tx('assessForm.warnings')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={proctorFilter === 'info'}
                                    onClick={() => setProctorFilter('info')}
                                    className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${proctorFilter === 'info' ? 'bg-primary/10 border-primary/40' : 'bg-card hover:bg-primary/5'}`}
                                  >
                                    <span className="block text-lg font-bold tabular-nums text-primary">{infoRisk.length}</span>
                                    <span className="block text-[11px] text-primary/80 font-medium">{tx('assessForm.info')}</span>
                                  </button>
                                </div>
                              )}

                              {allEvents.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 mt-2">
                                  <div className="flex flex-col p-2 rounded-lg bg-card border border-border/40">
                                    <div className="text-sm font-bold text-foreground">{tabSwitches}</div>
                                    <div className="text-[10px] text-muted-foreground font-medium">{tx('assessForm.tabSwitches')}</div>
                                  </div>
                                  <div className="flex flex-col p-2 rounded-lg bg-card border border-border/40">
                                    <div className="text-sm font-bold text-foreground">{copyPaste}</div>
                                    <div className="text-[10px] text-muted-foreground font-medium">Copy/Paste</div>
                                  </div>
                                  <div className="flex flex-col p-2 rounded-lg bg-card border border-border/40">
                                    <div className="text-sm font-bold text-foreground">{aiProxy}</div>
                                    <div className="text-[10px] text-muted-foreground font-medium">{tx('assessForm.aiProxies')}</div>
                                  </div>
                                  <div className="flex flex-col p-2 rounded-lg bg-card border border-border/40">
                                    <div className="text-sm font-bold text-foreground">{hwAnomalies}</div>
                                    <div className="text-[10px] text-muted-foreground font-medium">{tx('assessForm.anomalies')}</div>
                                  </div>
                                </div>
                              )}

                              {allEvents.length === 0 ? (
                                <div className="border rounded-lg p-6 text-center">
                                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
                                  <p className="text-sm text-muted-foreground">{tx('assessForm.noProctoringViolationsDetected')}</p>
                                </div>
                              ) : filteredEvents.length === 0 ? (
                                <EmptyState variant="search" title={tx('assessForm.noEventsMatchTheSelectedFilter')} description={tx('assessForm.chooseAnotherEventTypeToSee')} className="py-6 md:py-8" />
                              ) : (
                                <div className="border rounded-lg max-h-96 overflow-y-auto overflow-x-hidden bg-card">
                                  {filteredEvents.map((evt, i) => (
                                    <div key={i} className={`border-b last:border-b-0 ${proctorColor(evt.event_type)}`}>
                                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 text-xs">
                                        <span className="shrink-0">{PROCTOR_ICONS[evt.event_type] || <AlertTriangle className="w-3 h-3" />}</span>
                                        <span className="shrink-0 font-medium truncate">{formatProctorType(evt.event_type)}</span>
                                        <span className="text-muted-foreground ml-auto shrink-0 text-[10px] sm:text-xs">
                                          {evt.created_at ? fmtDateTime(evt.created_at) : ''}
                                        </span>
                                      </div>
                                      {evt.meta && Object.keys(evt.meta).length > 0 && (
                                        showRawProctorMeta ? (
                                          <pre className="px-4 pb-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap wrap-break-word border-t border-muted/50">
                                            {JSON.stringify(evt.meta, null, 2)}
                                          </pre>
                                        ) : (
                                          <ProctorMetaDetails event_type={evt.event_type} meta={evt.meta} />
                                        )
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )}
                  </div>

                  {/* Identity check: no-camera flag + advisory face match */}
                  {reviewData.submission.identity_check?.needs_manual_review && (
                    <div role="note" className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                      <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <div className="space-y-0.5">
                        <p className="font-semibold">{NO_CAMERA_REVIEW_LABEL}</p>
                        <p className="text-xs">
                          {reviewData.submission.identity_check.no_camera_reason === 'permission_denied'
                            ? 'Camera access was blocked in the candidate’s browser.'
                            : reviewData.submission.identity_check.no_camera_reason === 'error'
                              ? 'The candidate said their camera wasn’t working.'
                              : 'No camera was found on the candidate’s device.'}
                          {' '}{tx('assessForm.theyUploadedAPhotoOfTheir')}
                          {reviewData.submission.identity_check.upload_scan_status === 'unscanned' ? ' The virus scanner was unavailable when it was uploaded.' : ''}
                        </p>
                      </div>
                    </div>
                  )}
                  {reviewData.submission.identity_check?.face_match && (
                    <p className="text-xs text-muted-foreground">
                      {reviewData.submission.identity_check.face_match.status === 'compared' && typeof reviewData.submission.identity_check.face_match.similarity === 'number'
                        ? <>{tx('assessForm.faceMatchAdvisoryComputedInThe')} <span className="font-medium tabular-nums text-foreground">{Math.round(reviewData.submission.identity_check.face_match.similarity * 100)}%</span> — {reviewData.submission.identity_check.face_match.likely_match ? 'likely the same person' : 'may be a different person, compare the photos'}{tx('assessForm.neverUsedToAcceptOrReject')}</>
                        : reviewData.submission.identity_check.face_match.status === 'no_face_in_id'
                          ? 'Face match: no face found on the ID photo. Compare the photos by eye.'
                          : reviewData.submission.identity_check.face_match.status === 'no_face_in_selfie'
                            ? 'Face match: no face found in the selfie. Compare the photos by eye.'
                            : 'Face match: couldn’t be computed on the candidate’s device. Compare the photos by eye.'}
                    </p>
                  )}
                  {/* Identity Photos */}
                  {(reviewData.submission.id_photo || reviewData.submission.face_photo) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">{tx('assessForm.idPhoto')}</span>
                        <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                          {reviewData.submission.id_photo ? (
                            <img src={reviewData.submission.id_photo} alt="ID" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-muted-foreground">{tx('assessForm.notCaptured')}</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">{tx('assessForm.facePhoto')}</span>
                        <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                          {reviewData.submission.face_photo ? (
                            <img src={reviewData.submission.face_photo} alt={tx('assessForm.face')} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-muted-foreground">{tx('assessForm.notCaptured')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer — sticky */}
                <div className="shrink-0 border-t px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-background">
                  <div className="text-xs text-muted-foreground min-w-0">
                    {reviewData.submission.released_at ? (
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{tx('assessForm.scoreReleasedOn', { fmtDateTime: fmtDateTime(reviewData.submission.released_at) })}</span>
                      </span>
                    ) : (
                      'Score not yet released to candidate'
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
                    <Button variant="outline" onClick={downloadReviewPdf} className="gap-2">
                      <Download className="w-4 h-4" /> {tx('assessForm.downloadReport')}
                    </Button>
                    <Button variant="outline" onClick={() => { setReviewCandidate(null); setReviewData(null) }}>
                      {tx('assessForm.close')}
                    </Button>
                    {!reviewData.submission.released_at && (
                      <Button
                        className="gap-2"
                        onClick={() => releaseScore(reviewCandidate.userId || reviewCandidate.id, reviewCandidate.name)}
                        disabled={releasing === (reviewCandidate.userId || reviewCandidate.id)}
                      >
                        {releasing === (reviewCandidate.userId || reviewCandidate.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {tx('assessForm.releaseScore')}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                {tx('assessForm.noSubmissionDataFoundForThis')}
              </div>
            )}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteInvite} onOpenChange={(open) => !open && setConfirmDeleteInvite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('assessForm.withdrawInvite')}</AlertDialogTitle>
            <AlertDialogDescription>{tx('assessForm.sInviteLinkWillStopWorking', { name: confirmDeleteInvite?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx('assessForm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                if (confirmDeleteInvite) {
                  const { id, name } = confirmDeleteInvite
                  setConfirmDeleteInvite(null)
                  await deleteInvite(id, name)
                }
              }}
            >
              {tx('assessForm.withdraw')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open && !revoking) setRevokeTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tx('assessForm.revokeCertificate2')}</DialogTitle>
            <DialogDescription>{tx('assessForm.sCertificateWillShowAsRevoked', { name: revokeTarget?.name })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="revoke-reason" className="text-sm font-medium">{tx('assessForm.reason')}</label>
            <textarea
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={tx('assessForm.forExampleIdentityCouldNotBe')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{tx('assessForm.keptInTheAuditLogNot')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>{tx('assessForm.cancel')}</Button>
            <Button variant="destructive" onClick={() => void revokeCertificate()} disabled={revoking || revokeReason.trim().length < 5} className="gap-2">
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />} {tx('assessForm.revokeCertificate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk grading progress — chunked batches with live counts so a
          minutes-long grade never looks stuck, plus cancel + retry remainder. */}
      <Dialog open={!!gradeProg} onOpenChange={(open) => { if (!open && !gradeProg?.running) setGradeProg(null) }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (gradeProg?.running) e.preventDefault() }}>
          <DialogHeader>
            <DialogTitle>{gradeProg?.running ? 'Grading in progress…' : 'Grading finished'}</DialogTitle>
            <DialogDescription>
              {gradeProg?.running
                ? `Candidate ${Math.min(gradeProg.done + 1, gradeProg.total)} of ${gradeProg.total} — grades save as each batch completes, so stopping loses nothing.`
                : `${gradeProg?.graded} question(s) graded, ${gradeProg?.failed} failed. Re-run grades only the remainder.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Progress value={gradeProg && gradeProg.total > 0 ? Math.round((gradeProg.done / gradeProg.total) * 100) : 0} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tx('assessForm.candidates', { done: gradeProg?.done, total: gradeProg?.total })}</span>
              <span>{gradeProg?.graded} {tx('assessForm.graded2')}{gradeProg && gradeProg.failed > 0 ? ` · ${gradeProg.failed} failed` : ''}</span>
            </div>
          </div>
          {gradeProg && gradeProg.items.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y divide-border/40">
              {gradeProg.items.map((it) => (
                <div key={it.id} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                  {it.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />}
                  {it.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
                  {it.status === 'grading' && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0 mt-0.5" />}
                  {it.status === 'pending' && <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{it.name}</p>
                    <p className="text-muted-foreground break-words">{it.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            {gradeProg?.running ? (
              <Button variant="outline" onClick={() => { gradeCancelRef.current = true }}>
                {tx('assessForm.stopAfterThisBatch')}
              </Button>
            ) : (
              <Button onClick={() => setGradeProg(null)}>{tx('assessForm.close')}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* On-demand plagiarism report — deterministic pairs + AI flags. */}
      <Dialog open={plagOpen} onOpenChange={setPlagOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tx('assessForm.plagiarismCheck')}</DialogTitle>
            <DialogDescription>
              {plagRunning
                ? 'Comparing answers across submissions (exact matches instantly, AI semantic checks take longer)…'
                : plagResult
                  ? `Risk score ${plagResult.score}/100 · ${plagResult.suspiciousPairs.length} suspicious pair(s) · ${plagResult.aiGeneratedFlags.length} AI-authorship flag(s)`
                  : 'No result.'}
            </DialogDescription>
          </DialogHeader>
          {plagRunning && (
            <div className="space-y-2 py-4">
              <Progress value={undefined} />
              <p className="text-xs text-muted-foreground text-center">{tx('assessForm.runningSafeToWaitClosingKeeps')}</p>
            </div>
          )}
          {plagResult && !plagRunning && (
            <div className="space-y-4 py-2">
              {plagResult.suspiciousPairs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{tx('assessForm.suspiciousPairs')}</p>
                  <div className="max-h-56 overflow-y-auto rounded-md border divide-y divide-border/40">
                    {plagResult.suspiciousPairs.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="font-medium truncate">{p.name1} ↔ {p.name2}</span>
                        <span className="ml-auto font-mono shrink-0">{Math.round(p.similarity * 100)}%{p.bothCorrect ? ' · both correct' : ''}{p.aiSemanticMatch ? ` · AI ${p.aiConfidence}%` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {plagResult.aiGeneratedFlags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{tx('assessForm.possibleAiWrittenAnswers')}</p>
                  <div className="max-h-44 overflow-y-auto rounded-md border divide-y divide-border/40">
                    {plagResult.aiGeneratedFlags.map((f, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs">
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground"> · {Math.round(f.probability)}% — {f.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {plagResult.questionBankMatches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">{tx('assessForm.matchesAgainstQuestionBankAnswers')}</p>
                  <div className="max-h-44 overflow-y-auto rounded-md border divide-y divide-border/40">
                    {plagResult.questionBankMatches.map((m, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-muted-foreground">{' '}{tx('assessForm.match', { matchType: m.matchType })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {plagResult.suspiciousPairs.length === 0 && plagResult.aiGeneratedFlags.length === 0 && plagResult.questionBankMatches.length === 0 && (
                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {tx('assessForm.noCopyOrAiAuthorshipSignals')}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlagOpen(false)}>{tx('assessForm.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showReleaseAllConfirm} onOpenChange={setShowReleaseAllConfirm}>
        <AlertDialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{tx('assessForm.releaseScoresWithCutoff')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx('assessForm.everyoneGradedGetsTheirScoreCandidates')}
              {blockedPreviewCount > 0 ? ` ${blockedPreviewCount} ungraded submission(s) stay locked.` : ''} {tx('assessForm.thisCannotBeUndone')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <label htmlFor="release-cutoff" className="text-sm font-medium whitespace-nowrap">{tx('assessForm.cutoff')}</label>
              <input
                id="release-cutoff"
                type="number"
                min={0}
                max={100}
                value={releaseCutoff}
                disabled={bulkReleasing || releaseResult !== null}
                onChange={(e) => setReleaseCutoff(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm"
              />
              <div className="flex gap-2 text-xs">
                <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">{tx('assessForm.pass', { length: passPreview.length })}</Badge>
                <Badge variant="secondary" className="bg-red-500/10 text-red-600 dark:text-red-400">{tx('assessForm.below', { length: failPreview.length })}</Badge>
                <Badge variant="secondary">{tx('assessForm.releasing', { length: releasablePreview.length })}</Badge>
              </div>
            </div>
            {passPreview.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-md border divide-y divide-border/40">
                {passPreview.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="font-medium truncate">{r.name}</span>
                    <span className="text-muted-foreground truncate ml-auto">{r.email}</span>
                    <span className="font-mono font-semibold">{r.score}%</span>
                  </div>
                ))}
              </div>
            )}
            {releaseResult && (
              <div className="space-y-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {tx('assessForm.released')} {releaseResult.released} {tx('assessForm.at')} {releaseResult.cutoff}% — {releaseResult.passed} {tx('assessForm.passed')} {releaseResult.failed} {tx('assessForm.belowCutoff')}
                  {releaseResult.skipped_pending > 0 ? `, ${releaseResult.skipped_pending} still locked (ungraded)` : ''}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-2" onClick={exportPassPdf} disabled={exportingPdf}>
                    {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {tx('assessForm.exportPassListPdf')}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={advanceTarget}
                    onChange={(e) => setAdvanceTarget(e.target.value)}
                    className="h-9 flex-1 min-w-40 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="">{tx('assessForm.advancePassersTo')}</option>
                    {examsList.map((e) => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </select>
                  <Button size="sm" className="gap-2" onClick={advancePassers} disabled={advancing || !advanceTarget}>
                    {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {tx('assessForm.advance')}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkReleasing}>{tx('assessForm.close')}</AlertDialogCancel>
            {!releaseResult && (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void releaseAllWithAudit() }}
                disabled={bulkReleasing || releasablePreview.length === 0}
              >
                {bulkReleasing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {tx('assessForm.release')} {releasablePreview.length}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Keyboard-reachable tooltip explaining the second-opinion grade check. */
function SecondOpinionHint({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="max-w-64 text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
