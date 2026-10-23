/**
 * Guardian weekly report — pure rules + summary builder + renderers (no I/O;
 * tests/guardian-summary.test.ts).
 *
 * The learner decides what is shared (`ShareSettings`); the builder drops every
 * field that isn't shared. The inputs are aggregates only: never raw answers,
 * question text, proctoring snapshots, integrity flags or unreleased scores.
 */
import { escapeHtml } from '@/lib/safe-html'
import { outboundT } from '@/lib/i18n/outbound'
import type { Locale } from '@/lib/i18n/config'

// ─── Settings ───────────────────────────────────────────────────────────────

export { SHARE_KEYS, DEFAULT_SHARE, normalizeShare, RELATIONS, MAX_GUARDIANS } from './share'
export type { ShareKey, ShareSettings, Relation } from './share'
import type { ShareSettings } from './share'

// ─── Minors ─────────────────────────────────────────────────────────────────

/**
 * Is the learner under 18 according to their profile? Uses a date of birth or birth year
 * when the profile has one, or the learner's own "I am under 18" answer. Unknown → false
 * (the learner is asked on the invite form).
 */
export function isMinorProfile(p: { date_of_birth?: unknown; dob?: unknown; birth_year?: unknown; declared_minor?: unknown } | null | undefined, now = new Date()): boolean {
  if (!p) return false
  if (p.declared_minor === true) return true
  const raw = p.date_of_birth ?? p.dob
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split('-').map(Number)
    const eighteenth = Date.UTC(y + 18, m - 1, d)
    return Number.isFinite(eighteenth) && now.getTime() < eighteenth
  }
  const by = Number(p.birth_year)
  if (Number.isInteger(by) && by > 1900) return now.getUTCFullYear() - by < 18
  return false
}

// ─── Contacts ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

export type ContactCheck = { ok: true } | { ok: false; code: 'guardian_contact_required' | 'guardian_email_invalid' | 'guardian_minor_needs_both' | 'guardian_contact_is_learner' }

/**
 * A guardian needs an email or a phone; for a minor both (the link goes by email, the
 * verification code by WhatsApp, so one person holding the learner's phone can't approve
 * themselves); and neither may be the learner's own.
 */
export function checkGuardianContact(
  g: { email?: string | null; phoneKey?: string | null },
  learner: { email?: string | null; phoneKeys?: string[] },
  minor: boolean,
): ContactCheck {
  const email = (g.email || '').trim().toLowerCase()
  if (!email && !g.phoneKey) return { ok: false, code: 'guardian_contact_required' }
  if (email && !EMAIL_RE.test(email)) return { ok: false, code: 'guardian_email_invalid' }
  if (minor && (!email || !g.phoneKey)) return { ok: false, code: 'guardian_minor_needs_both' }
  if (email && learner.email && email === learner.email.trim().toLowerCase()) return { ok: false, code: 'guardian_contact_is_learner' }
  if (g.phoneKey && (learner.phoneKeys || []).includes(g.phoneKey)) return { ok: false, code: 'guardian_contact_is_learner' }
  return { ok: true }
}

// ─── When the weekly report goes out ────────────────────────────────────────

/** Sunday 18:00 or later in the learner's time zone, once per ISO week (claimed per link). */
export const REPORT_WEEKDAY = 0
export const REPORT_HOUR = 18

