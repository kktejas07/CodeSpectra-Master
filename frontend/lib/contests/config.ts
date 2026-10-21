/**
 * Contest input validation (pure, client-safe): the common fields (zod) and
 * the per-format config, driven by the field specs in ./formats. Saving
 * splits each format's config into what participants may see and what stays
 * in `contest_secrets` (hidden tests, flags, labels, eval sets…).
 */
import { z } from 'zod'
import { sanitizeCertificatePolicy } from '@/lib/codeathon-results'
import { FORMATS, type FieldSpec, type FormatMeta } from './formats'
import type {
  ContestDoc, ContestFormat, ContestJudging, ContestLeaderboard, ContestParticipation, ContestPhase, ContestPublicConfig,
  ContestSchedule, ContestSecretDoc, ContestTask,
} from './types'
import { isContestFormat } from './types'

// ─── Common fields ───────────────────────────────────────────────────────────

const iso = z.string().trim().min(1).max(40).refine((s) => Number.isFinite(Date.parse(s)), 'Use a valid date and time')
const optIso = z.union([iso, z.null()]).optional()

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const scheduleSchema = z.object({
  registration_opens_at: optIso,
  registration_closes_at: optIso,
  starts_at: iso,
  ends_at: iso,
  timezone: z.string().trim().max(64).optional(),
})

const rubricSchema = z.array(z.object({ name: z.string().trim().min(1).max(80), weight: z.number().int().min(1).max(100) })).max(12)

export const contestInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(240).optional(),
  description: z.string().max(20000).optional(),
  format: z.string().optional(),
  visibility: z.enum(['public', 'unlisted']).optional(),
  schedule: scheduleSchema,
  participation: z.object({
    mode: z.enum(['solo', 'team']).optional(),
    team_min: z.number().int().min(1).max(20).optional(),
    team_max: z.number().int().min(1).max(20).optional(),
    max_entries: z.number().int().min(0).max(100000).optional(),
  }).optional(),
  leaderboard: z.object({
    visibility: z.enum(['live', 'after_end', 'hidden']).optional(),
    freeze_minutes: z.number().int().min(0).max(10080).optional(),
    tie_break: z.enum(['earliest', 'fewest_attempts']).optional(),
  }).optional(),
  certificates: z.unknown().optional(),
  judging: z.object({
    rubric: rubricSchema.optional(),
    judges: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
    drop_high_low: z.boolean().optional(),
  }).optional(),
  config: z.unknown().optional(),
  prize_text: z.string().trim().max(200).optional(),
  banner_url: z.string().trim().max(500).optional(),
})

export type ContestInput = z.infer<typeof contestInputSchema>

export const DEFAULT_RUBRIC = [
  { name: 'Problem and insight', weight: 25 },
  { name: 'Solution quality', weight: 30 },
  { name: 'Feasibility', weight: 20 },
  { name: 'Clarity of the pitch', weight: 25 },
]

export interface CommonFields {
  title: string
  summary: string
  description: string
  visibility: 'public' | 'unlisted'
  schedule: ContestSchedule
  participation: ContestParticipation
  leaderboard: ContestLeaderboard
  certificates: ContestDoc['certificates']
  judging: ContestJudging
  prize_text: string
  banner_url: string
}

function zodMessage(e: z.ZodError): string {
  const i = e.issues[0]
  const path = i?.path?.join('.') || 'input'
  return `${path}: ${i?.message || 'invalid'}`
}

