/**
 * Live proctored hiring drives — shared types, input schemas and pure rules
 * (client-safe, no I/O; tests/live-drives.test.ts). Server code: ./store,
 * ./service, ./paper.
 *
 * A live drive is one timed sitting of a company test (lib/company-tests
 * pattern + level) for hundreds of candidates at once, run by a college
 * placement team (lib/campus) or a company hiring team (lib/ats). It adds:
 *   - a lobby with a system check and one synchronised start time,
 *   - a single server-owned clock per candidate (add time / pause shift it),
 *   - auto-save + heartbeat, reconnect-and-resume inside a window,
 *   - a control room for invigilators (live grid, integrity flags stream,
 *     warn / add time / pause / resume / terminate / broadcast — all audited),
 *   - results published to the linked campus drive (shortlist) or ATS job.
 *
 * Integrity signals reuse lib/integrity with target kind 'drive'.
 */
import { z } from 'zod'
import type { PracticeLevel } from '@/lib/company-tests/types'
import { PRACTICE_LEVELS } from '@/lib/company-tests/types'

export const DRIVE_STATUSES = ['draft', 'scheduled', 'ended'] as const
export type LiveDriveStatus = (typeof DRIVE_STATUSES)[number]
/** What the UI shows: `scheduled` becomes `live` once the start time passes. */
export type EffectiveDriveStatus = 'draft' | 'scheduled' | 'live' | 'ended'

export const OWNER_KINDS = ['college', 'company'] as const
export type OwnerKind = (typeof OWNER_KINDS)[number]

/** Stored candidate state. */
export const CANDIDATE_STATES = ['not_started', 'in_progress', 'paused', 'submitted', 'terminated'] as const
export type CandidateState = (typeof CANDIDATE_STATES)[number]

/** What the control room grid shows (derived). */
export const GRID_STATUSES = ['not_started', 'in_progress', 'paused', 'disconnected', 'flagged', 'submitted', 'terminated'] as const
export type GridStatus = (typeof GRID_STATUSES)[number]

export const ACTIONS = ['warn', 'add_time', 'pause', 'resume', 'terminate', 'flag', 'unflag', 'allow_rejoin'] as const
export type CandidateAction = (typeof ACTIONS)[number]

export const MAX_ROSTER = 5000
export const MAX_INVIGILATORS = 100
export const MAX_MESSAGE = 300
export const MAX_INBOX = 20
export const MAX_BROADCASTS = 20
export const SUBMIT_GRACE_MS = 30_000
/** A candidate counts as disconnected after this many missed heartbeats. */
export const MISSED_HEARTBEATS = 3
/** Heartbeat writes closer together than this are skipped (saves DB writes at scale). */
export const HEARTBEAT_WRITE_GAP_MS = 10_000

export interface DriveRules {
  /** Minutes a candidate may be away and still resume on their own. */
  reconnect_window_min: number
  /** Seconds between auto-saves in the candidate's browser. */
  autosave_sec: number
  /** Seconds between heartbeats. */
  heartbeat_sec: number
  /** Candidates per invigilator group. */
  group_size: number
  /** Integrity incidents that mark a candidate as flagged in the grid (0 = never automatically). */
  flag_threshold: number
  /** Pass mark in percent; null = the test pattern's cut-off. */
  pass_percent: number | null
  /** System check needs a working camera (also forced when camera integrity checks are on). */
  require_camera: boolean
  /** Minimum download speed (Mbps) the system check accepts. */
  min_mbps: number
}

export const DEFAULT_RULES: DriveRules = {
  reconnect_window_min: 10,
  autosave_sec: 15,
  heartbeat_sec: 15,
  group_size: 50,
  flag_threshold: 5,
  pass_percent: null,
  require_camera: false,
  min_mbps: 1,
}

export interface DriveSchedule {
  /** ISO time everyone starts. */
  start_at: string
  duration_min: number
  /** Lobby opens this many minutes before the start. */
  lobby_open_min: number
  /** Latest a candidate may begin, in minutes after the start. */
  late_join_min: number
}

export interface Invigilator { user_id: string; email: string; name: string }
export interface Broadcast { id: string; text: string; at: string; by: string }
export interface InboxItem { id: string; kind: 'warning' | 'notice'; text: string; at: string }

export interface LiveDriveDoc {
  id: string
  title: string
  owner: { kind: OwnerKind; tenant_id: string; name: string }
  links: { campus_drive_id: string | null; ats_job_id: string | null }
  test: { pattern_id: string; level: PracticeLevel; exam_name: string; company_name: string }
  schedule: DriveSchedule
  rules: DriveRules
  status: LiveDriveStatus
  invigilators: Invigilator[]
  broadcasts: Broadcast[]
  candidate_count: number
  paper_built_at: string | null
  results: { scored_at: string | null; published_at: string | null; published_count: number }
  created_by: string
  created_at: string
  updated_at: string
}

