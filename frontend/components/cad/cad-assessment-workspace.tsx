'use client'

/**
 * CAD task workspace, shared by the real exam page (/assessment/[id]/cad,
 * mode="exam") and the try-it page (/assessment/demo/cad, mode="demo").
 *
 * exam: loads the exam, applies the same entry gates the server enforces
 *       (lib/exam-access.ts), then the same pre-start checks as the main test
 *       page (/assessment/[id]): Device Audit extension gate, recording
 *       consent, ID / face capture per exam settings. After the checks pass the
 *       candidate presses Start, which records the start time server-side
 *       (/api/exams/[id]/cad-submission/start) — the timer runs from that, not
 *       from page load. The active task runs inside the same proctoring stack
 *       (ProctoringWrapper strict_lockdown + RealTimeProctor fullscreen +
 *       SessionRecorder), posting to /api/proctor/events with session_kind
 *       'exam' and session_id = exam id, so reviewers get the same timeline.
 *       Files upload to /api/exams/[id]/cad-submission/files and the attempt
 *       is submitted to /api/exams/[id]/cad-submission. The timer only runs
 *       when the exam has a duration.
 * demo: sample brief, no timer, no proctoring, nothing uploaded or scored,
 *       "Preview" banner.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Clock, Upload, Save, Send, Download, MessageSquare, Eye, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'
import { RealTimeProctor } from '@/components/proctoring/RealTimeProctor'
import { ExtensionGate } from '@/components/proctoring/ExtensionGate'
import { IdentityVerification } from '@/components/proctoring/IdentityVerification'
import { SessionRecorder } from '@/components/proctoring/SessionRecorder'
import { EmptyState } from '@/components/ui/empty-state'
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
import { CADTaskTypeSelector } from '@/components/cad/cad-task-type-selector'
import { INVITE_ONLY_MESSAGE } from '@/lib/exam-access'
import {
  CAD_FILE_EXTENSIONS,
  CAD_MAX_FILE_BYTES,
  CAD_RATIONALE_MIN_CHARS,
  CAD_RATIONALE_MAX_CHARS,
  cadFileExtOk,
  type CadFileKind,
  type CadFileMeta,
} from '@/lib/cad-submission'

const CADEditor = dynamic(() => import('@/components/cad/CADEditor').then((m) => m.CADEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border border-border bg-card">
      <div className="text-sm text-muted-foreground">Loading CAD editor…</div>
    </div>
  ),
})

interface ExamInfo {
  id: string
  title: string
  description?: string
  duration?: number
  published?: boolean
  starts_at?: string | null
  ends_at?: string | null
  access_type?: 'invite_only' | 'open'
  require_token_links?: boolean
  require_id_verification?: boolean | null
  require_face_capture?: boolean | null
  submission?: unknown
  attempts?: { used: number; max: number; can_retake: boolean }
  proctoring_mode?: 'standard' | 'strict'
  /** Server entry check (same as start/submit): invite, link, window, attempts. */
  entry?: { ok: boolean; error?: string }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'blocked'; title: string; message: string }
  | { kind: 'submitted'; used: number; max: number }
  /** exam only: gates passed, pre-start checks (consent, ID / face) + Start. */
  | { kind: 'prestart' }
  /** Task is running (exam: after Start; demo: immediately). */
  | { kind: 'ready' }

