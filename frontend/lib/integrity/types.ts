/**
 * Test integrity (proctoring signals + plagiarism / AI-written-code signals)
 * for tests (exams) and hosted contests. Client-safe: types, the signal
 * catalogue, settings defaults and the settings validator.
 *
 * Everything is opt-in per test or contest by its author, the candidate sees
 * a consent screen first, and nothing here ever fails anyone automatically:
 * the output is a trust score, a timeline and flags for a human reviewer.
 */
import { z } from 'zod'

export const TARGET_KINDS = ['exam', 'contest'] as const
export type TargetKind = (typeof TARGET_KINDS)[number]
export const isTargetKind = (v: unknown): v is TargetKind => v === 'exam' || v === 'contest'

/** What an author can switch on. Each maps to one or more client event types. */
export const SIGNALS = [
  'face_count', 'looking_away', 'tab_focus', 'fullscreen', 'clipboard',
  'devtools', 'multi_monitor', 'network', 'typing_cadence',
] as const
export type SignalId = (typeof SIGNALS)[number]

export const SIGNAL_INFO: Record<SignalId, { label: string; candidate: string; camera?: boolean }> = {
  face_count: { label: 'Face in view', candidate: 'Your camera checks every few seconds that exactly one face is in view. No video is kept.', camera: true },
  looking_away: { label: 'Looking away', candidate: 'Your camera notices when you look away from the screen for a while.', camera: true },
  tab_focus: { label: 'Tab and window focus', candidate: 'We note when you switch tabs or leave this window, and for how long.' },
  fullscreen: { label: 'Full screen', candidate: 'We note when you leave full screen.' },
  clipboard: { label: 'Copy and paste', candidate: 'We note copy and paste, and how many characters were pasted — never what you pasted.' },
  devtools: { label: 'Developer tools', candidate: 'We note when browser developer tools look open.' },
  multi_monitor: { label: 'Extra screens', candidate: 'We note when more than one screen is connected (where your browser can tell).' },
  network: { label: 'Network changes', candidate: 'We note when your connection drops or your network address changes.' },
  typing_cadence: { label: 'Typing rhythm', candidate: 'In code answers we keep timing statistics of your typing (speed, pauses). Never the keys you press.' },
}

/** Client event types. `signal` null = system event (always accepted, no penalty). */
export const EVENT_TYPES = {
  consent_given: null,
  session_start: null,
  session_end: null,
  face_none: 'face_count',
  face_multiple: 'face_count',
  camera_blocked: 'face_count',
  looking_away: 'looking_away',
  tab_hidden: 'tab_focus',
  window_blur: 'tab_focus',
  fullscreen_exit: 'fullscreen',
  copy: 'clipboard',
  paste: 'clipboard',
  devtools_open: 'devtools',
  multi_monitor: 'multi_monitor',
  offline: 'network',
  /** Written by the server only (IP hash changed between batches). */
  network_change: 'network',
  typing_summary: 'typing_cadence',
} as const satisfies Record<string, SignalId | null>
export type IntegrityEventType = keyof typeof EVENT_TYPES
export const isEventType = (v: unknown): v is IntegrityEventType => typeof v === 'string' && Object.prototype.hasOwnProperty.call(EVENT_TYPES, v)

/** Event types a browser may send (network_change is server-side). */
export const CLIENT_EVENT_TYPES = (Object.keys(EVENT_TYPES) as IntegrityEventType[]).filter((t) => t !== 'network_change')

export const EVENT_LABELS: Record<IntegrityEventType, string> = {
  consent_given: 'Consent given',
  session_start: 'Session started',
  session_end: 'Session ended',
  face_none: 'No face in view',
  face_multiple: 'More than one face',
  camera_blocked: 'Camera unavailable',
  looking_away: 'Looking away',
  tab_hidden: 'Left the tab',
  window_blur: 'Left the window',
  fullscreen_exit: 'Left full screen',
  copy: 'Copied text',
  paste: 'Pasted text',
  devtools_open: 'Developer tools open',
  multi_monitor: 'Extra screen connected',
  offline: 'Went offline',
  network_change: 'Network address changed',
  typing_summary: 'Typing rhythm sample',
}

/** Event types that may carry a camera snapshot. */
export const SNAPSHOT_REASONS: IntegrityEventType[] = ['face_none', 'face_multiple', 'looking_away', 'tab_hidden', 'fullscreen_exit']

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'cleared' | 'flagged'
export const REVIEW_STATUSES: ReviewStatus[] = ['unreviewed', 'reviewed', 'cleared', 'flagged']

export interface IntegritySettings {
  /** Master switch: off = no consent screen, no monitoring. */
  enabled: boolean
  signals: Record<SignalId, boolean>
  /** Seconds between camera face checks. */
  face_interval_sec: number
  /** Keep a small camera still when a camera violation happens. */
  snapshots_on_violation: boolean
  /** Snapshots are deleted after this many days. */
  snapshot_retention_days: number
  /** Events (timeline) are deleted after this many days. */
  event_retention_days: number
  /** Continuous webcam + screen recording (existing session recorder). Off unless the author turns it on. */
  continuous_video: boolean
  similarity: {
    enabled: boolean
    /** 0–1: pairs at or above this similarity are clustered for review. */
    threshold: number
    /** Ignore answers shorter than this many normalised tokens (boilerplate). */
    min_tokens: number
  }
  ai_signals: {
    enabled: boolean
    /** Optional model-based classifier on the most suspicious answers (spend-capped platform-wide). */
    classifier: boolean
    /** Classifier calls for this test or contest at most. */
    classifier_max_calls: number
  }
}

export const DEFAULT_SIGNALS: Record<SignalId, boolean> = {
  face_count: false, looking_away: false, tab_focus: true, fullscreen: true, clipboard: true,
  devtools: false, multi_monitor: true, network: true, typing_cadence: true,
}