export interface SystemCheck {
  camera: boolean
  mic: boolean
  mbps: number | null
  browser_ok: boolean
  passed: boolean
  failures: string[]
  at: string
}

export interface LiveCandidateDoc {
  id: string
  drive_id: string
  user_id: string
  email: string
  name: string
  group_no: number
  invigilator_id: string | null
  source: 'campus' | 'ats' | 'manual'
  state: CandidateState
  system_check: SystemCheck | null
  started_at: string | null
  submitted_at: string | null
  auto_submitted: boolean
  extra_ms: number
  paused_ms: number
  paused_at: string | null
  last_seen_at: Date | null
  rejoin_allowed_at: string | null
  disconnects: number
  answers: Record<string, string>
  answered_count: number
  save_seq: number
  saved_at: string | null
  /** Integrity incidents counted from lib/integrity events (scoring types only). */
  flag_count: number
  flagged: { by: string; reason: string; at: string } | null
  terminated: { by: string; reason: string; at: string } | null
  inbox: InboxItem[]
  result: { percent: number; score: number; max: number; passed: boolean; sections: Array<{ id: string; name: string; percent: number; passed: boolean }> } | null
  scored_at: string | null
  published: boolean
  created_at: string
  updated_at: string
}

// ─── Pure rules ─────────────────────────────────────────────────────────────

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

export function effectiveStatus(d: Pick<LiveDriveDoc, 'status' | 'schedule'>, now: number): EffectiveDriveStatus {
  if (d.status === 'draft' || d.status === 'ended') return d.status
  return now >= ms(d.schedule.start_at) ? 'live' : 'scheduled'
}

export type JoinWindow = 'draft' | 'too_early' | 'lobby' | 'open' | 'closed' | 'ended'

/** Where the drive is for a candidate who has not started yet. */
export function joinWindow(d: Pick<LiveDriveDoc, 'status' | 'schedule'>, now: number): JoinWindow {
  if (d.status === 'draft') return 'draft'
  if (d.status === 'ended') return 'ended'
  const start = ms(d.schedule.start_at)
  if (now < start - d.schedule.lobby_open_min * 60_000) return 'too_early'
  if (now < start) return 'lobby'
  if (now <= start + d.schedule.late_join_min * 60_000) return 'open'
  return 'closed'
}

type Clock = Pick<LiveCandidateDoc, 'started_at' | 'extra_ms' | 'paused_ms' | 'paused_at'>

/**
 * The candidate's deadline (epoch ms). Added time and time spent paused push
 * it out; while paused it keeps moving with `now`. Null before the start.
 */
export function deadlineMs(c: Clock, durationMin: number, now: number): number | null {
  const started = ms(c.started_at)
  if (Number.isNaN(started)) return null
  const pausedNow = c.paused_at ? Math.max(0, now - ms(c.paused_at)) : 0
  return started + durationMin * 60_000 + Math.max(0, c.extra_ms || 0) + Math.max(0, c.paused_ms || 0) + pausedNow
}

export function remainingMs(c: Clock, durationMin: number, now: number): number | null {
  const d = deadlineMs(c, durationMin, now)
  return d === null ? null : Math.max(0, d - now)
}

/** Has the clock run out (with the submit grace)? */
export function timeUp(c: Clock & Pick<LiveCandidateDoc, 'state'>, durationMin: number, now: number, graceMs = SUBMIT_GRACE_MS): boolean {
  if (c.state !== 'in_progress') return false
  const d = deadlineMs(c, durationMin, now)
  return d !== null && now > d + graceMs
}

export function disconnectAfterMs(heartbeatSec: number): number {
  return Math.max(30_000, heartbeatSec * 1000 * MISSED_HEARTBEATS)
}

type GridInput = Pick<LiveCandidateDoc, 'state' | 'last_seen_at' | 'flagged' | 'flag_count'>

/** The control-room status of one candidate. */
export function gridStatus(c: GridInput, rules: Pick<DriveRules, 'heartbeat_sec' | 'flag_threshold'>, now: number): GridStatus {
  if (c.state === 'terminated') return 'terminated'
  if (c.state === 'submitted') return 'submitted'
  if (c.flagged || (rules.flag_threshold > 0 && (c.flag_count || 0) >= rules.flag_threshold)) return 'flagged'
  if (c.state === 'paused') return 'paused'
  if (c.state === 'in_progress') {
    const seen = c.last_seen_at ? new Date(c.last_seen_at).getTime() : NaN
    if (Number.isNaN(seen) || now - seen > disconnectAfterMs(rules.heartbeat_sec)) return 'disconnected'
    return 'in_progress'
  }
  return 'not_started'
}

