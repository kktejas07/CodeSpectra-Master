/**
 * WhatsApp-first practice — pure rules (no I/O, unit-tested in
 * tests/wa-practice.test.ts):
 *   - inbound command parsing (STOP / START / LANG / LEVEL / TOPIC / HELP / NEXT / MOCK / JOIN),
 *   - interactive reply ids (`wp:…`) encode / decode,
 *   - how a bank question is shown on WhatsApp (reply buttons, list or plain text),
 *   - grading a reply (the shared objective grader, lib/grading.ts),
 *   - which question to pick (Mongo filter) and when the daily question / weekly mock is due,
 *   - quiet hours + the per-user daily cap.
 */
import { compareObjectiveAnswer, optionResolvedKey } from '@/lib/grading'
import { isStopMessage, inQuietHours, localHourMinute } from '@/lib/subscriptions/filters'
import { domainBankFilter, type QuestionDomain } from '@/lib/question-bot/domains'
import type { Locale } from '@/lib/i18n/config'

// ─── Types ──────────────────────────────────────────────────────────────────

export const PRACTICE_LEVELS = ['easy', 'medium', 'hard'] as const
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number]
export const LEVEL_TO_BANK: Record<PracticeLevel, 'Easy' | 'Medium' | 'Hard'> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/** Question types that work as a WhatsApp message + one reply. */
export const PRACTICE_TYPES = ['mcq', 'true_false', 'yes_no', 'numeric', 'short_answer'] as const
const CHOICE_TYPES = new Set(['mcq', 'true_false', 'yes_no'])

export type EnrollmentStatus = 'pending' | 'active' | 'stopped' | 'revoked'

export interface WaPracticeEnrollment {
  id: string
  user_id: string
  /** E.164 (+919876543210). Never logged. */
  phone: string
  /** Digits only (opt-out key, lib/whatsapp-send phoneKey). */
  phone_key: string
  status: EnrollmentStatus
  domain: string
  level: PracticeLevel
  locale: Locale
  /** Local hour (0–23) for the daily question. */
  send_hour: number
  timezone: string
  /** Max questions per local day (daily + extra NEXT + mock questions). */
  daily_cap: number
  /** Step 1 of the double opt-in: the learner agreed in the app. */
  consent: { text: string; at: string; via: 'app'; locale: Locale } | null
  /** Step 2: the reply from the phone itself. */
  confirmed: { at: string; via: 'button' | 'text' } | null
  optin_sent: { day: string; count: number; at: string } | null
  stopped_at?: string | null
  stopped_via?: 'keyword' | 'app' | null
  last_inbound_at?: string | null
  /** Local day the daily prompt went out (claimed per day, so a retry never double-sends). */
  last_daily_day?: string | null
  /** ISO week (YYYY-Www, local) of the last weekly mock. */
  last_mock_week?: string | null
  /** Questions sent today (local day). */
  day_count?: { day: string; count: number } | null
  /** The weekly mock in progress. */
  mock?: { id: string; question_ids: string[]; index: number; correct: number; started_at: string } | null
  stats?: { answered: number; correct: number; xp: number }
  created_at: string
  updated_at: string
}

export interface WaPracticeDelivery {
  id: string
  enrollment_id: string
  user_id: string
  question_id: string
  kind: 'daily' | 'extra' | 'mock'
  mock_id?: string | null
  mock_index?: number | null
  /** Options in the order they were shown (button / list ids carry the index). */
  options: string[]
  local_day: string
  sent_at: string
  answered_at: string | null
  correct: boolean | null
}

