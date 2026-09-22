/**
 * Native proctoring — the mobile equivalent of the web monitors.
 *
 * Web uses tab-blur, fullscreen enforcement, the Chrome extension and a USB
 * device audit. None of that exists in a native app, so instead we report
 * the signals a real device CAN produce, through the same
 * /api/proctor/events stream the web already writes to. Server-side
 * analysis (answer-pattern, plagiarism, leak detection) runs unchanged.
 *
 * Spec: docs/superpowers/specs/2026-09-21-mobile-app-design.md §11
 */
import { api } from './client'

export type ProctorSessionKind = 'exam' | 'problem' | 'interview'

export interface ProctorEvent {
  session_kind: ProctorSessionKind
  session_id: string
  event_type: string
  meta?: Record<string, unknown>
}

/** Dotted event names, mirroring the web monitor vocabulary. */
export const ProctorEventType = {
  sessionStart: 'session.mobile_start',
  sessionEnd: 'session.mobile_end',
  appBackground: 'focus.app_background',
  appForeground: 'focus.app_foreground',
  screenshot: 'device.screenshot',
  screenRecording: 'device.screen_recording',
  jailbreakOrRoot: 'device.integrity_rooted',
  emulator: 'device.integrity_emulator',
  idle: 'focus.idle',
  paste: 'input.paste',
  cameraDenied: 'camera.permission_denied',
} as const

/** Fire-and-forget: proctoring must never block or crash the exam UI. */
export function reportProctorEvent(event: ProctorEvent): void {
  api.post('/api/proctor/events', event).catch(() => {})
}

export interface IntegrityReport {
  rooted: boolean
  emulator: boolean
  details: Record<string, unknown>
}

/**
 * Device integrity. Uses expo-device when present; degrades to an honest
 * "unknown" rather than claiming the device is clean. We never guess — a
 * false "safe" is worse than an unverified signal for a proctored exam.
 */
export async function checkDeviceIntegrity(): Promise<IntegrityReport> {
  const details: Record<string, unknown> = {}
  let emulator = false
  let rooted = false

  try {
    const Device = await import('expo-device')
    details.deviceName = Device.deviceName ?? null
    details.modelName = Device.modelName ?? null
    details.osName = Device.osName ?? null
    details.osVersion = Device.osVersion ?? null
    // expo-device exposes isDevice=false on simulators/emulators.
    emulator = Device.isDevice === false
    details.isDevice = Device.isDevice
  } catch {
    details.expoDevice = 'unavailable'
  }

  // ponytail: JS cannot reliably read root/jailbreak state without a native
  // module. We report what the platform exposes and leave `rooted` false
  // rather than inventing a verdict; a native integrity module is the
  // documented upgrade path (spec §11 "device-integrity signals").
  return { rooted, emulator, details }
}