/** Validate the common fields. `format` decides defaults (team mode, rubric). */
export function sanitizeCommon(raw: unknown, format: ContestFormat): { ok: true; value: CommonFields } | { ok: false; error: string } {
  const parsed = contestInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) }
  const b = parsed.data
  const meta = FORMATS[format]
  const s = b.schedule
  const starts = Date.parse(s.starts_at)
  const ends = Date.parse(s.ends_at)
  if (!(ends > starts)) return { ok: false, error: 'The contest must end after it starts.' }
  if (ends - starts > 60 * 24 * 3600_000) return { ok: false, error: 'A contest can run for at most 60 days.' }
  const regOpen = s.registration_opens_at ? Date.parse(s.registration_opens_at) : null
  const regClose = s.registration_closes_at ? Date.parse(s.registration_closes_at) : null
  if (regOpen !== null && regClose !== null && regClose <= regOpen) return { ok: false, error: 'Registration must close after it opens.' }
  if (regClose !== null && regClose > ends) return { ok: false, error: 'Registration must close before the contest ends.' }
  const tz = s.timezone && isValidTimeZone(s.timezone) ? s.timezone : 'UTC'
  if (s.timezone && !isValidTimeZone(s.timezone)) return { ok: false, error: `Unknown time zone "${s.timezone}".` }

  const p = b.participation || {}
  const mode = p.mode || meta.defaultMode
  const teamMin = mode === 'team' ? Math.max(1, p.team_min ?? 1) : 1
  const teamMax = mode === 'team' ? Math.max(teamMin, p.team_max ?? 4) : 1

  const rubric = b.judging?.rubric && b.judging.rubric.length ? b.judging.rubric : meta.judged ? DEFAULT_RUBRIC : []
  if (meta.judged) {
    const sum = rubric.reduce((a, c) => a + c.weight, 0)
    if (sum !== 100) return { ok: false, error: `Rubric weights must add up to 100 (they add up to ${sum}).` }
  }
  const banner = b.banner_url || ''
  if (banner && !/^https:\/\/[^\s"'<>]+$/i.test(banner)) return { ok: false, error: 'Banner must be an https link.' }

  return {
    ok: true,
    value: {
      title: b.title,
      summary: b.summary || '',
      description: b.description || '',
      visibility: b.visibility || 'public',
      schedule: {
        registration_opens_at: s.registration_opens_at ? new Date(s.registration_opens_at).toISOString() : null,
        registration_closes_at: s.registration_closes_at ? new Date(s.registration_closes_at).toISOString() : null,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        timezone: tz,
      },
      participation: { mode, team_min: teamMin, team_max: teamMax, max_entries: p.max_entries ?? 0 },
      leaderboard: {
        visibility: b.leaderboard?.visibility || 'live',
        freeze_minutes: b.leaderboard?.freeze_minutes ?? (format === 'ctf' ? 60 : 0),
        tie_break: b.leaderboard?.tie_break || 'earliest',
      },
      certificates: sanitizeCertificatePolicy(b.certificates),
      judging: { rubric, judges: [...new Set(b.judging?.judges || [])], drop_high_low: b.judging?.drop_high_low === true },
      prize_text: b.prize_text || '',
      banner_url: banner,
    },
  }
}

export function parseFormat(v: unknown): ContestFormat | null {
  return isContestFormat(v) ? v : null
}

// ─── Format config ───────────────────────────────────────────────────────────

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

export interface TestCase { input: string; expected: string; sample: boolean }
export interface ExamplePair { input: string; output: string }
export interface EvalCase { input: string; expected: string; match: 'exact' | 'contains' | 'regex' }

export function parseTests(v: unknown): TestCase[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 50).filter((t) => t && typeof t === 'object').map((t) => {
    const r = t as Record<string, unknown>
    return { input: str(r.input ?? r.stdin, 20000), expected: str(r.expected ?? r.expected_stdout ?? r.output, 20000), sample: r.sample === true || r.is_sample === true }
  })
}

export function parseExamples(v: unknown): ExamplePair[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 10).filter((t) => t && typeof t === 'object').map((t) => {
    const r = t as Record<string, unknown>
    return { input: str(r.input, 4000), output: str(r.output ?? r.expected, 4000) }
  })
}

export function parseEvalCases(v: unknown): { cases: EvalCase[]; error?: string } {
  if (!Array.isArray(v)) return { cases: [] }
  const cases: EvalCase[] = []
  for (const t of v.slice(0, 25)) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    const match = r.match === 'contains' || r.match === 'regex' ? r.match : 'exact'
    const expected = str(r.expected, 2000)
    if (match === 'regex') {
      try { new RegExp(expected) } catch { return { cases, error: `Eval case regex "${expected.slice(0, 40)}" is not valid.` } }
    }
    cases.push({ input: str(r.input, 4000), expected, match })
  }
  return { cases }
}