export interface PracticeSettings {
  enabled: boolean
  /** Quiet hours (learner's local time) — nothing is sent from start to end (wraps midnight). */
  quiet_start_hour: number
  quiet_end_hour: number
  /** Highest daily cap a learner may choose. */
  max_daily_cap: number
  default_daily_cap: number
  /** Local weekday of the weekly mini mock (0 = Sunday). */
  mock_weekday: number
  mock_size: number
  xp_correct: number
  xp_mock_complete: number
  /** Inbound messages per phone per 10 minutes before we stop answering. */
  inbound_per_10min: number
  templates: { optin: string; daily: string; mock: string }
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  enabled: true,
  quiet_start_hour: 21,
  quiet_end_hour: 8,
  max_daily_cap: 10,
  default_daily_cap: 3,
  mock_weekday: 0,
  mock_size: 5,
  xp_correct: 5,
  xp_mock_complete: 15,
  inbound_per_10min: 30,
  templates: { optin: 'cs_practice_optin', daily: 'cs_practice_daily', mock: 'cs_practice_mock' },
}

const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : def
}

/** Validate stored / admin-supplied settings onto the defaults. */
export function normalizePracticeSettings(raw: unknown): PracticeSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_PRACTICE_SETTINGS
  const t = (r.templates && typeof r.templates === 'object' ? r.templates : {}) as Record<string, unknown>
  const tpl = (v: unknown, def: string) => (typeof v === 'string' && TEMPLATE_NAME.test(v) ? v : def)
  const max = int(r.max_daily_cap, 1, 20, d.max_daily_cap)
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    quiet_start_hour: int(r.quiet_start_hour, 0, 23, d.quiet_start_hour),
    quiet_end_hour: int(r.quiet_end_hour, 0, 23, d.quiet_end_hour),
    max_daily_cap: max,
    default_daily_cap: Math.min(max, int(r.default_daily_cap, 1, 20, d.default_daily_cap)),
    mock_weekday: int(r.mock_weekday, 0, 6, d.mock_weekday),
    mock_size: int(r.mock_size, 3, 10, d.mock_size),
    xp_correct: int(r.xp_correct, 0, 100, d.xp_correct),
    xp_mock_complete: int(r.xp_mock_complete, 0, 500, d.xp_mock_complete),
    inbound_per_10min: int(r.inbound_per_10min, 5, 200, d.inbound_per_10min),
    templates: { optin: tpl(t.optin, d.templates.optin), daily: tpl(t.daily, d.templates.daily), mock: tpl(t.mock, d.templates.mock) },
  }
}

// ─── Commands ───────────────────────────────────────────────────────────────

export type PracticeCommand =
  | { kind: 'stop' }
  | { kind: 'start' }
  | { kind: 'join' }
  | { kind: 'decline' }
  | { kind: 'lang'; locale: Locale | null }
  | { kind: 'level'; level: PracticeLevel | null }
  | { kind: 'topic'; query: string | null }
  | { kind: 'topic_pick'; domain: string }
  | { kind: 'help' }
  | { kind: 'next' }
  | { kind: 'get' }
  | { kind: 'mock' }
  | { kind: 'answer'; deliveryId: string | null; optionIndex: number | null; text: string }

const LANG_WORDS: Record<string, Locale> = {
  en: 'en', english: 'en', eng: 'en',
  hi: 'hi', hindi: 'hi', 'हिंदी': 'hi', 'हिन्दी': 'hi',
  te: 'te', telugu: 'te', 'తెలుగు': 'te',
}

/** Reply-button / list-row id → command (ids we created; anything else is ignored). */
export function parseReplyId(id: string | null | undefined): PracticeCommand | null {
  const v = String(id || '')
  if (!v.startsWith('wp:')) return null
  if (v === 'wp:join') return { kind: 'join' }
  if (v === 'wp:no') return { kind: 'decline' }
  if (v === 'wp:get') return { kind: 'get' }
  if (v === 'wp:next') return { kind: 'next' }
  if (v === 'wp:mock') return { kind: 'mock' }
  if (v === 'wp:stop') return { kind: 'stop' }
  let m = /^wp:a:([A-Za-z0-9_-]{6,64}):(\d{1,2})$/.exec(v)
  if (m) return { kind: 'answer', deliveryId: m[1], optionIndex: Number(m[2]), text: '' }
  m = /^wp:t:([a-z0-9_]{1,40})$/.exec(v)
  if (m) return { kind: 'topic_pick', domain: m[1] }
  m = /^wp:l:(easy|medium|hard)$/.exec(v)
  if (m) return { kind: 'level', level: m[1] as PracticeLevel }
  return null
}

