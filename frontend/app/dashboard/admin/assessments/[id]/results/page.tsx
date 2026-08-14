'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Loader2, ArrowLeft, Download, ShieldAlert, CheckCircle2, User, Eye, X, AlertTriangle, Copy, Minimize2, Maximize2, Send, CheckCheck, MoreHorizontal, Link, Mail, Trash2, Clock, XCircle, Bell, Sparkles, MessageSquare, ChevronDown, Camera, Fingerprint, Keyboard } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn, BulkAction } from '@/components/ui/data-table'
import { csrfFetch } from '@/lib/csrf-fetch'
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


interface CandidateResult {
  id: string
  inviteId: string
  name: string
  email: string
  status: string
  score: number | null
  maxScore: number | null
  submittedAt: string | null
  proctoringFlags: number
  idPhoto?: string | null
  facePhoto?: string | null
  userId?: string
  released?: boolean
  deliveryStatus?: string | null
  graded?: boolean
  source?: string
}

interface Exam {
  id: string
  title: string
  level: string
  duration: number
  publicLinkViews?: number
}

interface QuestionDetail {
  qId: string
  correct: boolean
  points: number
  answer: string
  pending_review?: boolean
  awarded?: number
  remarks?: string
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
  }
  proctorEvents: Array<{ event_type: string; meta: Record<string, unknown>; created_at: string }>
  candidate: { name: string; email: string }
}

const PROCTOR_LABELS: Record<string, string> = {
  tab_blur: 'Tab Switch',
  tab_focus: 'Tab Return',
  copy: 'Copy',
  paste: 'Paste',
  fullscreen_exit: 'Fullscreen Exit',
  fullscreen_enter: 'Fullscreen Enter',
  right_click: 'Right Click',
  visibility_change: 'Visibility Change',
  window_blur: 'Window Blur',
  window_focus: 'Window Focus',
  screenshot: 'Screenshot',
  clipboard_copy: 'Copy Attempt',
  clipboard_paste: 'Paste Attempt',
  alt_tab_detected: 'Alt+Tab',
  right_click_blocked: 'Right Click Blocked',
  keyboard_shortcut_blocked: 'Blocked Shortcut',
  hardware_port_audit: 'Hardware Port Audit',
  usb_device_plugged: 'USB Device Plugged',
  usb_device_unplugged: 'USB Device Unplugged',
  screen_share_started: 'Screen Share Started',
  screen_share_ended: 'Screen Share Ended',
  screen_capture_detected: 'Screen Capture Detected',
  prohibited_app_detected: 'Prohibited App Detected',
  remote_desktop_detected: 'Remote Desktop Detected',
  rapid_window_resize: 'Rapid Window Resize',
  secondary_voice_detected: 'Secondary Voice Detected',
  volume_anomaly_detected: 'Volume Anomaly',
  tab_focus_lost: 'Tab Switch',
  copy_paste_attempt: 'Copy-Paste Attempt',
  hardware_port_anomaly: 'Hardware Port Anomaly',
  eye_blink_detected: 'Eye Blink Detected',
  eye_gaze_changed: 'Eye Gaze Changed',
  head_pose_turned_away: 'Head Turned Away',
  browser_fingerprint_captured: 'Device Fingerprint Captured',
  browser_fingerprint_changed: 'Device Change Detected',
  face_match_mismatch: 'Face Mismatch',
  face_match_restored: 'Face Verified',
  keyboard_dynamics_snapshot: 'Typing Pattern Analysis',
  answer_pattern_score: 'Answer Pattern Score',
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
}

// Keys every event carries that are noise for a human reviewer.
const PROCTOR_META_HIDDEN = new Set(['ua', 'timestamp', 'id', 'user_id', 'session_id', 'created_at', 'event_type', 'session_kind', 'source'])

