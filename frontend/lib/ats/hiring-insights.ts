/**
 * Employer hiring analytics — pure shaping of aggregated rows
 * (tests/hiring-insights.test.ts). The Mongo pipelines live in
 * ./hiring-insights-server.ts; nothing here touches the database.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { median } from './analytics'

export const INSIGHT_SECTIONS = ['funnel', 'sources', 'offers', 'tests', 'interviewers', 'performance'] as const
export type InsightSection = (typeof INSIGHT_SECTIONS)[number]

export interface InsightFilters {
  job_id: string | null
  client_id: string | null
  /** ISO date-time bounds on application created_at (inclusive from, exclusive to). */
  from: string | null
  to: string | null
}

const ID = /^[A-Za-z0-9_-]{1,128}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Query string → filters. Unknown / malformed values are dropped (never passed to Mongo). */
export function parseFilters(sp: URLSearchParams, now = new Date()): InsightFilters {
  const id = (k: string) => { const v = sp.get(k); return v && ID.test(v) ? v : null }
  const day = (k: string) => { const v = sp.get(k); return v && DAY_RE.test(v) && Number.isFinite(Date.parse(v)) ? v : null }
  let from = day('from')
  let to = day('to')
  const preset = sp.get('preset')
  if (!from && preset && /^(7|30|90|180|365)d$/.test(preset)) from = new Date(now.getTime() - parseInt(preset, 10) * 86_400_000).toISOString().slice(0, 10)
  if (from && to && from > to) [from, to] = [to, from]
  return {
    job_id: id('job_id'),
    client_id: id('client_id'),
    from: from ? `${from}T00:00:00.000Z` : null,
    to: to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString() : null,
  }
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)

// ─── Funnel ──────────────────────────────────────────────────────────────────

export interface FunnelStage { key: string; name: string; type: string }
export interface FunnelRowOut {
  key: string
  name: string
  type: string
  reached: number
  conversion_pct: number | null
  /** Share of the previous stage's candidates who never reached this one. */
  dropoff_pct: number | null
  median_days: number | null
}

export function funnelRows(stages: readonly FunnelStage[], reached: ReadonlyMap<string, number>, days: ReadonlyMap<string, number[]>): FunnelRowOut[] {
  let prev: number | null = null
  return stages.map((s) => {
    const n = reached.get(s.key) ?? 0
    const conv = prev === null ? null : pct(n, prev)
    const row: FunnelRowOut = {
      key: s.key, name: s.name, type: s.type, reached: n,
      conversion_pct: conv,
      dropoff_pct: conv === null ? null : Math.round((100 - conv) * 10) / 10,
      median_days: r1(median(days.get(s.key) ?? [])),
    }
    prev = n
    return row
  })
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export interface SourceAgg { source: string; total: number; hired: number; rejected: number; active: number; reached_interview: number; match_sum: number; match_n: number }
export interface SourceRow { source: string; total: number; hired: number; hire_rate_pct: number | null; interview_rate_pct: number | null; rejected: number; active: number; avg_match: number | null; share_pct: number }

export function sourceRows(rows: readonly SourceAgg[]): SourceRow[] {
  const all = rows.reduce((n, r) => n + r.total, 0)
  return rows
    .map((r) => ({
      source: r.source || 'unknown', total: r.total, hired: r.hired, rejected: r.rejected, active: r.active,
      hire_rate_pct: pct(r.hired, r.total), interview_rate_pct: pct(r.reached_interview, r.total),
      avg_match: r.match_n ? Math.round(r.match_sum / r.match_n) : null,
      share_pct: pct(r.total, all) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
}

// ─── Offers ──────────────────────────────────────────────────────────────────

export interface OfferAgg { offered: number; accepted: number; declined: number; pending: number }
export function offerSummary(a: OfferAgg): OfferAgg & { acceptance_pct: number | null } {
  // Acceptance over decided offers only (pending ones haven't been answered yet).
  return { ...a, acceptance_pct: pct(a.accepted, a.accepted + a.declined) }
}

// ─── Interviewer calibration ─────────────────────────────────────────────────

export interface InterviewerAgg { interviewer_id: string; n: number; sum: number; sumSq: number; strong_yes: number; yes: number; no: number; strong_no: number }
export interface InterviewerRow {
  interviewer_id: string
  name: string
  scorecards: number
  mean: number | null
  sd: number | null
  /** Mean minus the panel-wide mean (positive = scores higher than colleagues). */
  offset: number | null
  yes_rate_pct: number | null
  flag: 'lenient' | 'harsh' | 'narrow' | null
}

export const CALIBRATION_MIN_N = 5

export function calibration(rows: readonly InterviewerAgg[], names: ReadonlyMap<string, string>): { overall_mean: number | null; interviewers: InterviewerRow[] } {
  const n = rows.reduce((a, r) => a + r.n, 0)
  const overall = n ? rows.reduce((a, r) => a + r.sum, 0) / n : null
  const interviewers = rows.map((r) => {
    const mean = r.n ? r.sum / r.n : null
    const variance = r.n > 1 ? (r.sumSq - (r.sum * r.sum) / r.n) / (r.n - 1) : null
    const sd = variance === null ? null : Math.sqrt(Math.max(0, variance))
    const offset = mean !== null && overall !== null ? mean - overall : null
    let flag: InterviewerRow['flag'] = null
    if (r.n >= CALIBRATION_MIN_N && offset !== null) {
      if (offset >= 0.5) flag = 'lenient'
      else if (offset <= -0.5) flag = 'harsh'
      else if (sd !== null && sd < 0.3) flag = 'narrow'
    }
    const recs = r.strong_yes + r.yes + r.no + r.strong_no
    return {
      interviewer_id: r.interviewer_id, name: names.get(r.interviewer_id) || 'Interviewer', scorecards: r.n,
      mean: mean === null ? null : Math.round(mean * 100) / 100, sd: sd === null ? null : Math.round(sd * 100) / 100,
      offset: offset === null ? null : Math.round(offset * 100) / 100,
      yes_rate_pct: pct(r.strong_yes + r.yes, recs), flag,
    }
  }).sort((a, b) => b.scorecards - a.scorecards)
  return { overall_mean: overall === null ? null : Math.round(overall * 100) / 100, interviewers }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** RFC 4180 CSV; cells that a spreadsheet would run as a formula are prefixed with ' (CSV injection). */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

// ─── Weekly digest ───────────────────────────────────────────────────────────

/** The 7 days before `now` (UTC): what the Monday digest summarises. */
export function digestRange(now: Date): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { from: new Date(to.getTime() - 7 * 86_400_000).toISOString(), to: to.toISOString() }
}

/** ISO week-ish key for idempotency (the Monday the digest covers up to). */
export function digestWeekKey(now: Date): string {
  return digestRange(now).to.slice(0, 10)
}

export function digestUnsubToken(key: Uint8Array, tenantId: string, userId: string): string {
  return createHmac('sha256', Buffer.from(key)).update(`hiring-digest:${tenantId}:${userId}`).digest('base64url').slice(0, 32)
}

export function digestUnsubTokenOk(key: Uint8Array, tenantId: string, userId: string, token: unknown): boolean {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) return false
  const a = Buffer.from(digestUnsubToken(key, tenantId, userId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface DigestNumbers {
  applications: number
  hires: number
  offers: number
  offers_accepted: number
  median_time_to_hire_days: number | null
  top_source: string | null
  open_jobs: number
}

/** Nothing happened and nothing is open: skip the email. */
export function digestWorthSending(d: DigestNumbers): boolean {
  return d.applications + d.hires + d.offers > 0 || d.open_jobs > 0
}