export const answerReplyId = (deliveryId: string, index: number) => `wp:a:${deliveryId}:${index}`

/** Inbound text → command. Anything that isn't a keyword is an answer to the open question. */
export function parseCommand(input: { text?: string | null; replyId?: string | null }): PracticeCommand {
  const byId = parseReplyId(input.replyId)
  if (byId) return byId
  const raw = String(input.text || '').normalize('NFKC').trim()
  if (isStopMessage(raw)) return { kind: 'stop' }
  const t = raw.toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ')
  if (/^(start|unstop|resume)$/.test(t)) return { kind: 'start' }
  if (/^(join|yes)$/.test(t)) return { kind: 'join' }
  if (/^(help|menu|commands|\?)$/.test(t)) return { kind: 'help' }
  if (/^(next|more|question|q)$/.test(t)) return { kind: 'next' }
  if (/^(mock|mock test|weekly mock)$/.test(t)) return { kind: 'mock' }
  let m = /^(?:lang|language|bhasha|भाषा|భాష)(?:\s+(\S+))?$/.exec(t)
  if (m) return { kind: 'lang', locale: m[1] ? LANG_WORDS[m[1]] ?? null : null }
  m = /^level(?:\s+(\S+))?$/.exec(t)
  if (m) return { kind: 'level', level: (PRACTICE_LEVELS as readonly string[]).includes(m[1] || '') ? (m[1] as PracticeLevel) : null }
  m = /^(?:topic|topics|domain)(?:\s+(.{1,60}))?$/.exec(t)
  if (m) return { kind: 'topic', query: m[1]?.trim() || null }
  return { kind: 'answer', deliveryId: null, optionIndex: null, text: raw.slice(0, 500) }
}

/** TOPIC <words> → the best matching active domain (id, then label words), or null. */
export function matchDomain(query: string, domains: Pick<QuestionDomain, 'id' | 'label'>[]): string | null {
  const q = query.toLowerCase().replace(/[^a-z0-9&+ ]+/g, ' ').trim()
  if (!q) return null
  const slug = q.replace(/[^a-z0-9]+/g, '_')
  const exact = domains.find((d) => d.id === slug || d.label.toLowerCase() === q)
  if (exact) return exact.id
  const hit = domains.find((d) => d.label.toLowerCase().includes(q) || d.id.includes(slug))
  return hit?.id ?? null
}

// ─── Showing a question ─────────────────────────────────────────────────────

export interface PracticeQuestion {
  id: string
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  tolerance?: number
}