const PROCTOR_META_LABELS: Record<string, string> = {
  total: 'Devices', safe: 'Safe', warn: 'Review', blocked: 'Blocked',
  multi_monitor: 'Multi-monitor', screen_count: 'Monitors', browser: 'Browser',
  os: 'Operating System', device: 'Device Type', ip: 'IP Address',
  textLength: 'Characters', preview: 'Content', appName: 'Application',
  category: 'Category', url: 'URL', title: 'Page Title', deviceName: 'Device',
  deviceType: 'Type', isBlocked: 'Blocked?', manufacturer: 'Manufacturer',
  indicator: 'Detected Signal', displaySurface: 'Capture Surface',
  trackKinds: 'Stream Type', state: 'Permission State', count: 'Count',
  removedCount: 'Removed', audioLevelDb: 'Audio Level', speechDetected: 'Speech',
  key: 'Key', label: 'Shortcut',
  blink_count: 'Total Blinks', new_blinks: 'New Blinks', gaze_direction: 'Gaze Direction',
  yaw: 'Head Yaw', pitch: 'Head Pitch',
  hash: 'Fingerprint Hash', original_hash: 'Original Hash', current_hash: 'Current Hash',
  original_screen: 'Original Screen', current_screen: 'Current Screen',
  score: 'Score', mismatch_count: 'Mismatch Count', threshold: 'Threshold',
  avg_flight_time: 'Avg Flight Time', avg_dwell_time: 'Avg Dwell Time',
  typing_speed_cpm: 'Typing Speed (CPM)', rhythm_variance: 'Rhythm Variance',
  total_keystrokes: 'Total Keystrokes', backspace_ratio: 'Backspace Ratio',
  is_suspicious: 'Suspicious?', flags: 'Flags', breakdown: 'Breakdown',
  paste_score: 'Paste Score', speed_score: 'Speed Score',
  pattern_score: 'Pattern Score', clipboard_score: 'Clipboard Score',
  total_answers: 'Total Answers', total_pastes: 'Total Pastes',
}

const humanize = (k: string): string =>
  PROCTOR_META_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/** Friendly, human-readable rendering of a proctoring event's metadata. */
