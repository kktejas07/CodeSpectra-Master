/**
 * Native proctoring monitors, wired to /api/proctor/events.
 *
 * Replaces the web's browser-only signals with what a real device gives us:
 *   tab-blur        → AppState background/foreground transitions
 *   fullscreen lock → screenshot / screen-recording detection (best-effort)
 *   USB audit       → device-integrity check (rooted / emulator)
 *   idle timer      → same in-activity timeout the web uses
 *
 * Every report is fire-and-forget: proctoring must never block the exam.
 */
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  ProctorEventType, reportProctorEvent, checkDeviceIntegrity,
  type ProctorSessionKind,
} from '../api/proctor'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

export interface ProctoringOptions {
  sessionKind: ProctorSessionKind
  sessionId: string
  enabled: boolean
  /** Called on each focus-loss so the UI can warn the candidate. */
  onViolation?: (kind: 'background' | 'screenshot' | 'idle', count: number) => void
}

export function useProctoring({ sessionKind, sessionId, enabled, onViolation }: ProctoringOptions): void {
  const violations = useRef(0)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnedRef = useRef(onViolation)
  warnedRef.current = onViolation

  useEffect(() => {
    if (!enabled || !sessionId) return

    const fire = (event_type: string, meta?: Record<string, unknown>): void => {
      reportProctorEvent({ session_kind: sessionKind, session_id: sessionId, event_type, meta })
    }

    const bump = (kind: 'background' | 'screenshot' | 'idle', meta?: Record<string, unknown>): void => {
      violations.current += 1
      warnedRef.current?.(kind, violations.current)
      fire(
        kind === 'background'
          ? ProctorEventType.appBackground
          : kind === 'screenshot'
            ? ProctorEventType.screenshot
            : ProctorEventType.idle,
        { count: violations.current, ...meta },
      )
    }

    // ── Session lifecycle + integrity baseline ──────────────────────────
    fire(ProctorEventType.sessionStart, { platform: process.env.EXPO_OS ?? 'unknown' })
    void checkDeviceIntegrity().then((report) => {
      if (report.emulator) fire(ProctorEventType.emulator, report.details)
      if (report.rooted) fire(ProctorEventType.jailbreakOrRoot, report.details)
    })

    // ── Focus loss (the native "tab switch") ────────────────────────────
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        bump('background', { state: next })
      } else if (next === 'active') {
        fire(ProctorEventType.appForeground)
        resetIdle()
      }
    })

    // ── Idle detection (no interaction for 5 min) ───────────────────────
    function resetIdle(): void {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => bump('idle', { timeoutMs: IDLE_TIMEOUT_MS }), IDLE_TIMEOUT_MS)
    }
    resetIdle()

    // ── Screenshot attempts (best-effort; iOS reports, Android blocks) ──
    let screenshotSub: { remove: () => void } | null = null
    void import('expo-screen-capture')
      .then((ScreenCapture) => {
        // iOS only: there is no Android userland listener, so screenshots
        // are *prevented* there (see the FLAG_SECURE note in the design) and
        // this event fires on iOS. We do not pretend Android reports them.
        const anySC = ScreenCapture as unknown as {
          addScreenshotListener?: (cb: () => void) => { remove: () => void }
        }
        if (typeof anySC.addScreenshotListener === 'function') {
          screenshotSub = anySC.addScreenshotListener(() => bump('screenshot'))
        }
      })
      .catch(() => { /* module absent — no screenshot signal, honestly */ })

    return () => {
      sub.remove()
      screenshotSub?.remove()
      if (idleTimer.current) clearTimeout(idleTimer.current)
      fire(ProctorEventType.sessionEnd, { violations: violations.current })
    }
  }, [enabled, sessionKind, sessionId])
}
