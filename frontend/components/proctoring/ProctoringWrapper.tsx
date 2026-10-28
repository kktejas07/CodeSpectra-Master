'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ShieldAlert, AlertTriangle, Eye, Lock, Monitor, Video,
  UserCheck, RefreshCw, EyeOff, Fingerprint, Keyboard, Camera,
} from 'lucide-react'
import { auditHardwarePorts, HardwareAuditResult } from '@/lib/proctoring/hardware-detector'
import { EyeGazeTracker, EyeGazeAnalysis } from '@/lib/proctoring/eye-gaze-tracker'
import { generateFingerprint, fingerprintChanged, type BrowserFingerprint } from '@/lib/proctoring/browser-fingerprint'
import { captureSnapshot, compareFaces, SNAPSHOT_INTERVAL_MS, type FaceMatchResult } from '@/lib/proctoring/face-match'
import { KeyboardDynamicsTracker, type KeyboardDynamics } from '@/lib/proctoring/keyboard-dynamics'
import { ExamAadhaarGate } from './ExamAadhaarGate'
import { DeviceAuditModal } from './DeviceAuditModal'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'

interface ProctoringWrapperProps {
  children: React.ReactNode
  proctoringLevel?: 'none' | 'focus_only' | 'ai_flagged' | 'strict_lockdown'
  candidateName?: string
  onFlagEvent?: (event: { type: string; timestamp: number; details: string }) => void
  sessionKind?: 'exam' | 'problem' | 'interview'
  sessionId?: string
  idPhoto?: string  // Base64 ID photo from IdentityVerification
  /** Result of the test's pre-start identity check (stored server-side). Shown instead of the "Verify" button. */
  identityStatus?: 'verified' | 'needs_review' | null
  examTitle?: string
}