export const DEFAULT_INTEGRITY_SETTINGS: IntegritySettings = {
  enabled: false,
  signals: { ...DEFAULT_SIGNALS },
  face_interval_sec: 10,
  snapshots_on_violation: false,
  snapshot_retention_days: 30,
  event_retention_days: 180,
  continuous_video: false,
  similarity: { enabled: true, threshold: 0.6, min_tokens: 25 },
  ai_signals: { enabled: true, classifier: false, classifier_max_calls: 20 },
}

const SignalsPatch = z.object(Object.fromEntries(SIGNALS.map((s) => [s, z.boolean().optional()])) as Record<SignalId, z.ZodOptional<z.ZodBoolean>>).strict()

export const SettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  signals: SignalsPatch.optional(),
  face_interval_sec: z.coerce.number().int().min(5).max(120).optional(),
  snapshots_on_violation: z.boolean().optional(),
  snapshot_retention_days: z.coerce.number().int().min(1).max(365).optional(),
  event_retention_days: z.coerce.number().int().min(7).max(730).optional(),
  continuous_video: z.boolean().optional(),
  similarity: z.object({
    enabled: z.boolean().optional(),
    threshold: z.coerce.number().min(0.3).max(1).optional(),
    min_tokens: z.coerce.number().int().min(5).max(500).optional(),
  }).strict().optional(),
  ai_signals: z.object({
    enabled: z.boolean().optional(),
    classifier: z.boolean().optional(),
    classifier_max_calls: z.coerce.number().int().min(0).max(200).optional(),
  }).strict().optional(),
}).strict()

/** Merge a stored (possibly partial / old) doc over the defaults; bad fields fall back to defaults. Pure. */
export function resolveSettings(raw: unknown): IntegritySettings {
  const d = DEFAULT_INTEGRITY_SETTINGS
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = <T,>(schema: z.ZodTypeAny, v: unknown, fallback: T): T => {
    const p = schema.safeParse(v)
    return p.success && p.data !== undefined ? (p.data as T) : fallback
  }
  const bool = z.boolean()
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const sig = obj(r.signals)
  const sim = obj(r.similarity)
  const ai = obj(r.ai_signals)
  return {
    enabled: pick(bool, r.enabled, d.enabled),
    signals: Object.fromEntries(SIGNALS.map((id) => [id, pick(bool, sig[id], d.signals[id])])) as Record<SignalId, boolean>,
    face_interval_sec: pick(z.number().int().min(5).max(120), r.face_interval_sec, d.face_interval_sec),
    snapshots_on_violation: pick(bool, r.snapshots_on_violation, d.snapshots_on_violation),
    snapshot_retention_days: pick(z.number().int().min(1).max(365), r.snapshot_retention_days, d.snapshot_retention_days),
    event_retention_days: pick(z.number().int().min(7).max(730), r.event_retention_days, d.event_retention_days),
    continuous_video: pick(bool, r.continuous_video, d.continuous_video),
    similarity: {
      enabled: pick(bool, sim.enabled, d.similarity.enabled),
      threshold: pick(z.number().min(0.3).max(1), sim.threshold, d.similarity.threshold),
      min_tokens: pick(z.number().int().min(5).max(500), sim.min_tokens, d.similarity.min_tokens),
    },
    ai_signals: {
      enabled: pick(bool, ai.enabled, d.ai_signals.enabled),
      classifier: pick(bool, ai.classifier, d.ai_signals.classifier),
      classifier_max_calls: pick(z.number().int().min(0).max(200), ai.classifier_max_calls, d.ai_signals.classifier_max_calls),
    },
  }
}

/** Validate an author's change and apply it over the current settings. Pure. */
export function applySettingsPatch(current: IntegritySettings, raw: unknown): { ok: true; settings: IntegritySettings } | { ok: false; error: string } {
  const r = SettingsPatchSchema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const p = r.data
  const next: IntegritySettings = {
    ...current,
    ...dropUndef({
      enabled: p.enabled, face_interval_sec: p.face_interval_sec, snapshots_on_violation: p.snapshots_on_violation,
      snapshot_retention_days: p.snapshot_retention_days, event_retention_days: p.event_retention_days, continuous_video: p.continuous_video,
    }),
    signals: { ...current.signals, ...dropUndef(p.signals) },
    similarity: { ...current.similarity, ...dropUndef(p.similarity) },
    ai_signals: { ...current.ai_signals, ...dropUndef(p.ai_signals) },
  }
  return { ok: true, settings: next }
}

/** Does this setting need the camera? */
export function needsCamera(s: Pick<IntegritySettings, 'enabled' | 'signals'>): boolean {
  return s.enabled && (s.signals.face_count || s.signals.looking_away)
}

/** Signals that are on, for the consent screen. */
export function enabledSignals(s: Pick<IntegritySettings, 'enabled' | 'signals'>): SignalId[] {
  return s.enabled ? SIGNALS.filter((id) => s.signals[id]) : []
}

/** What the candidate's browser receives (no reviewer-only fields). */
export interface CandidateIntegrityConfig {
  enabled: boolean
  signals: SignalId[]
  face_interval_sec: number
  snapshots: boolean
  continuous_video: boolean
  /** Consent already recorded for this attempt. */
  consented: boolean
}

export function candidateConfig(s: IntegritySettings, consented: boolean): CandidateIntegrityConfig {
  return {
    enabled: s.enabled,
    signals: enabledSignals(s),
    face_interval_sec: s.face_interval_sec,
    snapshots: s.enabled && s.snapshots_on_violation && needsCamera(s),
    continuous_video: s.enabled && s.continuous_video,
    consented,
  }
}

function dropUndef<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {}
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