const FILE_LABEL: Record<CadFileKind, string> = {
  native: 'Native CAD file',
  step: 'STEP AP242 export',
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function CadAssessmentWorkspace({
  mode,
  examId,
  inviteToken = null,
  linkToken = null,
}: {
  mode: 'demo' | 'exam'
  examId: string
  inviteToken?: string | null
  linkToken?: string | null
}) {
  const addToast = useToast()
  const isDemo = mode === 'demo'
  const [phase, setPhase] = useState<Phase>(isDemo ? { kind: 'ready' } : { kind: 'loading' })
  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'editor' | 'file_upload' | 'task_selection'>('editor')
  const [selectedTaskCode, setSelectedTaskCode] = useState<string>('T1_PART_MODELLING')
  const [vivaRationale, setVivaRationale] = useState('')

  // demo: files are only picked locally.
  const [demoFiles, setDemoFiles] = useState<Partial<Record<CadFileKind, File>>>({})
  // exam: uploaded (staged) files from the server.
  const [staged, setStaged] = useState<Partial<Record<CadFileKind, CadFileMeta>>>({})
  const [uploading, setUploading] = useState<Partial<Record<CadFileKind, boolean>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const autoSubmitRef = useRef(false)
  const startedAtRef = useRef<number>(0)
  const warned30Ref = useRef(false)

  // Pre-start checks (exam mode), mirroring /assessment/[id].
  const [recordingConsent, setRecordingConsent] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [checksPassed, setChecksPassed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)

  const draftKey = `codespectra-cad-draft-${examId}`

  // ─── Load + entry gates (exam mode) ────────────────────────────────────────
  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    const block = (title: string, message: string) => { if (!cancelled) setPhase({ kind: 'blocked', title, message }) }
    ;(async () => {
      try {
        const q = new URLSearchParams()
        if (inviteToken) q.set('inviteToken', inviteToken)
        if (linkToken) q.set('link', linkToken)
        const res = await fetch(`/api/exams/${encodeURIComponent(examId)}${q.toString() ? `?${q}` : ''}`, { credentials: 'include' })
        if (!res.ok) return block('Test unavailable', 'This test could not be found or is no longer available.')
        const found = (await res.json()) as ExamInfo
        if (cancelled) return
        if (!found.published) return block('Test unavailable', 'This test could not be found or is no longer available.')
        setExam(found)
        if (found.submission && !found.attempts?.can_retake) {
          setPhase({ kind: 'submitted', used: found.attempts?.used ?? 1, max: found.attempts?.max ?? 1 })
          return
        }
        const now = Date.now()
        if (found.ends_at && now > new Date(found.ends_at).getTime()) return block('Test closed', 'This test is past its deadline. Contact the organiser if you need access.')
        if (found.starts_at && now < new Date(found.starts_at).getTime()) return block('Test not open yet', 'This test hasn’t opened yet. Check back at the scheduled start time.')

        if (linkToken) {
          const linkRes = await fetch(`/api/exams/${encodeURIComponent(examId)}/links?token=${encodeURIComponent(linkToken)}`)
          if (!linkRes.ok) {
            const j = await linkRes.json().catch(() => ({})) as { error?: string }
            return block('Link not valid', j.error || 'This link has expired or been revoked.')
          }
        } else if (!inviteToken && (found.access_type || 'invite_only') !== 'open') {
          return block('Invite-only test', INVITE_ONLY_MESSAGE)
        }
        // Invite validity (right account, not revoked, retakes allowed) and the
        // personal-link rule come from the server entry check.
        if (found.entry && !found.entry.ok) {
          return block('Can’t start this test', found.entry.error || 'This invitation is invalid or has expired.')
        }

        const stagedRes = await fetch(`/api/exams/${encodeURIComponent(examId)}/cad-submission`, { credentials: 'include' })
        if (stagedRes.ok) {
          const j = await stagedRes.json() as { staged?: CadFileMeta[] }
          const map: Partial<Record<CadFileKind, CadFileMeta>> = {}
          for (const f of j.staged || []) if (!map[f.kind]) map[f.kind] = f
          if (!cancelled) setStaged(map)
        }
        try {
          const draft = localStorage.getItem(draftKey)
          if (draft && !cancelled) setVivaRationale(String((JSON.parse(draft) as { vivaRationale?: string }).vivaRationale || ''))
        } catch { /* storage unavailable */ }

        // The timer starts when the candidate presses Start (see handleStart).
        if (!cancelled) setPhase({ kind: 'prestart' })
      } catch {
        block('Couldn’t load the test', 'Check your connection and reload the page.')
      }
    })()
    return () => { cancelled = true }
  }, [isDemo, examId, inviteToken, linkToken, draftKey])

  // ─── Start (exam mode, after checks) ───────────────────────────────────────
  // The server records the start time once per attempt; a reload resumes from
  // it. Remaining time is computed against the server clock to ignore skew.
  const handleStart = async () => {
    if (isDemo || starting) return
    setStarting(true)
    try {
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/cad-submission/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken, linkToken }),
      })
      const j = await res.json().catch(() => ({})) as { error?: string; started_at?: string; server_now?: string; duration_minutes?: number }
      if (!res.ok || !j.started_at) throw new Error(j.error || 'Could not start the test')
      const startedMs = Date.parse(j.started_at)
      const serverNowMs = j.server_now ? Date.parse(j.server_now) : Date.now()
      const elapsedMs = Math.max(0, serverNowMs - startedMs)
      // Map the server start onto the local clock for total_time_ms.
      startedAtRef.current = Date.now() - elapsedMs
      const minutes = Number(j.duration_minutes) || 0
      setTimeLeft(minutes > 0 ? Math.max(0, Math.round((minutes * 60_000 - elapsedMs) / 1000)) : null)
      setPhase({ kind: 'ready' })
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t start the test', message: e instanceof Error ? e.message : undefined })
    } finally {
      setStarting(false)
    }
  }

  // ─── Submit (exam mode) ────────────────────────────────────────────────────
  const submit = useCallback(async (autoSubmitted: boolean) => {
    if (isDemo || submitting) return
    setSubmitting(true)
    try {
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/cad-submission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rationale: vivaRationale,
          task_code: selectedTaskCode,
          auto_submitted: autoSubmitted,
          inviteToken,
          linkToken,
          idPhoto,
          facePhoto,
          started_at: startedAtRef.current ? new Date(startedAtRef.current).toISOString() : null,
          total_time_ms: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
        }),
      })
      const j = await res.json().catch(() => ({})) as { error?: string; attempt_no?: number; max_attempts?: number }
      if (!res.ok) throw new Error(j.error || 'Submit failed')
      try {
        localStorage.removeItem(draftKey)
      } catch { /* storage unavailable */ }
      setPhase({ kind: 'submitted', used: j.attempt_no ?? 1, max: j.max_attempts ?? 1 })
      addToast({ type: 'success', title: 'CAD task submitted' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Submit failed'
      addToast({
        type: 'error',
        title: autoSubmitted ? 'Time is up, but the auto-submit failed' : 'Couldn’t submit',
        message: autoSubmitted ? `${message} Keep this tab open and contact the organiser.` : message,
      })
    } finally {
      setSubmitting(false)
    }
  }, [isDemo, submitting, examId, vivaRationale, selectedTaskCode, inviteToken, linkToken, idPhoto, facePhoto, draftKey, addToast])

  // Countdown + one-shot auto-submit at zero.
  useEffect(() => {
    if (phase.kind !== 'ready' || timeLeft === null) return
    if (timeLeft <= 0) {
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true
        void submit(true)
      }
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? s : s - 1)), 1000)
    return () => clearTimeout(t)
  }, [phase.kind, timeLeft, submit])

  // 30-minute warning, logged to the proctoring timeline like the main test.
  useEffect(() => {
    if (isDemo || phase.kind !== 'ready' || timeLeft !== 1800 || warned30Ref.current) return
    warned30Ref.current = true
    addToast({ type: 'warning', title: '30 minutes remaining' })
    csrfFetch('/api/proctor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_kind: 'exam',
        session_id: examId,
        event_type: 'timer_warning_30min',
        meta: { time_left: 1800, task: 'cad', timestamp: new Date().toISOString() },
      }),
    }).catch(() => {})
  }, [isDemo, phase.kind, timeLeft, examId, addToast])

  // ─── File handling ─────────────────────────────────────────────────────────
  const onPickFile = async (kind: CadFileKind, file: File | undefined) => {
    if (!file) return
    if (!cadFileExtOk(kind, file.name)) {
      addToast({ type: 'error', title: 'Wrong file type', message: `Use ${CAD_FILE_EXTENSIONS[kind].join(', ')}.` })
      return
    }
    if (file.size > CAD_MAX_FILE_BYTES) {
      addToast({ type: 'error', title: 'File too large', message: 'Files must be under 9 MB.' })
      return
    }
    if (isDemo) {
      setDemoFiles((prev) => ({ ...prev, [kind]: file }))
      return
    }
    setUploading((prev) => ({ ...prev, [kind]: true }))
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('kind', kind)
      if (inviteToken) form.set('inviteToken', inviteToken)
      if (linkToken) form.set('linkToken', linkToken)
      const res = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/cad-submission/files`, { method: 'POST', body: form })
      const j = await res.json().catch(() => ({})) as { error?: string; file?: CadFileMeta }
      if (!res.ok || !j.file) throw new Error(j.error || 'Upload failed')
      setStaged((prev) => ({ ...prev, [kind]: j.file }))
      addToast({ type: 'success', title: `${FILE_LABEL[kind]} uploaded` })
    } catch (e) {
      addToast({ type: 'error', title: 'Upload failed', message: e instanceof Error ? e.message : undefined })
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }))
    }
  }

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ vivaRationale: vivaRationale || '', selectedTaskCode, savedAt: new Date().toISOString() }))
      addToast({ type: 'success', title: 'Draft saved on this device' })
    } catch {
      addToast({ type: 'error', title: 'Could not save draft', message: 'Browser storage is unavailable.' })
    }
  }

  // No starter-file API exists — generate a minimal valid STEP stub client-side.
  const handleDownloadStarter = () => {
    const stub = [
      'ISO-10303-21;',
      'HEADER;',
      "FILE_DESCRIPTION(('CodeSpectra CAD starter template - minimal valid STEP stub, not a full bracket model'),'1');",
      `FILE_NAME('Base_Bracket_Starter.step','${new Date().toISOString()}',('CodeSpectra'),('CodeSpectra'),' ',' ',' ');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
      'ENDSEC;',
      'DATA;',
      '/* Starter template only - build the full bracket model per the design brief. */',
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([stub], { type: 'application/step' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'Base_Bracket_Starter.step'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    addToast({ type: 'success', title: 'Starter template downloaded', message: 'Minimal STEP stub - replace with your full bracket model.' })
  }

  // ─── Non-workspace states ──────────────────────────────────────────────────
  if (phase.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> Preparing your CAD task…
      </div>
    )
  }
  if (phase.kind === 'blocked') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <EmptyState illustration="locked" title={phase.title} description={phase.message} actionLabel="Return home" actionHref="/" />
      </div>
    )
  }
  if (phase.kind === 'submitted') {
    const canRetake = phase.used < phase.max
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-4">
        <EmptyState
          illustration="success"
          title="CAD task submitted"
          description={`Your files and design rationale are with the reviewers. Your score is shared once they finish reviewing.${phase.max > 1 ? ` Attempts used: ${phase.used} of ${phase.max}.` : ''}`}
          actionLabel="Return home"
          actionHref="/"
        />
        {canRetake && (
          <Button onClick={() => window.location.reload()}>Start attempt {phase.used + 1} of {phase.max}</Button>
        )}
      </div>
    )
  }

  if (phase.kind === 'prestart') {
    const requireId = exam?.require_id_verification !== false
    const requireFace = exam?.require_face_capture !== false
    const minutes = Number(exam?.duration) || 0
    return (
      <ExtensionGate bypass={exam?.proctoring_mode !== 'strict'}>
        <div className="flex min-h-[80vh] items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg space-y-6 rounded-3xl border-border/70 p-8">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-bold">{exam?.title || 'CAD task'}</h1>
              <p className="text-sm text-muted-foreground">Proctored CAD task. Complete the checks below, then press Start.</p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-semibold tabular-nums">{minutes > 0 ? `${minutes} minutes` : 'No time limit'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You submit</span>
                <span className="font-semibold">Native CAD file, STEP export, rationale</span>
              </div>
              {exam?.attempts && exam.attempts.max > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Attempt</span>
                  <span className="font-semibold tabular-nums">{exam.attempts.used + 1} of {exam.attempts.max}</span>
                </div>
              )}
            </div>

            {minutes > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>
                  <strong>Before you start:</strong> the timer starts when you press Start and can&apos;t be paused. Reloading
                  the page doesn&apos;t reset it. At zero, whatever you&apos;ve uploaded is submitted automatically.
                </p>
              </div>
            )}

            {!checksPassed ? (
              <>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:border-primary/40">
                  <input
                    type="checkbox"
                    checked={recordingConsent}
                    onChange={(e) => setRecordingConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    I consent to session recording (webcam and screen) during this task. The recording is used solely for
                    proctoring integrity verification and will be stored securely.
                  </span>
                </label>
                {(!requireId || !requireFace) && (
                  <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Identity check for this test: {!requireId && !requireFace ? 'consent only — no ID or face capture required' : !requireId ? 'face selfie only — ID skipped' : 'ID only — face capture skipped'}.
                  </div>
                )}
                <Button onClick={() => setShowVerification(true)} className="h-12 w-full rounded-xl text-base font-semibold">
                  Continue to identity check
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <p>Checks complete. The test opens in fullscreen and is proctored from the moment you press Start.</p>
                </div>
                <Button onClick={() => void handleStart()} disabled={starting} className="h-12 w-full gap-2 rounded-xl text-base font-semibold">
                  {starting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                  Start
                </Button>
              </>
            )}
          </Card>

          {showVerification && (
            <IdentityVerification
              examTitle={exam?.title || 'CAD task'}
              requireId={requireId}
              requireFace={requireFace}
              onCancel={() => setShowVerification(false)}
              onComplete={(data) => {
                setIdPhoto(data.idPhoto)
                setFacePhoto(data.facePhoto)
                setShowVerification(false)
                setChecksPassed(true)
              }}
            />
          )}
        </div>
      </ExtensionGate>
    )
  }

  // ─── Workspace ─────────────────────────────────────────────────────────────
  const title = isDemo ? 'Bracket mass reduction and stress optimization' : exam?.title || 'CAD task'
  const ready = !!staged.native && !!staged.step && vivaRationale.trim().length >= CAD_RATIONALE_MIN_CHARS
  const lowTime = timeLeft !== null && timeLeft < 300

  const workspace = (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-background">
      {isDemo && (
        <div role="note" className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Preview.</strong> This is a sample CAD task to try the tools. There is no
            timer, nothing is proctored, and files you pick are not uploaded or scored.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="min-w-0">
          {isDemo && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Preview · Sample CAD task</span>
          )}
          <h1 className="truncate text-base font-bold text-foreground">{title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isDemo ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span>No time limit in preview</span>
            </div>
          ) : timeLeft !== null ? (
            <div
              role="timer"
              aria-label="Time remaining"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-xs font-semibold tabular-nums ${
                lowTime ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-border bg-muted/40 text-foreground'
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatTime(Math.max(0, timeLeft))} <span className="font-sans font-medium opacity-80">left</span>
            </div>
          ) : null}

          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium" role="tablist" aria-label="Workspace">
            {([['editor', '2D editor'], ['task_selection', 'Task type (T1–T9)'], ['file_upload', 'Submit files']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`rounded px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === id ? 'bg-card font-semibold text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={handleSaveDraft} className="gap-1 text-xs">
            <Save className="h-3.5 w-3.5" aria-hidden /> Save draft
          </Button>

          {isDemo ? (
            <>
              <Button type="button" size="sm" disabled title="Submitting isn't available in preview" aria-describedby="cad-submit-hint" className="gap-1.5 text-xs">
                <Send className="h-3.5 w-3.5" aria-hidden /> Submit task
              </Button>
              <span id="cad-submit-hint" className="sr-only">Submitting isn&apos;t available in preview.</span>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || !ready}
              title={ready ? undefined : `Upload both files and write at least ${CAD_RATIONALE_MIN_CHARS} characters of rationale first`}
              className="gap-1.5 text-xs"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
              Submit task
            </Button>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-4">
        <div className="space-y-4 overflow-y-auto border-r border-border bg-card p-4 text-xs lg:col-span-1">
          <div>
            <h2 className="text-sm font-bold text-foreground">Design brief</h2>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {isDemo
                ? 'Reduce component mass by at least 20% while maintaining structural integrity under 5 kN static load.'
                : exam?.description || 'Follow the brief your organiser shared with your invite.'}
            </p>
          </div>

          {isDemo && (
            <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3">
              <h3 className="text-base font-semibold text-foreground">Target constraints</h3>
              <ul className="space-y-1.5">
                {[
                  ['Outer mounting hole OD', '50.0 ± 0.05 mm'],
                  ['Target mass', '< 1.30 kg'],
                  ['Minimum yield stress', '> 250 MPa'],
                  ['Parting line draft', '3.0 deg'],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-muted-foreground">
                    <span>{k}</span>
                    <span className="font-semibold tabular-nums text-foreground">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <label htmlFor="cad-rationale" className="flex items-center gap-1.5 font-bold text-primary">
              <MessageSquare className="h-4 w-4" aria-hidden /> Design rationale (required)
            </label>
            <p id="cad-rationale-hint" className="text-[11px] text-muted-foreground">
              Explain your feature tree order, datum scheme and manufacturing trade-offs.
              {!isDemo && ` At least ${CAD_RATIONALE_MIN_CHARS} characters.`}
            </p>
            <textarea
              id="cad-rationale"
              aria-describedby="cad-rationale-hint"
              value={vivaRationale}
              maxLength={CAD_RATIONALE_MAX_CHARS}
              onChange={(e) => setVivaRationale(e.target.value)}
              placeholder="Explain why you chose this feature order, datum scheme, and manufacturing draft angle..."
              className="h-24 w-full rounded-lg border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {!isDemo && (
              <p className="text-right text-[11px] tabular-nums text-muted-foreground">{vivaRationale.trim().length} characters</p>
            )}
          </div>

          {isDemo && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="text-base font-semibold text-foreground">Starter file</h3>
              <p className="text-muted-foreground">Download base starter geometry before modifying:</p>
              <Button type="button" variant="secondary" size="sm" onClick={handleDownloadStarter} className="w-full gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" aria-hidden /> Download Base_Bracket.step
              </Button>
            </div>
          )}
        </div>

        <div className="relative overflow-y-auto bg-background p-4 lg:col-span-3">
          {activeTab === 'editor' && <CADEditor />}

          {activeTab === 'task_selection' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Choose the task type (T1–T9)</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select the task type you worked on so reviewers apply the matching rubric.
                </p>
              </div>
              <CADTaskTypeSelector selectedTaskCode={selectedTaskCode} onSelectTask={(code) => setSelectedTaskCode(code)} />
            </div>
          )}

          {activeTab === 'file_upload' && (
            <div className="flex flex-col items-center justify-center space-y-6 p-6">
              <div className="w-full max-w-xl space-y-4 rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm dark:shadow-none">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Submit both CAD files</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your native CAD file (for the feature tree) and a STEP AP242 export (for geometry and tolerances). Up to 9 MB each.
                  </p>
                  {isDemo && (
                    <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Preview only: files stay on your device and are not uploaded or scored.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 pt-2 text-left sm:grid-cols-2">
                  {(['native', 'step'] as const).map((kind, i) => {
                    const inputId = `cad-${kind}-file-input`
                    const picked = isDemo ? demoFiles[kind] : null
                    const uploaded = isDemo ? null : staged[kind]
                    const busy = !!uploading[kind]
                    return (
                      <div key={kind} className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                        <div className="text-xs font-bold text-foreground">
                          {i + 1}. {FILE_LABEL[kind]} ({CAD_FILE_EXTENSIONS[kind].slice(0, 4).join(', ')})
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {kind === 'native' ? 'Used to check the feature tree and design intent.' : 'Used to check geometry and tolerances.'}
                        </p>
                        <input
                          type="file"
                          accept={CAD_FILE_EXTENSIONS[kind].join(',')}
                          onChange={(e) => {
                            void onPickFile(kind, e.target.files?.[0])
                            e.target.value = ''
                          }}
                          className="sr-only"
                          id={inputId}
                          disabled={busy || submitting}
                        />
                        <label
                          htmlFor={inputId}
                          className={`inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm focus-within:ring-2 focus-within:ring-ring ${
                            kind === 'native'
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'border border-border bg-card text-foreground hover:bg-accent'
                          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
                        >
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
                          {busy ? 'Uploading…' : uploaded ? 'Replace file' : `Choose ${kind === 'native' ? 'native file' : 'STEP file'}`}
                        </label>
                        {picked && <div className="truncate text-[11px] font-medium text-foreground">Picked: {picked.name}</div>}
                        {uploaded && (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                            <span className="truncate">{uploaded.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(uploaded.size)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {!isDemo && (
                  <p className="text-[11px] text-muted-foreground">
                    Files upload as soon as you pick them. They&apos;re only sent to reviewers when you press Submit task.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!isDemo && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit your CAD task?</AlertDialogTitle>
              <AlertDialogDescription>
                Your two files and design rationale go to the reviewers. You can&apos;t change them after submitting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(staged.native?.scan_status === 'unscanned' || staged.step?.scan_status === 'unscanned') && (
              <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                The file scanner was busy when you uploaded. Your files are still submitted; reviewers are told they weren&apos;t scanned.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setConfirmOpen(false); void submit(false) }}>Submit</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )

  if (isDemo) return workspace

  // Same proctoring stack and session id as /assessment/[id], so the CAD
  // attempt lands on the exam's proctoring timeline.
  return (
    <ExtensionGate bypass={exam?.proctoring_mode !== 'strict'}>
      <ProctoringWrapper proctoringLevel="strict_lockdown" candidateName="Candidate" sessionKind="exam" sessionId={examId} idPhoto={idPhoto || undefined}>
        <RealTimeProctor sessionKind="exam" sessionId={examId} enabled enforceFullscreen>
          <SessionRecorder sessionKind="exam" sessionId={examId} enabled={recordingConsent} />
          {workspace}
        </RealTimeProctor>
      </ProctoringWrapper>
    </ExtensionGate>
  )
}
