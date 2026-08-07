'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  Eye,
  Lock,
  Monitor,
  Video,
  UserCheck,
  RefreshCw,
  EyeOff,
} from 'lucide-react'
import { auditHardwarePorts, HardwareAuditResult } from '@/lib/proctoring/hardware-detector'
import { EyeGazeTracker, EyeGazeAnalysis } from '@/lib/proctoring/eye-gaze-tracker'
import { AadhaarIDVerificationModal } from './AadhaarIDVerificationModal'
import { DeviceAuditModal } from './DeviceAuditModal'

interface ProctoringWrapperProps {
  children: React.ReactNode
  proctoringLevel?: 'none' | 'focus_only' | 'ai_flagged' | 'strict_lockdown'
  candidateName?: string
  onFlagEvent?: (event: { type: string; timestamp: number; details: string }) => void
  /** Used to report the hardware-port audit to /api/proctor/events. */
  sessionKind?: 'exam' | 'problem' | 'interview'
  sessionId?: string
}

export function ProctoringWrapper({
  children,
  proctoringLevel = 'ai_flagged',
  candidateName = 'Candidate',
  onFlagEvent,
  sessionKind,
  sessionId,
}: ProctoringWrapperProps) {
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

  // Real-time Eye Gaze & Blink Counter State
  const [gazeAnalysis, setGazeAnalysis] = useState<EyeGazeAnalysis | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackerRef = useRef<EyeGazeTracker | null>(null)

  // 1. Hardware & Port Audit
  useEffect(() => {
    if (proctoringLevel === 'none') return

    auditHardwarePorts().then((result) => {
      setHardwareAudit(result)
      const blocked = result.devices.filter((d) => d.verdict === 'blocked')
      const warns = result.devices.filter((d) => d.verdict === 'warn')
      if (blocked.length > 0 || warns.length > 0) {
        setShowWarningBanner(true)
        setWarningMessage(`Hardware Security Warning: ${blocked[0]?.productName || warns[0]?.productName || 'Unrecognized device detected'}`)
        if (onFlagEvent) {
          onFlagEvent({
            type: 'hardware_port_anomaly',
            timestamp: Date.now(),
            details: result.violations.join('; '),
          })
        }
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
          setWarningMessage(`Tab switch detected (Count: ${next}). Stay focused on this window.`)
          if (onFlagEvent) {
            onFlagEvent({
              type: 'tab_focus_lost',
              timestamp: Date.now(),
              details: `Candidate lost tab focus (Count: ${next})`,
            })
          }
          return next
        })
      }
    }

    const handleCopyPaste = (e: ClipboardEvent) => {
      if (proctoringLevel === 'strict_lockdown' || proctoringLevel === 'ai_flagged') {
        e.preventDefault()
        setShowWarningBanner(true)
        setWarningMessage('Copy-paste is disabled during proctored assessment.')
        if (onFlagEvent) {
          onFlagEvent({
            type: 'copy_paste_attempt',
            timestamp: Date.now(),
            details: 'Candidate attempted to copy or paste content',
          })
        }
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

  // 3. Eye Gaze, Blink Counter & Head Pose Camera Loop
  useEffect(() => {
    if (proctoringLevel === 'none') return

    trackerRef.current = new EyeGazeTracker()
    let stream: MediaStream | null = null
    let intervalId: any = null

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        intervalId = setInterval(() => {
          if (videoRef.current && trackerRef.current) {
            const analysis = trackerRef.current.analyzeFrame(videoRef.current)
            setGazeAnalysis(analysis)

            if (analysis.headPose.isTurnedAway) {
              setShowWarningBanner(true)
              setWarningMessage('Head turned away from camera center. Keep eyes on screen.')
            }
          }
        }, 1000)
      } catch (e) {
        // Camera access optional / ungranted
      }
    }

    initCamera()

    return () => {
      if (intervalId) clearInterval(intervalId)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [proctoringLevel])

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Top Proctoring Integrity Indicator Bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border/80 bg-card/90 px-4 py-2 text-xs backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <ShieldAlert className="h-4 w-4 text-emerald-500" />
            <span>AI Proctor Active</span>
          </div>

          <span className="uppercase font-mono font-bold text-primary text-[10px] bg-primary/10 px-2 py-0.5 rounded">
            {proctoringLevel}
          </span>

          {/* Eye Blink & Gaze Indicator Badge */}
          {gazeAnalysis && (
            <div className="flex items-center gap-2 border-l border-border/60 pl-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Eye className="h-3.5 w-3.5" /> Blinks: {gazeAnalysis.blinkCount}
              </span>
              <span className="text-muted-foreground">• Gaze:</span>
              <span className="font-mono font-bold capitalize text-foreground">{gazeAnalysis.gazeDirection}</span>
            </div>
          )}

          {/* Hardware Multi-Monitor Warning Badge */}
          {hardwareAudit && hardwareAudit.isMultiMonitor && (
            <div className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 font-bold text-rose-500 text-[11px]">
              <Monitor className="h-3.5 w-3.5" /> Multi-Monitor ({hardwareAudit.screenCount})
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {tabFocusLostCount > 0 && (
            <div className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle className="h-3 w-3" />
              <span>{tabFocusLostCount} Tab Switch(es)</span>
            </div>
          )}

          {/* KYC Status Button */}
          {kycVerified ? (
            <div className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
              <UserCheck className="h-3.5 w-3.5" /> Aadhaar KYC Verified
            </div>
          ) : (
            <button
              onClick={() => setShowIdKycModal(true)}
              className="flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
            >
              <UserCheck className="h-3.5 w-3.5" /> Verify Aadhaar / ID
            </button>
          )}

          <div className="text-muted-foreground">
            Candidate: <span className="font-semibold text-foreground">{candidateName}</span>
          </div>
        </div>
      </div>

      {/* Hidden Video element for Vision Analysis */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Warning Toast Banner */}
      {showWarningBanner && (
        <div className="fixed top-12 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300 shadow-lg backdrop-blur">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <div>
            <div className="font-bold">Proctor Warning Logged</div>
            <div>{warningMessage}</div>
          </div>
          <button
            onClick={() => setShowWarningBanner(false)}
            className="ml-2 font-bold text-amber-700 dark:text-amber-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Aadhaar Mudra KYC Modal */}
      {showIdKycModal && (
        <AadhaarIDVerificationModal
          onVerified={() => {
            setKycVerified(true)
            setShowIdKycModal(false)
          }}
          onCancel={() => setShowIdKycModal(false)}
        />
      )}

      {/* Pre-exam Device & Port Audit gate */}
      {showDeviceAudit && sessionKind && sessionId && !auditCompleted && (
        <DeviceAuditModal
          sessionKind={sessionKind}
          sessionId={sessionId}
          onComplete={(result) => {
            setAuditCompleted(true)
            setShowDeviceAudit(false)
            setHardwareAudit(result)
            if (onFlagEvent && result.violations.length > 0) {
              onFlagEvent({
                type: 'hardware_port_anomaly',
                timestamp: Date.now(),
                details: result.violations.join('; '),
              })
            }
          }}
        />
      )}

      {/* Main Candidate Content */}
      {children}
    </div>
  )
}