export type RenderedQuestion =
  | { mode: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { mode: 'list'; body: string; buttonLabel: string; rows: { id: string; title: string; description?: string }[] }
  | { mode: 'text'; body: string }

const LETTERS = 'ABCDEFGHIJ'
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function questionOptions(q: Pick<PracticeQuestion, 'type' | 'options'>): string[] {
  if (Array.isArray(q.options) && q.options.length) return q.options.map((o) => String(o)).slice(0, 10)
  if (q.type === 'true_false') return ['True', 'False']
  if (q.type === 'yes_no') return ['Yes', 'No']
  return []
}

export function isChoiceQuestion(q: Pick<PracticeQuestion, 'type'>): boolean {
  return CHOICE_TYPES.has(q.type)
}

/**
 * WhatsApp shape for a question. ≤3 short options → reply buttons with the option text;
 * otherwise a list (A, B, C… rows) with the options also written in the body; numeric /
 * short answer → text ("reply with your answer"). `labels` are already in the learner's language.
 */
export function renderQuestion(
  q: PracticeQuestion,
  deliveryId: string,
  options: string[],
  labels: { header: string; replyHint: string; choose: string },
): RenderedQuestion {
  const head = labels.header ? `*${labels.header}*\n\n` : ''
  const prompt = clip(String(q.question || '').trim(), 700)
  if (!isChoiceQuestion(q) || options.length < 2) {
    return { mode: 'text', body: clip(`${head}${prompt}\n\n${labels.replyHint}`, 1024) }
  }
  const short = options.length <= 3 && options.every((o) => o.length <= 20)
  if (short) {
    return { mode: 'buttons', body: clip(`${head}${prompt}`, 1024), buttons: options.map((o, i) => ({ id: answerReplyId(deliveryId, i), title: o })) }
  }
  const lines = options.map((o, i) => `${LETTERS[i]}. ${clip(o, 120)}`).join('\n')
  const body = clip(`${head}${prompt}\n\n${lines}`, 1024)
  if (options.length <= 3) {
    return { mode: 'buttons', body, buttons: options.map((_, i) => ({ id: answerReplyId(deliveryId, i), title: LETTERS[i] })) }
  }
  return {
    mode: 'list',
    body,
    buttonLabel: labels.choose,
    rows: options.map((o, i) => ({ id: answerReplyId(deliveryId, i), title: LETTERS[i], description: clip(o, 72) })),
  }
}

// ─── Grading ────────────────────────────────────────────────────────────────

export interface GradedReply {
  correct: boolean
  /** What the learner picked / typed (for the reply; never logged). */
  given: string
  /** Correct answer as shown to the learner. */
  correctAnswer: string
}

/** The option a typed reply points at: "B", "b)", "2" or the option text. */
export function optionFromText(text: string, options: string[]): number | null {
  const v = text.trim().replace(/[).:\s]+$/, '').replace(/^\(/, '')
  if (/^[A-Ja-j]$/.test(v)) {
    const i = v.toUpperCase().charCodeAt(0) - 65
    return i < options.length ? i : null
  }
  if (/^\d{1,2}$/.test(v)) {
    const i = Number(v) - 1
    return i >= 0 && i < options.length ? i : null
  }
  const k = optionResolvedKey(text, options)
  return k ? Number(k.slice(4)) : null
}

/** Grade one reply with the same deterministic grader the tests use. */
export function gradeReply(q: PracticeQuestion, options: string[], reply: { optionIndex: number | null; text: string }): GradedReply | null {
  const spec = { type: q.type, options, answer: q.answer, tolerance: q.tolerance }
  const key = optionResolvedKey(String(q.answer || ''), options)
  const correctAnswer = key ? options[Number(key.slice(4))] : String(q.answer || '')
  if (isChoiceQuestion(q) && options.length >= 2) {
    const idx = reply.optionIndex ?? optionFromText(reply.text, options)
    if (idx === null || idx < 0 || idx >= options.length) return null
    const given = options[idx]
    return { correct: compareObjectiveAnswer(spec, given).correct, given, correctAnswer }
  }
  const given = reply.text.trim()
  if (!given) return null
  return { correct: compareObjectiveAnswer(spec, given).correct, given, correctAnswer }
}

// ─── Picking questions ──────────────────────────────────────────────────────

/** Approved, active bank rows of the learner's domain + level that fit a WhatsApp message. */
export function questionFilter(
  e: Pick<WaPracticeEnrollment, 'domain' | 'level'>,
  domain: Pick<QuestionDomain, 'id' | 'kind' | 'branch'> | null,
  excludeIds: string[] = [],
): Record<string, unknown> {
  const and: Record<string, unknown>[] = [
    { is_active: true },
    { review_status: { $ne: 'draft' } },
    { type: { $in: [...PRACTICE_TYPES] } },
    { difficulty: LEVEL_TO_BANK[e.level] },
    { $or: [{ image_url: { $exists: false } }, { image_url: null }, { image_url: '' }] },
  ]
  if (domain) and.push(domainBankFilter(domain))
  if (excludeIds.length) and.push({ id: { $nin: excludeIds.slice(0, 500) } })
  return { $and: and }
}

// ─── When to send ───────────────────────────────────────────────────────────

/** Local calendar day YYYY-MM-DD. */
export function localDayOf(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** ISO week key (YYYY-Www) of a local day. */
export function isoWeekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function isQuiet(now: Date, tz: string, s: Pick<PracticeSettings, 'quiet_start_hour' | 'quiet_end_hour'>): boolean {
  return inQuietHours(now, tz || 'UTC', s.quiet_start_hour, s.quiet_end_hour)
}

/** A send hour the learner may choose (not inside quiet hours). */
export function sendHourAllowed(hour: number, s: Pick<PracticeSettings, 'quiet_start_hour' | 'quiet_end_hour'>): boolean {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false
  const { quiet_start_hour: a, quiet_end_hour: b } = s
  if (a === b) return true
  return a < b ? !(hour >= a && hour < b) : !(hour >= a || hour < b)
}

export function questionsLeftToday(e: Pick<WaPracticeEnrollment, 'day_count' | 'daily_cap'>, day: string): number {
  const used = e.day_count?.day === day ? e.day_count.count : 0
  return Math.max(0, e.daily_cap - used)
}

export type DuePrompt = { kind: 'daily' | 'mock'; day: string; week: string } | null

/**
 * What the hourly tick should send this learner now: the weekly mock on mock day, else the
 * daily question — at the learner's hour, once per local day, never in quiet hours, never
 * when today's cap is used up.
 */
export function duePrompt(e: WaPracticeEnrollment, now: Date, s: PracticeSettings): DuePrompt {
  if (e.status !== 'active' || !e.confirmed) return null
  const tz = e.timezone || 'Asia/Kolkata'
  const { h, dow } = localHourMinute(now, tz)
  if (h !== e.send_hour) return null
  if (isQuiet(now, tz, s)) return null
  const day = localDayOf(now, tz)
  if (e.last_daily_day === day) return null
  if (questionsLeftToday(e, day) <= 0) return null
  const week = isoWeekKey(day)
  const mock = dow === s.mock_weekday && e.last_mock_week !== week && questionsLeftToday(e, day) >= s.mock_size
  return { kind: mock ? 'mock' : 'daily', day, week }
}

export const DEFAULT_PRACTICE_TZ = 'Asia/Kolkata'

/**
 * AUTO-082: the Mongo filter for enrolments whose local send hour is NOW, so
 * an hourly run reads only rows that are due (no 5,000-row cap, no paging gaps).
 * `timezones` are the distinct values stored on active rows; rows without one
 * use the same default as duePrompt.
 */
export function dueEnrollmentFilter(timezones: Array<string | null | undefined>, now: Date): Record<string, unknown> {
  const or: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const raw of timezones) {
    const stored = typeof raw === 'string' ? raw : ''
    const tz = stored || DEFAULT_PRACTICE_TZ
    if (seen.has(stored)) continue
    seen.add(stored)
    const { h } = localHourMinute(now, tz)
    const day = localDayOf(now, tz)
    const tzMatch = stored ? { timezone: stored } : { timezone: { $in: [null, ''] } }
    or.push({ ...tzMatch, send_hour: h, last_daily_day: { $ne: day } })
  }
  if (!or.length) return { _id: { $exists: false } }
  return { status: 'active', confirmed: { $ne: null }, $or: or }
}

/** Meta lets us send free-form / interactive messages only within 24 h of the person's last message. */
export function inSession(lastInboundAt: string | null | undefined, now: Date): boolean {
  if (!lastInboundAt) return false
  const t = Date.parse(lastInboundAt)
  return Number.isFinite(t) && now.getTime() - t < 24 * 3600_000 - 60_000
}

/** Opt-in messages a learner may trigger per day (resend button). */
export const MAX_OPTIN_PER_DAY = 3

export function canResendOptin(e: Pick<WaPracticeEnrollment, 'optin_sent'>, day: string): boolean {
  return !e.optin_sent || e.optin_sent.day !== day || e.optin_sent.count < MAX_OPTIN_PER_DAY
}