export function reportDue(now: Date, tz: string, lastWeek: string | null | undefined): { due: boolean; week: string; start: string; end: string } {
  let day = now.toISOString().slice(0, 10)
  let h = now.getUTCHours()
  let dow = now.getUTCDay()
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    day = `${get('year')}-${get('month')}-${get('day')}`
    h = Number(get('hour')) % 24
    dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  } catch { /* UTC fallback */ }
  const week = isoWeek(day)
  const end = day
  const start = addDays(day, -6)
  return { due: dow === REPORT_WEEKDAY && h >= REPORT_HOUR && lastWeek !== week, week, start, end }
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)).padStart(2, '0')}`
}

// ─── Summary ────────────────────────────────────────────────────────────────

export interface SummaryInput {
  week: { start: string; end: string }
  share: ShareSettings
  /** Minutes of study-plan items marked done this week (their planned length). */
  planMinutesDone: number
  /** WhatsApp practice questions answered this week. */
  waAnswers: number
  /** Accepted practice submissions this week. */
  acceptedSubmissions: number
  /** Released test results (this week and the 4 weeks before), aggregates only. */
  tests: { title: string; score: number; max_score: number; at: string }[]
  streak: { current: number; longest: number }
  plan: { planned: number; done: number } | null
  /** The learner's upcoming drives (next 30 days). */
  drives: { title: string; start_at: string }[]
}

export interface GuardianSummary {
  week: { start: string; end: string }
  practice?: { minutes: number; sessions: number }
  tests?: { count: number; average_percent: number | null; items: { title: string; percent: number; date: string }[] }
  score_trend?: { direction: 'up' | 'down' | 'steady' | 'none'; this_week: number | null; before: number | null }
  streak?: { current: number; longest: number }
  study_plan?: { done: number; planned: number; percent: number } | null
  drives?: { title: string; date: string }[]
  /** Nothing to report this week (still sent? no — the sender skips empty summaries). */
  empty: boolean
}

const pctOf = (t: { score: number; max_score: number }) => (t.max_score > 0 ? Math.round((Math.max(0, t.score) / t.max_score) * 100) : null)
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const inWeek = (at: string, w: { start: string; end: string }) => at.slice(0, 10) >= w.start && at.slice(0, 10) <= w.end

/** Shared fields only. Practice minutes = plan item minutes done + 1 per WhatsApp answer (an estimate, labelled "about"). */
export function buildGuardianSummary(i: SummaryInput): GuardianSummary {
  const out: GuardianSummary = { week: i.week, empty: true }
  const valid = i.tests.filter((t) => t.max_score > 0 && typeof t.at === 'string')
  const thisWeek = valid.filter((t) => inWeek(t.at, i.week)).sort((a, b) => a.at.localeCompare(b.at))
  const before = valid.filter((t) => t.at.slice(0, 10) < i.week.start)
  if (i.share.practice_time) {
    const minutes = Math.max(0, Math.round(i.planMinutesDone + i.waAnswers))
    const sessions = Math.max(0, i.acceptedSubmissions + i.waAnswers)
    out.practice = { minutes, sessions }
    if (minutes || sessions) out.empty = false
  }
  if (i.share.tests) {
    const items = thisWeek.slice(-10).map((t) => ({ title: t.title.slice(0, 80), percent: pctOf(t) ?? 0, date: t.at.slice(0, 10) }))
    out.tests = { count: thisWeek.length, average_percent: avg(items.map((x) => x.percent)), items }
    if (thisWeek.length) out.empty = false
  }
  if (i.share.score_trend) {
    const a = avg(thisWeek.map((t) => pctOf(t) ?? 0))
    const b = avg(before.map((t) => pctOf(t) ?? 0))
    const direction = a === null || b === null ? 'none' : a - b >= 5 ? 'up' : b - a >= 5 ? 'down' : 'steady'
    out.score_trend = { direction, this_week: a, before: b }
    if (a !== null) out.empty = false
  }
  if (i.share.streak) {
    out.streak = { current: Math.max(0, i.streak.current), longest: Math.max(0, i.streak.longest) }
    if (i.streak.current > 0) out.empty = false
  }
  if (i.share.study_plan) {
    out.study_plan = i.plan && i.plan.planned > 0 ? { done: i.plan.done, planned: i.plan.planned, percent: Math.round((Math.min(i.plan.done, i.plan.planned) / i.plan.planned) * 100) } : null
    if (out.study_plan) out.empty = false
  }
  if (i.share.drives) {
    out.drives = i.drives.slice().sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 5).map((d) => ({ title: d.title.slice(0, 80), date: d.start_at.slice(0, 10) }))
    if (out.drives.length) out.empty = false
  }
  return out
}

// ─── Rendering ──────────────────────────────────────────────────────────────

export interface RenderContext {
  learnerName: string
  unsubscribeUrl: string
}

/** Lines in the guardian's language (shared between email and the WhatsApp fallback). */
export function summaryLines(s: GuardianSummary, locale: Locale): string[] {
  const t = outboundT('email', locale)
  const lines: string[] = []
  if (s.practice) lines.push(t('guardian.practice', { minutes: s.practice.minutes, count: s.practice.sessions }))
  if (s.tests) lines.push(s.tests.count ? t('guardian.tests', { count: s.tests.count, avg: s.tests.average_percent ?? 0 }) : t('guardian.testsNone'))
  if (s.score_trend && s.score_trend.direction !== 'none') lines.push(t(`guardian.trend.${s.score_trend.direction}`, { now: s.score_trend.this_week ?? 0, before: s.score_trend.before ?? 0 }))
  if (s.streak) lines.push(t('guardian.streak', { count: s.streak.current, longest: s.streak.longest }))
  if (s.study_plan !== undefined) lines.push(s.study_plan ? t('guardian.plan', { done: s.study_plan.done, planned: s.study_plan.planned, percent: s.study_plan.percent }) : t('guardian.planNone'))
  if (s.drives) lines.push(s.drives.length ? t('guardian.drives', { list: s.drives.map((d) => `${d.title} (${d.date})`).join(', ') }) : t('guardian.drivesNone'))
  return lines
}

export function renderGuardianEmail(s: GuardianSummary, locale: Locale, ctx: RenderContext): { subject: string; html: string; text: string } {
  const t = outboundT('email', locale)
  const name = ctx.learnerName.slice(0, 60)
  const subject = t('guardian.subject', { name, start: s.week.start, end: s.week.end })
  const lines = summaryLines(s, locale)
  const testRows = s.tests?.items.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px;border-collapse:collapse;font-size:14px">${s.tests.items
      .map((x) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e3e7f1">${escapeHtml(x.title)}</td><td style="padding:6px 0;border-bottom:1px solid #e3e7f1;text-align:right;white-space:nowrap">${x.percent}% · ${escapeHtml(x.date)}</td></tr>`)
      .join('')}</table>`
    : ''
  const body = `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(t('guardian.intro', { name, start: s.week.start, end: s.week.end }))}</p>