export function countByStatus(statuses: GridStatus[]): Record<GridStatus, number> {
  const out = Object.fromEntries(GRID_STATUSES.map((s) => [s, 0])) as Record<GridStatus, number>
  for (const s of statuses) out[s]++
  return out
}

/**
 * May a running candidate carry on after being away? Inside the reconnect
 * window yes; after it only when an invigilator allowed a rejoin since.
 */
export function reconnectAllowed(
  c: Pick<LiveCandidateDoc, 'state' | 'last_seen_at' | 'rejoin_allowed_at'>,
  rules: Pick<DriveRules, 'reconnect_window_min'>,
  now: number,
): boolean {
  if (c.state !== 'in_progress' && c.state !== 'paused') return true
  if (!c.last_seen_at) return true
  const seen = new Date(c.last_seen_at).getTime()
  if (now - seen <= rules.reconnect_window_min * 60_000) return true
  const allowed = ms(c.rejoin_allowed_at)
  return !Number.isNaN(allowed) && allowed >= seen
}

/** Write a heartbeat only when the last one is old enough (or there is none). */
export function shouldWriteHeartbeat(lastSeen: Date | string | null | undefined, now: number, gapMs = HEARTBEAT_WRITE_GAP_MS): boolean {
  if (!lastSeen) return true
  const t = new Date(lastSeen).getTime()
  return Number.isNaN(t) || now - t >= gapMs
}

/** Was the candidate away long enough that this heartbeat is a reconnect? */
export function isReconnect(lastSeen: Date | string | null | undefined, heartbeatSec: number, now: number): boolean {
  if (!lastSeen) return false
  return now - new Date(lastSeen).getTime() > disconnectAfterMs(heartbeatSec)
}

/** Split candidates (in a stable order) into groups of `size`, groups shared round-robin by invigilators. */
export function assignGroups(candidateIds: string[], invigilatorIds: string[], size: number): Map<string, { group_no: number; invigilator_id: string | null }> {
  const n = Math.max(1, Math.floor(size))
  const out = new Map<string, { group_no: number; invigilator_id: string | null }>()
  candidateIds.forEach((id, i) => {
    const g = Math.floor(i / n) + 1
    out.set(id, { group_no: g, invigilator_id: invigilatorIds.length ? invigilatorIds[(g - 1) % invigilatorIds.length] : null })
  })
  return out
}

export interface SystemReport { camera: boolean; mic: boolean; mbps: number | null; browser_ok: boolean }

/** System check verdict. Camera needed only when the drive asks for it; slow or unknown speed fails only when measured below the minimum. */
export function systemVerdict(r: SystemReport, needs: { camera: boolean; min_mbps: number }): { passed: boolean; failures: string[] } {
  const failures: string[] = []
  if (!r.browser_ok) failures.push('browser')
  if (needs.camera && !r.camera) failures.push('camera')
  if (r.mbps !== null && Number.isFinite(r.mbps) && r.mbps < needs.min_mbps) failures.push('network')
  return { passed: failures.length === 0, failures }
}

/** Polling delay with exponential backoff after failures; slower when the tab is hidden. */
export function nextPollDelay(baseMs: number, failures: number, opts: { hidden?: boolean; maxMs?: number; jitter?: number } = {}): number {
  const max = opts.maxMs ?? 60_000
  const f = Math.max(0, Math.min(10, failures))
  let d = Math.min(max, baseMs * 2 ** f)
  if (opts.hidden) d = Math.min(max, d * 3)
  const j = opts.jitter ?? 0
  return Math.round(d * (1 + Math.max(-0.5, Math.min(0.5, j))))
}

const QID = /^[A-Za-z0-9_-]{1,128}$/

/** Keep only answers to questions on the paper, as trimmed strings. */
export function cleanAnswerPatch(raw: unknown, allowed: ReadonlySet<string>, maxLen = 20_000): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let n = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!QID.test(k) || !allowed.has(k)) continue
    const s = Array.isArray(v) ? v.map((x) => String(x ?? '')).join(', ') : typeof v === 'string' || typeof v === 'number' ? String(v) : ''
    out[k] = s.slice(0, maxLen)
    if (++n >= 500) break
  }
  return out
}

export type DriveRole = 'owner' | 'invigilator'

/** May this staff member act on this candidate? Owners: anyone. Invigilators: their own groups. */
export function canActOn(role: DriveRole, userId: string, c: Pick<LiveCandidateDoc, 'invigilator_id'>): boolean {
  return role === 'owner' || c.invigilator_id === userId
}

/** Pass mark for a drive: its own, else the pattern's. */
export function passMark(rules: Pick<DriveRules, 'pass_percent'>, patternCutoff: number): number {
  return rules.pass_percent ?? patternCutoff
}