function stringList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.map((x) => String(x ?? '')) : typeof v === 'string' ? v.split(/[\n,]/) : []
  return [...new Set(parts.map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9+#._-]{1,30}$/.test(s)))].slice(0, 20)
}

/** One field value, or undefined for "not given". */
function fieldValue(spec: FieldSpec, raw: unknown): { value?: unknown; error?: string } {
  if (raw === undefined) return {}
  switch (spec.type) {
    case 'text': return { value: str(raw, spec.maxLen ?? 500).trim() }
    case 'textarea': return { value: str(raw, spec.maxLen ?? 8000) }
    case 'code': return { value: str(raw, spec.maxLen ?? 20000).replace(/\r\n/g, '\n') }
    case 'flag': return { value: str(raw, 200).trim() }
    case 'csv': return { value: str(raw, spec.maxLen ?? 3_000_000) }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return { value: spec.default }
      return { value: Math.min(spec.max ?? Number.MAX_SAFE_INTEGER, Math.max(spec.min ?? -Number.MAX_SAFE_INTEGER, n)) }
    }
    case 'select': {
      const v = String(raw)
      return { value: spec.options?.some((o) => o.value === v) ? v : spec.default }
    }
    case 'boolean': return { value: raw === true || raw === 'true' }
    case 'string_list': return { value: stringList(raw) }
    case 'tests': return { value: parseTests(raw) }
    case 'examples': return { value: parseExamples(raw) }
    case 'eval_cases': {
      const r = parseEvalCases(raw)
      return r.error ? { error: r.error } : { value: r.cases }
    }
  }
}

export interface SplitConfig {
  config: ContestPublicConfig
  secret: { top: Record<string, unknown>; tasks: Record<string, Record<string, unknown>> }
  errors: string[]
}

const TASK_ID_RE = /^[a-z0-9_-]{1,40}$/

/**
 * Validate a format's config and split it. Blank secret fields keep the value
 * already in `prev` (so a flag or label set needn't be re-entered on edit).
 * Pure; `newId` makes ids for new tasks.
 */
export function splitConfig(
  format: ContestFormat,
  raw: unknown,
  prev: Pick<ContestSecretDoc, 'top' | 'tasks'> | null,
  newId: () => string,
): SplitConfig {
  const meta: FormatMeta = FORMATS[format]
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const errors: string[] = []
  const config: ContestPublicConfig = { tasks: [] }
  const secret: SplitConfig['secret'] = { top: {}, tasks: {} }

  const apply = (spec: FieldSpec, rawVal: unknown, pub: Record<string, unknown>, sec: Record<string, unknown>, prevSec: Record<string, unknown> | undefined, where: string) => {
    const { value, error } = fieldValue(spec, rawVal)
    if (error) { errors.push(`${where}: ${error}`); return }
    let v = value === undefined ? spec.default : value
    if (spec.secret) {
      const keep = prevSec && !isBlank(prevSec[spec.key]) ? prevSec[spec.key] : undefined
      if (isBlank(v) && keep !== undefined) v = keep
      // Datathon labels live parsed (`labels`), not as CSV text.
      if (spec.type === 'csv' && isBlank(v) && prevSec?.labels) { sec.labels = prevSec.labels; sec.labels_count = prevSec.labels_count; return }
      if (spec.required && isBlank(v)) { errors.push(`${where}: ${spec.label} is required.`); return }
      if (v !== undefined) sec[spec.key] = v
      if (spec.type === 'tests') {
        const samples = (v as TestCase[] | undefined || []).filter((t) => t.sample).slice(0, 5).map((t) => ({ input: t.input, expected: t.expected }))
        pub.samples = samples
        pub.test_count = (v as TestCase[] | undefined || []).length
      }
      if (spec.type === 'flag' && !isBlank(v)) pub.has_flag = true
      return
    }
    if (spec.required && isBlank(v)) { errors.push(`${where}: ${spec.label} is required.`); return }
    if (v !== undefined) pub[spec.key] = v
  }

  for (const spec of meta.top) apply(spec, r[spec.key], config, secret.top, prev?.top, 'Settings')

  if (meta.task) {
    const list = Array.isArray(r.tasks) ? r.tasks.slice(0, meta.task.max) : []
    if (list.length === 0) errors.push(`Add at least one ${meta.task.label.toLowerCase()}.`)
    const seen = new Set<string>()
    list.forEach((t, i) => {
      const tr = t && typeof t === 'object' ? (t as Record<string, unknown>) : {}
      let id = typeof tr.id === 'string' && TASK_ID_RE.test(tr.id) ? tr.id : ''
      if (!id || seen.has(id)) id = newId()
      seen.add(id)
      const pub: ContestTask = { id }
      const sec: Record<string, unknown> = {}
      for (const spec of meta.task!.fields) apply(spec, tr[spec.key], pub, sec, prev?.tasks?.[id], `${meta.task!.label} ${i + 1}`)
      config.tasks.push(pub)
      secret.tasks[id] = sec
    })
  }
  return { config, secret, errors }
}