function ProctorMetaDetails({ event_type, meta }: { event_type: string; meta: Record<string, unknown> }) {
  // Hardware port audit gets a purpose-built summary.
  if (event_type === 'hardware_port_audit') {
    const devices = Array.isArray(meta.devices) ? (meta.devices as Array<Record<string, unknown>>) : []
    const verdictClass = (v: unknown) => (v === 'blocked' ? 'text-rose-400' : v === 'warn' ? 'text-amber-400' : 'text-emerald-400')
    const verdictLabel = (v: unknown) => (v === 'blocked' ? 'Blocked' : v === 'warn' ? 'Review' : 'Safe')
    return (
      <div className="px-4 pb-3 border-t border-muted/50 space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
          <span className="text-muted-foreground">Devices <b className="text-foreground">{Number(meta.total ?? 0)}</b></span>
          {devices.length > 0 && (
            <>
              <span className="text-emerald-400">{Number(meta.safe ?? 0)} safe</span>
              <span className="text-amber-400">{Number(meta.warn ?? 0)} review</span>
              <span className="text-rose-400">{Number(meta.blocked ?? 0)} blocked</span>
            </>
          )}
          <span className="text-muted-foreground">Monitors <b className="text-foreground">{Number(meta.screen_count ?? 1)}</b></span>
          {meta.multi_monitor === true && <span className="text-rose-400 font-semibold">Multi-monitor detected</span>}
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
          <span className="text-foreground break-words">{value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ExamResultsPage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewCandidate, setReviewCandidate] = useState<CandidateResult | null>(null)
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [bulkReleasing, setBulkReleasing] = useState(false)
  const [manualGrades, setManualGrades] = useState<Record<string, number>>({})
  const [savingGrades, setSavingGrades] = useState(false)
  const [aiGrading, setAiGrading] = useState<Record<string, boolean>>({})
  const [aiFeedback, setAiFeedback] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [showProctorLog, setShowProctorLog] = useState(true)
  const [showRawProctorMeta, setShowRawProctorMeta] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)
  const [showReleaseAllConfirm, setShowReleaseAllConfirm] = useState(false)

  const fetchData = useCallback(async () => {
    if (!params.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/exams/${params.id}/results`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load results')
      setExam(json.exam)
      setResults((json.results || []).map((r: CandidateResult) => ({
        ...r,
        inviteId: r.id,
      })))
    } catch {
      addToast({ type: 'error', title: 'Failed to load results' })
      router.push('/dashboard/admin/assessments')
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchData() }, [fetchData])

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
    const needsGrade = reviewData.questions.filter(q => {
      const detail = reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)
      return detail?.pending_review === true || (detail?.awarded === undefined && !detail?.correct)
    })
    const questions = needsGrade.length > 0 ? needsGrade : reviewData.questions.filter(q => !!reviewData.submission.answers[q.id])
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
      addToast({ type: 'success', title: `${blank.length} unanswered question(s) set to 0`, message: 'Click Save Manual Grades to persist.' })
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
      addToast({ type: 'success', title: `AI graded ${withAnswer.length} question(s)`, message: `Review the suggestions, then click Save Manual Grades.${blank.length > 0 ? ` ${blank.length} unanswered question(s) set to 0.` : ''}` })
    }
  }

    const [bulkGradeIds, setBulkGradeIds] = useState<string[] | null>(null)

  const gradeCandidates = async (ids: string[]) => {
    if (!ids.length || bulkGradeIds) return
    setBulkGradeIds(ids)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/ai-grade-all`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Bulk grading failed')
      addToast({
        type: json.failed > 0 ? 'warning' : 'success',
        title: `AI graded ${json.graded} question(s) across ${json.candidates} candidate(s)`,
        message: json.failed > 0
          ? `${json.failed} question(s) were rate-limited or failed — click Grade again and it will pick up the rest.`
          : 'Grades saved. Refresh the list to see updated scores.',
      })
      const failedIds = new Set(json.results.filter((r: { failed: string[] }) => r.failed.length > 0).map((r: { userId: string }) => r.userId))
      setResults(prev => prev.map(r => {
        if (ids.includes(r.userId || r.id)) {
          return { ...r, graded: !failedIds.has(r.userId || '') ? true : r.graded }
        }
        return r
      }))
    } catch (e: unknown) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Bulk grading failed' })
    } finally {
      setBulkGradeIds(null)
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
      if (!res.ok) throw new Error('Failed to delete')
      addToast({ type: 'success', title: `Invite deleted for ${name}` })
      setResults(prev => prev.filter(r => r.inviteId !== inviteId))
    } catch {
      addToast({ type: 'error', title: `Failed to delete invite for ${name}` })
    } finally {
      setDeletingId(null)
    }
  }

  const exportCsv = () => {
    try {
      if (!results) {
        addToast({ type: 'error', title: 'No results available to export' })
        return
      }

      const headers = [
        'Candidate Name',
        'Email',
        'Status',
        'Delivery Status',
        'Proctoring Flags',
        'Score (%)',
        'Submitted At',
        'Score Released',
      ]

      const candidateRows = results.map(r => [
        r.name || '',
        r.email || '',
        r.status || '',
        r.deliveryStatus || '',
        r.proctoringFlags ?? 0,
        r.score !== null && r.score !== undefined ? `${r.score}%` : '--',
        r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '--',
        r.released ? 'Yes' : 'No',
      ])

      const csvRows = [headers, ...candidateRows]
      const csvString = csvRows
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n')

      const csvContent = '\uFEFF' + csvString
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

      const sanitizeTitle = (exam?.title || 'exam_results')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
      const filename = `${sanitizeTitle}_results_${new Date().toISOString().slice(0, 10)}.csv`

      if (typeof window !== 'undefined' && (window.navigator as any).msSaveOrOpenBlob) {
        ;(window.navigator as any).msSaveOrOpenBlob(blob, filename)
        addToast({ type: 'success', title: 'Exported CSV successfully' })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link)
        }
        URL.revokeObjectURL(url)
      }, 1000)

      addToast({ type: 'success', title: 'Exported CSV successfully' })
    } catch (err) {
      console.error('[CodeSpectra] CSV Export Error:', err)
      addToast({ type: 'error', title: 'Failed to export CSV file' })
    }
  }

  const copyInviteLink = (row: CandidateResult) => {
    const link = `${window.location.origin}/assessment/invite/${row.id}`
    navigator.clipboard.writeText(link).then(() => {
      addToast({ type: 'success', title: `Invite link copied for ${row.name}` })
    })
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
    const headers = ['Candidate', 'Email', 'Status', 'Score (%)', 'Submitted At', 'Integrity Flags', 'Graded', 'Released']
    const rows = results.map((r: CandidateResult) => [
      r.name || '',
      r.email || '',
      r.status || '',
      r.score !== null ? String(r.score) : '',
      r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '',
      String(r.proctoringFlags || 0),
      r.graded ? 'Yes' : 'No',
      r.released ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(exam?.title || 'exam').replace(/[^a-z0-9]+/gi, '_')}_results_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const formatProctorType = (type: string): string => PROCTOR_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const proctorColor = (type: string): string => {
    if (['copy', 'paste', 'right_click', 'clipboard_copy', 'clipboard_paste', 'right_click_blocked', 'copy_paste_attempt', 'keyboard_shortcut_blocked', 'face_match_mismatch', 'answer_pattern_score'].includes(type)) return 'text-rose-400 border-rose-500/30 bg-rose-500/10'
    if (['tab_blur', 'tab_focus_lost', 'fullscreen_exit', 'window_blur', 'visibility_change', 'alt_tab_detected', 'prohibited_app_detected', 'remote_desktop_detected', 'screen_share_started', 'screen_capture_detected', 'secondary_voice_detected', 'volume_anomaly_detected', 'rapid_window_resize', 'usb_device_plugged', 'head_pose_turned_away', 'browser_fingerprint_changed'].includes(type)) return 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    if (['eye_blink_detected', 'eye_gaze_changed', 'face_match_restored', 'browser_fingerprint_captured', 'keyboard_dynamics_snapshot'].includes(type)) return 'text-blue-400 border-blue-500/30 bg-blue-500/10'
    return 'text-muted-foreground border-border bg-muted/50'
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

      const formatEvtType = (t: string) => PROCTOR_LABELS[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

      let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Proctor Report — ${examData.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; } h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; } th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; font-size: 12px; }
  th { background: #f9fafb; font-weight: 600; } .pass { color: #059669; } .fail { color: #dc2626; }
  .evt { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  .evt-red { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .evt-amber { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .evt-blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .evt-gray { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
  img { max-width: 120px; border-radius: 4px; border: 1px solid #e5e7eb; }
  .meta { color: #6b7280; font-size: 11px; } .summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 8px 0; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<div class="no-print" style="text-align:right;margin-bottom:12px"><button onclick="window.print()" style="padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;background:#fff">Print / Save PDF</button></div>
<h1>Proctor Report: ${examData.title}</h1>
<p class="meta">Level: ${examData.level} | Duration: ${examData.duration} min | Generated: ${new Date().toLocaleString()}</p>
<p class="meta">Total Candidates: ${json.total_candidates} | Total Proctor Events: ${json.total_events}</p>
<h2>Event Type Summary</h2>
<div class="summary-box"><table><tr><th>Event Type</th><th>Count</th></tr>`

      for (const [type, count] of Object.entries(json.event_type_summary || {})) {
        html += `<tr><td>${formatEvtType(type)}</td><td>${count}</td></tr>`
      }
      html += `</table></div>`

      for (const c of candidates) {
        const pct = c.max_score > 0 ? Math.round((c.score / c.max_score) * 100) : null
        const passed = pct !== null && pct >= 50
        const rating = (c.event_count || 0) === 0 ? 'Clean' : (c.event_count || 0) < 5 ? 'Low Risk' : (c.event_count || 0) < 15 ? 'Medium Risk' : 'High Risk'

        html += `<h2>${c.name || 'Unknown'} <span class="meta">(${c.email || 'N/A'})</span></h2>`
        html += `<div class="summary-box">`
        html += `<table><tr><th>Score</th><th>Pass/Fail</th><th>Submitted</th><th>Integrity Events</th><th>Rating</th></tr>`
        html += `<tr><td>${pct !== null ? pct + '%' : '--'}</td><td class="${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</td>`
        html += `<td>${c.submitted_at ? new Date(c.submitted_at).toLocaleString() : '--'}</td>`
        html += `<td>${c.event_count || 0}</td><td><strong>${rating}</strong></td></tr></table>`

        if (c.id_photo || c.face_photo) {
          html += `<div style="margin-top:8px">`
          if (c.id_photo) html += `<div style="display:inline-block;margin-right:12px"><div class="meta">ID Photo</div><img src="${c.id_photo}" /></div>`
          if (c.face_photo) html += `<div style="display:inline-block"><div class="meta">Face Photo</div><img src="${c.face_photo}" /></div>`
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
          html += ` | Answer Pattern Score: ${score !== undefined ? score : 'N/A'}`
        }
        html += `</div></div>`

        if (c.proctor_events && c.proctor_events.length > 0) {
          html += `<h3>Proctoring Event Log</h3><table><tr><th>Event</th><th>Time</th><th>Details</th></tr>`
          for (const evt of c.proctor_events) {
            const evtType = formatEvtType(evt.event_type)
            const time = evt.created_at ? new Date(evt.created_at).toLocaleString() : '--'
            const meta = evt.meta || {}
            const details = Object.entries(meta)
              .filter(([k]) => !['ua', 'timestamp', 'id', 'user_id', 'session_id', 'created_at', 'event_type', 'session_kind', 'source', 'ip', 'browser', 'os', 'device'].includes(k))
              .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
              .join('; ')
            html += `<tr><td>${evtType}</td><td class="meta">${time}</td><td class="meta">${details}</td></tr>`
          }
          html += `</table>`
        }
      }

      html += `</body></html>`

      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
      }
      addToast({ type: 'success', title: 'Proctor report generated' })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Failed to export report', message: e.message || '' })
    } finally {
      setExportingReport(false)
    }
  }

  const releaseAllWithAudit = async () => {
    setShowReleaseAllConfirm(false)
    setBulkReleasing(true)
    try {
      const res = await csrfFetch(`/api/admin/exams/${params.id}/release-scores`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      addToast({
        type: json.released === 0 ? 'info' : 'success',
        title: json.released === 0 ? 'No unreleased scores found' : `${json.released} scores released`,
      })

      if (json.released > 0) {
        await recordAuditLog('release_scores', String(params.id), `Released ${json.released} scores`)
      }

      // Refresh results
      fetchData()
    } catch {
      addToast({ type: 'error', title: 'Bulk release failed' })
    } finally {
      setBulkReleasing(false)
    }
  }

  const saveGradesWithAudit = async () => {
    if (!reviewCandidate || Object.keys(manualGrades).length === 0) return
    setSavingGrades(true)
    try {
      const uid = reviewCandidate.userId || reviewCandidate.id
      const res = await csrfFetch(`/api/admin/exams/${params.id}/submissions/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ grades: manualGrades, remarks }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast({ type: 'success', title: 'Grades saved successfully' })

      await recordAuditLog('grade_submission', String(params.id), `Graded user ${reviewCandidate.name || uid}`)

      // Update local state
      if (reviewData) {
        const updatedDetails = reviewData.submission.details.map(d => {
          if (manualGrades[d.qId] !== undefined) {
            const remark = remarks[d.qId]
            return {
              ...d,
              awarded: manualGrades[d.qId],
              correct: manualGrades[d.qId] > 0,
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
      cell: (row: CandidateResult) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cell: (row: CandidateResult) => (
        row.source === 'invite' ? (
          <Badge variant="outline" className="text-xs"><Mail className="w-3 h-3 mr-1" />Invite</Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20"><Link className="w-3 h-3 mr-1" />Public</Badge>
        )
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: CandidateResult) => {
        const badges: Record<string, React.ReactNode> = {
          pending: <Badge variant="outline" className="text-muted-foreground">Invited</Badge>,
          in_progress: <Badge variant="outline" className="text-blue-500 border-blue-500/20">In Progress</Badge>,
          completed: <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white">Completed</Badge>,
          expired: <Badge variant="secondary" className="text-amber-500">Expired</Badge>,
        }
        return badges[row.status] || <Badge variant="outline">{row.status}</Badge>
      },
    },
    {
      key: 'graded',
      header: 'Graded',
      cell: (row: CandidateResult) => {
        if (row.status !== 'completed') return <span className="text-xs text-muted-foreground">--</span>
        if (row.graded) return <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Graded</span>
        return <span className="text-xs text-amber-500 flex items-center gap-1"><Clock className="w-3 h-3"/> Not Graded</span>
      },
    },
    {
      key: 'deliveryStatus',
      header: 'Email',
      cell: (row: CandidateResult) => {
        if (row.deliveryStatus === 'sending') {
          return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> Sending</span>
        }
        if (row.deliveryStatus === 'delivered') {
          return <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Delivered</span>
        }
        if (row.deliveryStatus === 'failed' || row.deliveryStatus === 'bounced') {
          return <span className="text-xs text-rose-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> {row.deliveryStatus === 'bounced' ? 'Bounced' : 'Failed'}</span>
        }
        if (row.status === 'completed') {
          return <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Delivered</span>
        }
        return <span className="text-xs text-muted-foreground">--</span>
      },
    },
    {
      key: 'proctoringFlags',
      header: 'Integrity',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-2">
          {row.proctoringFlags === 0 ? (
            <span className="text-emerald-500 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Clean</span>
          ) : (
            <span className="text-rose-500 text-xs flex items-center gap-1 font-bold">
              <ShieldAlert className="w-3 h-3"/> {row.proctoringFlags} Flags
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      cell: (row: CandidateResult) => (
        <div className="font-mono font-medium">
          {row.score !== null ? `${row.score}%` : '--'}
        </div>
      ),
    },
    {
      key: 'released',
      header: 'Released',
      cell: (row: CandidateResult) => (
        row.released ? (
          <span className="text-emerald-500 text-xs flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Released</span>
        ) : row.status === 'completed' ? (
          <span className="text-muted-foreground text-xs">Pending</span>
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
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                disabled={resendingId === row.inviteId || deletingId === row.inviteId}
              >
                {resendingId === row.inviteId || deletingId === row.inviteId
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <MoreHorizontal className="w-3.5 h-3.5" />
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {row.status === 'completed' && (
                <DropdownMenuItem onClick={() => openReview(row)} className="gap-2">
                  <Eye className="h-4 w-4" /> Review
                </DropdownMenuItem>
              )}
              {row.status === 'completed' && row.graded === false && (
                <DropdownMenuItem disabled className="gap-2 text-amber-500">
                  <Clock className="h-4 w-4" /> Grading Pending
                </DropdownMenuItem>
              )}
              {row.status === 'completed' && row.graded && !row.released && (
                <DropdownMenuItem onClick={() => releaseScore(row.userId || row.id, row.name)} className="gap-2 text-emerald-500 focus:text-emerald-500">
                  <Send className="h-4 w-4" /> Release Score
                </DropdownMenuItem>
              )}
              {row.status !== 'completed' && (
                <>
                  <DropdownMenuItem onClick={() => resendInvite(row.inviteId, row.name)} className="gap-2">
                    <Mail className="h-4 w-4" /> Resend Invite
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => sendReminder(row.inviteId, row.name)} className="gap-2">
                    <Bell className="h-4 w-4" /> Send Reminder
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => copyInviteLink(row)} className="gap-2">
                <Link className="h-4 w-4" /> Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmDeleteInvite({ id: row.inviteId, name: row.name })} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
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
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading results...
      </div>
    )
  }

  if (!exam) return null

  const completedCount = results.filter(r => r.status === 'completed').length
  const unreleasedCount = results.filter(r => r.status === 'completed' && !r.released).length
  const pendingGradingCount = results.filter(r => r.status === 'completed' && r.graded === false).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm mb-2" onClick={() => router.push('/dashboard/admin/assessments')}>
            <ArrowLeft className="h-4 w-4" /> Back to Assessments
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Results: {exam.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline">{exam.level}</Badge>
            <Badge variant="outline">{exam.duration} mins</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {completedCount} Submitted
            </Badge>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
              {results.length} Total Invited
            </Badge>
            {(exam.publicLinkViews ?? 0) > 0 && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                <Link className="w-3 h-3 mr-1" />
                {exam.publicLinkViews} Public Link Views
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {pendingGradingCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
              <Clock className="w-3.5 h-3.5" /> {pendingGradingCount} awaiting grading
            </Badge>
          )}
          {pendingGradingCount > 0 && (
            <Button
              variant="outline"
              className="gap-2 text-blue-600 border-blue-500/40 hover:bg-blue-500/10 dark:text-blue-400"
              onClick={() => gradeCandidates(results.filter(r => r.status === 'completed' && r.graded === false).map(r => r.userId || r.id))}
              disabled={!!bulkGradeIds}
            >
              {bulkGradeIds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {bulkGradeIds ? `Grading ${bulkGradeIds.length}…` : `Grade All Pending (${pendingGradingCount})`}
            </Button>
          )}
          {unreleasedCount > 0 && (
            <Button
              variant="default"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setShowReleaseAllConfirm(true)}
              disabled={bulkReleasing}
            >
              {bulkReleasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Release All ({unreleasedCount})
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportProctorReport}
            disabled={exportingReport}
          >
            {exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Report
          </Button>
          <Button variant="outline" className="gap-2" onClick={remindAllPending} disabled={bulkReminding}>
            {bulkReminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Remind All Pending
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCSV}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-1">
        <DataTable 
          data={results} 
          columns={columns} 
          searchKeys={['name', 'email']}
          searchPlaceholder="Search candidates..."
          bulkActions={[
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
              label: 'Release Scores',
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
              label: 'Send Reminder',
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

      {reviewCandidate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 p-4 backdrop-blur-sm pt-8 overflow-y-auto print-review-overlay">
          <div className="max-w-4xl w-full rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 mb-8 print-review-card">
            <div className="flex items-center justify-between border-b pb-3 sticky top-0 bg-card z-10">
              <div>
                <h3 className="font-bold text-lg">Review: {reviewCandidate.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{reviewCandidate.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setReviewCandidate(null); setReviewData(null) }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {reviewLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading review data...
              </div>
            ) : reviewData ? (
              <>
                <div className="overflow-y-auto max-h-[60vh] pr-2 space-y-6 print-review-body">
                  {/* Candidate Info */}
                  <div className="grid grid-cols-3 gap-4 text-sm border rounded-lg p-4 bg-muted/30">
                    <div>
                      <span className="text-muted-foreground block text-xs">Score</span>
                      <span className="text-xl font-bold">{reviewData.submission.score}/{reviewData.submission.max_score}</span>
                      {reviewData.submission.has_pending_review && (
                        <span className="block text-xs text-amber-500 mt-0.5">⚠ Partial — pending review</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Percentage</span>
                      <span className="text-xl font-bold">
                        {reviewData.submission.max_score > 0
                          ? `${Math.round((reviewData.submission.score / reviewData.submission.max_score) * 100)}%`
                          : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Submitted</span>
                      <span className="text-sm font-medium">
                        {reviewData.submission.submitted_at
                          ? new Date(reviewData.submission.submitted_at).toLocaleString()
                          : '--'}
                      </span>
                    </div>
                  </div>

                  {/* Answer Review */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Answer Review
                      {reviewData.submission.has_pending_review && (
                        <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30 bg-amber-500/10">
                          <Clock className="w-3 h-3 mr-1" /> Pending Manual Grading
                        </Badge>
                      )}
                    </h4>
                    {reviewData.questions.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">No questions found</p>
                    ) : (
                      reviewData.questions.map((q, i) => {
                        const detail = reviewData.submission.details.find((d: QuestionDetail) => d.qId === q.id)
                        const userAnswer = reviewData.submission.answers[q.id] || ''
                        const isMcq = ['multiple-choice', 'mcq', 'true_false', 'multiple_response'].includes(q.type)
                        const isPendingReview = detail?.pending_review === true
                        const isManuallyGraded = detail?.awarded !== undefined && !isPendingReview
                        const modelAnswer = q.answer || q.correct_answer || ''
                        const maxPoints = q.points || q.score || detail?.points || 10

                        return (
                          <div key={q.id} className={`border rounded-lg p-4 space-y-2 ${isPendingReview ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <span className="text-xs text-muted-foreground">Q{i + 1}. {q.type}</span>
                                <div className="text-sm font-medium mt-0.5 prose prose-sm dark:prose-invert max-w-none prose-p:text-sm prose-pre:text-xs prose-code:text-xs">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                  >
                                    {q.prompt || q.question || q.title || ''}
                                  </ReactMarkdown>
                                </div>
                              </div>
                              {isPendingReview ? (
                                <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/30 shrink-0">
                                  <Clock className="w-3 h-3 mr-1" /> Pending
                                </Badge>
                              ) : (
                                <Badge variant={detail?.correct ? 'default' : 'secondary'} className={`shrink-0 ${detail?.correct ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'text-rose-500 bg-rose-500/10 border-rose-500/30'}`}>
                                  {isManuallyGraded ? `+${detail.awarded}/${maxPoints}` : detail?.correct ? `+${detail.points}` : '0'}
                                </Badge>
                              )}
                            </div>

                            {/* MCQ-type options display */}
                            {isMcq && q.options && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
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
                                  return (
                                    <Badge key={oi} variant="outline" className={`text-xs ${
                                      isSelected && isCorrectAnswer ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40' :
                                      isSelected && !isCorrectAnswer ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 line-through' :
                                      !isSelected && isCorrectAnswer ? 'bg-emerald-500/10 text-emerald-500/70 border-emerald-500/20' :
                                      'text-muted-foreground'
                                    }`}>
                                      {opt}
                                      {isSelected ? ' (selected)' : ''}
                                      {!isSelected && isCorrectAnswer ? ' (correct)' : ''}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}

                            {/* Non-MCQ: show candidate answer + model answer side by side */}
                            {!isMcq && (
                              <div className="mt-2 space-y-2">
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground block mb-1">Candidate&apos;s Answer:</span>
                                  {userAnswer ? (
                                    <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto border">{userAnswer}</pre>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">No answer provided</span>
                                  )}
                                </div>
                                {modelAnswer && (
                                  <div>
                                    <span className="text-xs font-medium text-emerald-500 block mb-1">Model Answer / Rubric:</span>
                                    <pre className="text-xs font-mono bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{modelAnswer}</pre>
                                  </div>
                                )}

                                {/* Manual grading input for pending review questions */}
                                {(isPendingReview || isManuallyGraded) && (
                                  <div className="pt-3 border-t border-dashed space-y-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <label className="text-xs font-medium text-muted-foreground shrink-0">Award Points:</label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxPoints}
                                        value={manualGrades[q.id] ?? detail?.awarded ?? ''}
                                        onChange={(e) => setManualGrades(prev => ({ ...prev, [q.id]: Math.min(maxPoints, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                        className="w-20 h-8 px-2 text-sm border rounded-md bg-background"
                                        placeholder="0"
                                      />
                                      <span className="text-xs text-muted-foreground">/ {maxPoints}</span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1.5 text-xs h-8"
                                        onClick={() => aiGradeQuestion(q.id)}
                                        disabled={aiGrading[q.id] || !userAnswer}
                                      >
                                        {aiGrading[q.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        {aiGrading[q.id] ? 'Grading…' : 'AI Grade'}
                                      </Button>
                                    </div>

                                    {aiFeedback[q.id] && (
                                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                          <Sparkles className="w-3.5 h-3.5" /> AI Feedback — review & edit before saving
                                        </span>
                                        <textarea
                                          value={aiFeedback[q.id]}
                                          onChange={(e) => setAiFeedback(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          className="w-full min-h-20 px-3 py-2 text-xs border rounded-md bg-background"
                                          placeholder="Feedback shown to the candidate on release…"
                                        />
                                      </div>
                                    )}

                                    {/* Persisted remarks shown to candidate on release */}
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5" /> Remarks / Feedback for Candidate
                                      </label>
                                      <textarea
                                        value={remarks[q.id] ?? detail?.remarks ?? (detail?.awarded !== undefined ? aiFeedback[q.id] ?? '' : '')}
                                        onChange={(e) => setRemarks(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        className="w-full min-h-16 px-3 py-2 text-xs border rounded-md bg-background"
                                        placeholder="Where they went wrong, what's missing, how to improve…"
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
                            ? `Grade All (${bulkGrading.total - bulkGrading.failed.length}/${bulkGrading.total} graded)`
                            : 'Grade All with AI'}
                      </Button>
                      {bulkGrading.running && (
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${bulkGrading.total > 0 ? (bulkGrading.done / bulkGrading.total) * 100 : 0}%` }} />
                        </div>
                      )}
                      {Object.keys(manualGrades).length > 0 && (
                        <Button
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                          onClick={saveGradesWithAudit}
                          disabled={savingGrades}
                        >
                          {savingGrades ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Save Manual Grades
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Proctoring Events */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowProctorLog(v => !v)}
                        className="flex items-center gap-2 font-semibold text-sm text-left flex-1 min-w-0"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-500" /> Proctoring Log
                        <Badge variant="outline" className="text-xs">{reviewData.proctorEvents.length} events</Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRawProctorMeta(v => !v)}
                        title="Toggle raw JSON details"
                        className={`text-[11px] px-2 py-0.5 rounded-md border font-medium shrink-0 transition-colors ${showRawProctorMeta ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        Raw JSON
                      </button>
                      <ChevronDown
                        onClick={() => setShowProctorLog(v => !v)}
                        className={`w-4 h-4 text-muted-foreground shrink-0 cursor-pointer transition-transform ${showProctorLog ? '' : '-rotate-90'}`}
                      />
                    </div>
                    {showProctorLog && (reviewData.proctorEvents.length === 0 ? (
                      <div className="border rounded-lg p-6 text-center">
                        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                        <p className="text-sm text-muted-foreground">No proctoring violations detected</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg max-h-96 overflow-y-auto">
                        {reviewData.proctorEvents.map((evt, i) => (
                          <div key={i} className={`border-b last:border-b-0 ${proctorColor(evt.event_type)}`}>
                            <div className="flex items-center gap-3 px-4 py-2 text-xs">
                              <span className="shrink-0">{PROCTOR_ICONS[evt.event_type] || <AlertTriangle className="w-3 h-3" />}</span>
                              <span className="shrink-0 font-medium">{formatProctorType(evt.event_type)}</span>
                              <span className="text-muted-foreground ml-auto shrink-0">
                                {evt.created_at ? new Date(evt.created_at).toLocaleString() : ''}
                              </span>
                            </div>
                            {evt.meta && Object.keys(evt.meta).length > 0 && (
                              showRawProctorMeta ? (
                                <pre className="px-4 pb-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words border-t border-muted/50">
                                  {JSON.stringify(evt.meta, null, 2)}
                                </pre>
                              ) : (
                                <ProctorMetaDetails event_type={evt.event_type} meta={evt.meta} />
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Identity Photos */}
                  {(reviewData.submission.id_photo || reviewData.submission.face_photo) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">ID Photo</span>
                        <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                          {reviewData.submission.id_photo ? (
                            <img src={reviewData.submission.id_photo} alt="ID" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not captured</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground block">Face Photo</span>
                        <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                          {reviewData.submission.face_photo ? (
                            <img src={reviewData.submission.face_photo} alt="Face" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not captured</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Release Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    {reviewData.submission.released_at ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" /> Score released on {new Date(reviewData.submission.released_at).toLocaleString()}
                      </span>
                    ) : (
                      'Score not yet released to candidate'
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={downloadReviewPdf} className="gap-2">
                      <Download className="w-4 h-4" /> Download Report
                    </Button>
                    <Button variant="outline" onClick={() => { setReviewCandidate(null); setReviewData(null) }}>
                      Close
                    </Button>
                    {!reviewData.submission.released_at && (
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        onClick={() => releaseScore(reviewCandidate.userId || reviewCandidate.id, reviewCandidate.name)}
                        disabled={releasing === (reviewCandidate.userId || reviewCandidate.id)}
                      >
                        {releasing === (reviewCandidate.userId || reviewCandidate.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Release Score
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No submission data found for this candidate.
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmDeleteInvite} onOpenChange={(open) => !open && setConfirmDeleteInvite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the invite for {confirmDeleteInvite?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReleaseAllConfirm} onOpenChange={setShowReleaseAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release All Scores?</AlertDialogTitle>
            <AlertDialogDescription>
              This will release all unreleased scores to candidates. Candidates will be notified and able to view their results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={releaseAllWithAudit}
            >
              Release All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