/** Seeded order of question ids per candidate (deterministic, so a reload shows the same order). */
export function seededOrder<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let s = h >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Input schemas ──────────────────────────────────────────────────────────

const isoDate = z.string().trim().refine((s) => Number.isFinite(Date.parse(s)), 'Enter a valid date and time')
const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/)

export const rulesSchema = z.object({
  reconnect_window_min: z.number().int().min(0).max(120).optional(),
  autosave_sec: z.number().int().min(5).max(120).optional(),
  heartbeat_sec: z.number().int().min(5).max(60).optional(),
  group_size: z.number().int().min(5).max(500).optional(),
  flag_threshold: z.number().int().min(0).max(100).optional(),
  pass_percent: z.number().min(0).max(100).nullable().optional(),
  require_camera: z.boolean().optional(),
  min_mbps: z.number().min(0).max(100).optional(),
}).strict()

export const scheduleSchema = z.object({
  start_at: isoDate,
  duration_min: z.number().int().min(5).max(600),
  lobby_open_min: z.number().int().min(0).max(240).default(30),
  late_join_min: z.number().int().min(0).max(120).default(15),
}).strict()

export const createDriveSchema = z.object({
  title: z.string().trim().min(3).max(160),
  owner_kind: z.enum(OWNER_KINDS),
  /** Company drives: the hiring team's organisation (else the caller's default). */
  tenant_id: id.optional(),
  pattern_id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  level: z.enum(PRACTICE_LEVELS),
  schedule: scheduleSchema,
  rules: rulesSchema.optional(),
  campus_drive_id: id.nullish(),
  ats_job_id: id.nullish(),
}).strict()
export type CreateDriveInput = z.infer<typeof createDriveSchema>

export const updateDriveSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  schedule: scheduleSchema.optional(),
  rules: rulesSchema.optional(),
  /** draft → scheduled builds the paper; → ended closes the drive. */
  status: z.enum(DRIVE_STATUSES).optional(),
}).strict()

export const rosterSchema = z.object({
  source: z.enum(['campus', 'ats', 'emails']),
  emails: z.array(z.string().trim().toLowerCase().email().max(200)).max(MAX_ROSTER).optional(),
}).strict()

export const invigilatorsSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(200)).max(MAX_INVIGILATORS),
  group_size: z.number().int().min(5).max(500).optional(),
}).strict()

export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('warn'), message: z.string().trim().min(1).max(MAX_MESSAGE) }).strict(),
  z.object({ action: z.literal('add_time'), minutes: z.number().int().min(1).max(60), reason: z.string().trim().max(MAX_MESSAGE).optional() }).strict(),
  z.object({ action: z.literal('pause'), reason: z.string().trim().max(MAX_MESSAGE).optional() }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
  z.object({ action: z.literal('terminate'), reason: z.string().trim().min(5).max(MAX_MESSAGE) }).strict(),
  z.object({ action: z.literal('flag'), reason: z.string().trim().min(1).max(MAX_MESSAGE) }).strict(),
  z.object({ action: z.literal('unflag') }).strict(),
  z.object({ action: z.literal('allow_rejoin') }).strict(),
])
export type ActionInput = z.infer<typeof actionSchema>

export const broadcastSchema = z.object({ message: z.string().trim().min(1).max(MAX_MESSAGE) }).strict()

export const resultsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('score') }).strict(),
  z.object({
    action: z.literal('publish'),
    /** Campus drives: mark those below the pass mark as not selected. */
    reject_others: z.boolean().default(false),
    /** ATS jobs: stage to move passing candidates to. */
    stage_id: z.string().trim().max(80).optional(),
  }).strict(),
])

export const sessionSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('check'),
    camera: z.boolean(),
    mic: z.boolean(),
    mbps: z.number().min(0).max(10_000).nullable(),
    browser_ok: z.boolean(),
  }).strict(),
  z.object({ op: z.literal('start') }).strict(),
  z.object({ op: z.literal('heartbeat'), since: z.number().int().min(0).optional() }).strict(),
  z.object({ op: z.literal('save'), seq: z.number().int().min(1).max(1e9), answers: z.record(z.string().max(128), z.union([z.string().max(20_000), z.number(), z.array(z.string().max(2000)).max(50)])), since: z.number().int().min(0).optional() }).strict(),
  z.object({ op: z.literal('submit'), seq: z.number().int().min(1).max(1e9).optional(), answers: z.record(z.string().max(128), z.union([z.string().max(20_000), z.number(), z.array(z.string().max(2000)).max(50)])).optional() }).strict(),
])
export type SessionInput = z.infer<typeof sessionSchema>

/** Zod error → one sentence. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0]
  if (!i) return 'Check the form and try again'
  const path = i.path.filter((p) => typeof p === 'string').join('.')
  return path ? `${path.replace(/_/g, ' ')}: ${i.message}` : i.message
}