<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>${testRows}
<p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563">${escapeHtml(t('guardian.privacy', { name }))}</p>`
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f3f5fb">
<div style="padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1729">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e7f1;border-radius:16px;overflow:hidden">
<tr><td style="background:#2F5BE7;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">CodeSpectra</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f1729">${escapeHtml(t('guardian.heading', { name }))}</h1>${body}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e3e7f1;font-size:12px;line-height:1.6;color:#4b5563">${escapeHtml(t('guardian.reason', { name }))}<br/><a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#2F5BE7">${escapeHtml(t('guardian.unsubscribe'))}</a></td></tr>
</table></div></body></html>`
  const text = [t('guardian.heading', { name }), '', t('guardian.intro', { name, start: s.week.start, end: s.week.end }), '', ...lines.map((l) => `- ${l}`), '', t('guardian.privacy', { name }), '', `${t('guardian.unsubscribe')}: ${ctx.unsubscribeUrl}`].join('\n')
  return { subject, html, text }
}

/** Body params for the `cs_guardian_weekly` template (each ≤ 60 chars; "—" when not shared). */
export function guardianTemplateParams(s: GuardianSummary, learnerName: string): string[] {
  const dash = '—'
  return [
    learnerName.slice(0, 40),
    `${s.week.start} – ${s.week.end}`,
    s.practice ? String(s.practice.minutes) : dash,
    s.tests ? (s.tests.count ? `${s.tests.count} (${s.tests.average_percent ?? 0}%)` : '0') : dash,
    s.streak ? String(s.streak.current) : dash,
    s.study_plan ? `${s.study_plan.percent}%` : dash,
  ]
}