export function ProctoringWrapper({
  children,
  proctoringLevel = 'ai_flagged',
  candidateName = 'Candidate',
  onFlagEvent,
  sessionKind,
  sessionId,
  idPhoto,
  identityStatus = null,
  examTitle,
}: ProctoringWrapperProps) {
  const { t: tr } = useT()
  const [tabFocusLostCount, setTabFocusLostCount] = useState(0)
  const [showWarningBanner, setShowWarningBanner] = useState(false)
  const [warningMessage, setWarningMessage] = useState('Switching tabs or copying content is logged.')
  const [hardwareAudit, setHardwareAudit] = useState<HardwareAuditResult | null>(null)
  const [showIdKycModal, setShowIdKycModal] = useState(false)
  const [kycVerified, setKycVerified] = useState(false)
  const [showDeviceAudit, setShowDeviceAudit] = useState(
    proctoringLevel === 'strict_lockdown' || proctoringLevel === 'ai_flagged',
  )
  const [auditCompleted, setAuditCompleted] = useState(false)

  // Eye Gaze & Blink
  const [gazeAnalysis, setGazeAnalysis] = useState<EyeGazeAnalysis | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackerRef = useRef<EyeGazeTracker | null>(null)
  const lastBlinkCountRef = useRef(0)
  const lastGazeRef = useRef('')
  const lastHeadPoseRef = useRef(false)

  // Face Match
  const faceMatchRef = useRef<FaceMatchResult | null>(null)
  const faceMismatchCountRef = useRef(0)

  // Browser Fingerprint
  const fingerprintRef = useRef<BrowserFingerprint | null>(null)

  // Keyboard Dynamics
  const keyboardRef = useRef(new KeyboardDynamicsTracker())
  const keyboardSnapshotSent = useRef(false)

  // Send proctor events to API
  const sendEvent = useCallback(async (eventType: string, meta?: Record<string, unknown>) => {
    if (!sessionKind || !sessionId) return
    try {
      await csrfFetch('/api/proctor/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_kind: sessionKind,
          session_id: sessionId,
          event_type: eventType,
          meta: { ...meta, timestamp: new Date().toISOString() },
        }),
      })
    } catch { /* fire-and-forget */ }
  }, [sessionKind, sessionId])

  // 1. Hardware & Port Audit
  useEffect(() => {
    if (proctoringLevel === 'none') return
    auditHardwarePorts().then((result) => {
      setHardwareAudit(result)
      const blocked = result.devices.filter((d) => d.verdict === 'blocked')
      const warns = result.devices.filter((d) => d.verdict === 'warn')
      if (blocked.length > 0 || warns.length > 0) {
        setShowWarningBanner(true)
        setWarningMessage(tr('exam.hardwareSecurityWarningValue', { value: blocked[0]?.productName || warns[0]?.productName || 'Unrecognized device detected' }))
        if (onFlagEvent) onFlagEvent({ type: 'hardware_port_anomaly', timestamp: Date.now(), details: result.violations.join('; ') })
      }
    })
  }, [proctoringLevel, onFlagEvent])

  // 2. Tab & Focus Lockout
  useEffect(() => {
    if (proctoringLevel === 'none') return
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabFocusLostCount((prev) => {
          const next = prev + 1
          setShowWarningBanner(true)
          setWarningMessage(tr('exam.tabSwitchDetectedCountNextStayac7', { next }))
          if (onFlagEvent) onFlagEvent({ type: 'tab_focus_lost', timestamp: Date.now(), details: tr('exam.candidateLostTabFocusCountNext', { next }) })
          return next
        })
      }
    }
    const handleCopyPaste = (e: ClipboardEvent) => {
      if (proctoringLevel === 'strict_lockdown' || proctoringLevel === 'ai_flagged') {
        e.preventDefault()
        setShowWarningBanner(true)
        setWarningMessage(tr('exam.copyPasteIsDisabledDuringProctored650'))
        if (onFlagEvent) onFlagEvent({ type: 'copy_paste_attempt', timestamp: Date.now(), details: tr('exam.candidateAttemptedToCopyOrPaste0ac') })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('copy', handleCopyPaste)
    document.addEventListener('paste', handleCopyPaste)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('copy', handleCopyPaste)
      document.removeEventListener('paste', handleCopyPaste)
    }
  }, [proctoringLevel, onFlagEvent])

  // 3. Browser Fingerprint — capture on mount, verify every 30s
  useEffect(() => {
    if (proctoringLevel === 'none') return
    const fp = generateFingerprint()
    fingerprintRef.current = fp
    sendEvent('browser_fingerprint_captured', {
      hash: fp.hash, screen: fp.screen, platform: fp.platform,
      timezone: fp.timezone, language: fp.language,
      hardware_concurrency: fp.hardwareConcurrency,
    })

    const intervalId = setInterval(() => {
      const current = generateFingerprint()
      if (fingerprintRef.current && fingerprintChanged(fingerprintRef.current, current)) {
        sendEvent('browser_fingerprint_changed', {
          original_hash: fingerprintRef.current.hash,
          current_hash: current.hash,
          original_screen: fingerprintRef.current.screen,
          current_screen: current.screen,
        })
        setShowWarningBanner(true)
        setWarningMessage(tr('exam.deviceBrowserChangeDetectedThisIs909'))
      }
    }, 30000)

    return () => clearInterval(intervalId)
  }, [proctoringLevel, sendEvent])

  // 4. Face Match — periodic camera snapshots vs ID photo
  useEffect(() => {
    if (proctoringLevel === 'none' || !idPhoto) return
    // Reset mismatch count when ID photo changes
    faceMismatchCountRef.current = 0
    let intervalId: any = null

    // Wait 10s for camera to warm up, then start periodic checks
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const snapshot = captureSnapshot(videoRef.current)
          if (!snapshot) return
          const result = await compareFaces(idPhoto, snapshot)
          faceMatchRef.current = result

          if (!result.matched) {
            faceMismatchCountRef.current++
            sendEvent('face_match_mismatch', {
              score: result.score,
              mismatch_count: faceMismatchCountRef.current,
              threshold: 0.55,
            })
            if (faceMismatchCountRef.current >= 3) {
              setShowWarningBanner(true)
              setWarningMessage(tr('exam.faceVerificationMismatchCurrentTimesThecfb', { current: faceMismatchCountRef.current }))
            }
          } else {
            // Reset mismatch count on successful match
            if (faceMismatchCountRef.current > 0) {
              sendEvent('face_match_restored', { score: result.score })
            }
            faceMismatchCountRef.current = 0
          }
        }
      }, SNAPSHOT_INTERVAL_MS)
    }, 10000)

    return () => { clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId) }
  }, [proctoringLevel, idPhoto, sendEvent])

  // 5. Keyboard Dynamics — track typing patterns, send summary every 60s
  useEffect(() => {
    if (proctoringLevel === 'none') return
    const tracker = keyboardRef.current

    const handleKeyDown = (e: KeyboardEvent) => { tracker.onKeyDown(e.key) }
    const handleKeyUp = (e: KeyboardEvent) => { tracker.onKeyUp(e.key) }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    const intervalId = setInterval(() => {
      const dynamics = tracker.getDynamics()
      if (dynamics.totalKeystrokes > 10) {
        sendEvent('keyboard_dynamics_snapshot', {
          avg_flight_time: dynamics.avgFlightTime,
          avg_dwell_time: dynamics.avgDwellTime,
          typing_speed_cpm: dynamics.typingSpeed,
          rhythm_variance: dynamics.rhythmVariance,
          total_keystrokes: dynamics.totalKeystrokes,
          backspace_ratio: dynamics.backspaceRatio,
          is_suspicious: dynamics.isSuspicious,
        })
        if (dynamics.isSuspicious) {
          setShowWarningBanner(true)
          setWarningMessage(tr('exam.automatedTypingPatternDetectedThisSessioe27'))
        }
        // Note: We don't reset the tracker here to avoid clearing ongoing keystroke data
        // The tracker accumulates all keystrokes for comprehensive pattern analysis
      }
    }, 60000)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      clearInterval(intervalId)
    }
  }, [proctoringLevel, sendEvent])

  // 6. Eye Gaze, Blink Counter & Head Pose Camera Loop
  useEffect(() => {
    if (proctoringLevel === 'none') return
    trackerRef.current = new EyeGazeTracker()
    let stream: MediaStream | null = null
    let intervalId: any = null

    let inFlight = false
    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
        if (videoRef.current) videoRef.current.srcObject = stream
        // Load the landmark models before the loop (falls back silently if the
        // models are unavailable — the loop then reports no face).
        await trackerRef.current?.load()
        intervalId = setInterval(async () => {
          // Landmark detection takes ~tens of ms; skip a tick if the previous
          // frame is still being analysed so calls can't pile up.
          if (inFlight || !videoRef.current || !trackerRef.current) return
          inFlight = true
          try {
            const analysis = await trackerRef.current.analyzeFrame(videoRef.current)
            setGazeAnalysis(analysis)
            if (analysis.blinkCount > lastBlinkCountRef.current) {
              const newBlinks = analysis.blinkCount - lastBlinkCountRef.current
              lastBlinkCountRef.current = analysis.blinkCount
              sendEvent('eye_blink_detected', { blink_count: analysis.blinkCount, new_blinks: newBlinks, gaze_direction: analysis.gazeDirection })
            }
            if (analysis.gazeDirection !== lastGazeRef.current) {
              lastGazeRef.current = analysis.gazeDirection
              sendEvent('eye_gaze_changed', { gaze_direction: analysis.gazeDirection, blink_count: analysis.blinkCount })
            }
            if (analysis.headPose.isTurnedAway !== lastHeadPoseRef.current) {
              lastHeadPoseRef.current = analysis.headPose.isTurnedAway
              if (analysis.headPose.isTurnedAway) {
                sendEvent('head_pose_turned_away', { yaw: analysis.headPose.yaw, pitch: analysis.headPose.pitch, gaze_direction: analysis.gazeDirection })
                setShowWarningBanner(true)
                setWarningMessage(tr('exam.headTurnedAwayFromCameraCenter99f'))
              }
            }
          } finally {
            inFlight = false
          }
        }, 1000)
      } catch { /* camera optional */ }
    }
    initCamera()
    return () => { if (intervalId) clearInterval(intervalId); if (stream) stream.getTracks().forEach((t) => t.stop()) }
  }, [proctoringLevel, sendEvent])

  // Expose keyboard tracker for answer pattern scoring
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__proctorKeyboardTracker = keyboardRef.current

      // Cleanup on unmount
      return () => {
        (window as any).__proctorKeyboardTracker = null
      }
    }
  }, [])

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Top Proctoring Integrity Indicator Bar */}
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border/80 bg-card/95 px-4 py-2 text-xs backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span>{tr('exam.proctoringOn')}</span>
          </div>
          <span className="font-semibold text-primary text-[11px] bg-primary/10 px-2 py-0.5 rounded-full inline-block first-letter:uppercase">{String(proctoringLevel).replace(/_/g, ' ')}</span>

          {gazeAnalysis && (
            <div className="flex items-center gap-2 border-l border-border/60 pl-3 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground font-medium">
                <Eye className="h-3.5 w-3.5" />{' '}{tr('exam.blinks')}{' '}<span className="tabular-nums text-foreground">{gazeAnalysis.blinkCount}</span>
              </span>
              <span className="text-muted-foreground">{tr('exam.gaze')}</span>
              <span className="font-semibold capitalize text-foreground">{gazeAnalysis.gazeDirection}</span>
            </div>
          )}

          {hardwareAudit && hardwareAudit.isMultiMonitor && (
            <div className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 font-bold text-red-600 dark:text-red-400 text-[11px]">
              <Monitor className="h-3.5 w-3.5" />{' '}{tr('exam.multipleMonitors')}<span className="tabular-nums">{hardwareAudit.screenCount}</span>)
            </div>
          )}

          {/* Face Match Status */}
          {idPhoto && faceMatchRef.current && (
            <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[11px] ${faceMatchRef.current.matched ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
              <Camera className="h-3.5 w-3.5" />{' '}{tr('exam.face')}{' '}{faceMatchRef.current.matched ? tr('exam.verified') : tr('exam.doesntMatchN', { n: Math.round(faceMatchRef.current.score * 100) })}
            </div>
          )}

          {/* Fingerprint Status */}
          {fingerprintRef.current && (
            <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-[11px] font-medium">
              <Fingerprint className="h-3.5 w-3.5" />{' '}{tr('exam.deviceVerified')}</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {tabFocusLostCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300 font-bold">
              <AlertTriangle className="h-3 w-3" />
              <span><span className="tabular-nums">{tabFocusLostCount}</span> {tabFocusLostCount === 1 ? tr('exam.tabSwitch') : tr('exam.tabSwitches')}</span>
            </div>
          )}
          {identityStatus === 'needs_review' ? (
            <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300 font-bold text-[11px]" title={tr('exam.noCameraWasAvailableSoYour6a5')}>
              <UserCheck className="h-3.5 w-3.5" />{' '}{tr('exam.idSentForReview')}</div>
          ) : identityStatus === 'verified' || kycVerified ? (
            <div className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-green-700 dark:text-green-400 font-bold text-[11px]">
              <UserCheck className="h-3.5 w-3.5" /> {identityStatus === 'verified' ? tr('exam.identityCheckDone') : tr('exam.idVerified')}
            </div>
          ) : (
            <button onClick={() => setShowIdKycModal(true)} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <UserCheck className="h-3.5 w-3.5" />{' '}{tr('exam.verifyAadhaarId')}</button>
          )}
          <div className="text-muted-foreground">{tr('exam.candidate')}{' '}<span className="font-semibold text-foreground">{candidateName}</span>
          </div>
        </div>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {showWarningBanner && (
        <div className="fixed top-12 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/80 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200 shadow-lg backdrop-blur">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <div className="font-bold">{tr('exam.warningRecorded')}</div>
            <div>{warningMessage}</div>
          </div>
          <button onClick={() => setShowWarningBanner(false)} className="ml-2 rounded px-1.5 py-1 font-bold text-amber-800 dark:text-amber-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tr('exam.dismiss')}</button>
        </div>
      )}

      {showIdKycModal && (
        <ExamAadhaarGate
          examId={sessionKind === 'exam' ? sessionId : undefined}
          examTitle={examTitle}
          onVerified={() => {
            setKycVerified(true)
            setShowIdKycModal(false)
          }}
          onCancel={() => setShowIdKycModal(false)}
        />
      )}

      {showDeviceAudit && sessionKind && sessionId && !auditCompleted && (
        <DeviceAuditModal sessionKind={sessionKind} sessionId={sessionId} onComplete={(result) => {
          setAuditCompleted(true); setShowDeviceAudit(false); setHardwareAudit(result)
          if (onFlagEvent && result.violations.length > 0) onFlagEvent({ type: 'hardware_port_anomaly', timestamp: Date.now(), details: result.violations.join('; ') })
        }} />
      )}

      {children}
    </div>
  )
}