// ─── Schedule phase ──────────────────────────────────────────────────────────

/** Where a contest is in its life (pure; derived from the schedule). */
export function contestPhase(c: Pick<ContestDoc, 'status' | 'schedule' | 'results_released'>, now = Date.now()): ContestPhase {
  if (c.status === 'draft') return 'draft'
  if (c.results_released) return 'results'
  if (c.status === 'closed') return 'closed'
  const start = Date.parse(c.schedule.starts_at)
  const end = Date.parse(c.schedule.ends_at)
  const regOpen = c.schedule.registration_opens_at ? Date.parse(c.schedule.registration_opens_at) : null
  if (now >= end) return 'ended'
  if (now >= start) return 'live'
  if (regOpen === null || now >= regOpen) return 'registration'
  return 'upcoming'
}

/** Registration is open now (pure). Late joining is allowed while live unless registration closed. */
export function registrationOpen(c: Pick<ContestDoc, 'status' | 'schedule' | 'results_released'>, now = Date.now()): boolean {
  if (c.status !== 'published' || c.results_released) return false
  const end = Date.parse(c.schedule.ends_at)
  const regOpen = c.schedule.registration_opens_at ? Date.parse(c.schedule.registration_opens_at) : null
  const regClose = c.schedule.registration_closes_at ? Date.parse(c.schedule.registration_closes_at) : end
  if (regOpen !== null && now < regOpen) return false
  return now < regClose && now < end
}

/** Submissions are accepted now (pure). */
export function submissionsOpen(c: Pick<ContestDoc, 'status' | 'schedule' | 'results_released'>, now = Date.now()): boolean {
  return contestPhase(c, now) === 'live'
}

export const PHASE_LABELS: Record<ContestPhase, string> = {
  draft: 'Draft', upcoming: 'Coming soon', registration: 'Registration open', live: 'Live', ended: 'Ended', results: 'Results out', closed: 'Closed',
}

export function slugify(s: string): string {
  return (
    s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  ) || 'contest'
}

/**
 * Config for the admin editor: public fields merged with the secrets an
 * organiser may re-read (tests, eval sets, reference code). Flags are never
 * returned (only that one is set) and datathon labels only as a row count.
 */
export function editorConfig(format: ContestFormat, config: ContestPublicConfig, secret: Pick<ContestSecretDoc, 'top' | 'tasks'> | null): Record<string, unknown> {
  const meta = FORMATS[format]
  const strip = (o: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...o }
    delete out.labels
    if (typeof out.flag === 'string') { out.flag = ''; out.flag_set = true }
    return out
  }
  const { tasks, ...top } = config
  const out: Record<string, unknown> = { ...top, ...strip(secret?.top || {}), labels_csv: '' }
  if (secret?.top?.labels_count) out.labels_count = secret.top.labels_count
  if (meta.task) out.tasks = tasks.map((t) => ({ ...t, ...strip(secret?.tasks?.[t.id] || {}) }))
  return out
}
