/**
 * Candidate compensation (contract: Compensation). Pure and client-safe — the
 * apply route, the HR form, recruiter edits and the UI share these rules
 * (unit tested in tests/ats-hr-round.test.ts).
 *
 *  - fresher:     expected CTC required; no current CTC / breakup.
 *  - experienced: current CTC (or last drawn when not currently employed)
 *                 required; breakup, expected CTC, notice optional.
 *  - currency:    ISO 4217, defaulted from the candidate's country.
 *  - period:      year (default) or month; hour only for USD (US contract roles).
 */
import type { AtsRole, Compensation, ExperienceLevel } from './contract'

export const COMP_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'] as const
export type CompPeriod = Compensation['period']
export const COMP_PERIODS: CompPeriod[] = ['year', 'month', 'hour']

/** Upper bounds per period (any currency) — catches typos like an extra zero run. */
export const COMP_MAX: Record<CompPeriod, number> = { year: 1e9, month: 1e8, hour: 1e5 }
export const MAX_NOTICE_DAYS = 365
export const MAX_COMP_HISTORY = 20

const COUNTRY_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SG: 'SGD', AU: 'AUD', CA: 'CAD',
  DE: 'EUR', FR: 'EUR', NL: 'EUR', IE: 'EUR', ES: 'EUR', IT: 'EUR',
}

export function currencyForCountry(country: string | null | undefined): string {
  return COUNTRY_CURRENCY[String(country || '').toUpperCase()] || 'USD'
}

/** Periods a candidate may pick (hourly only in US dollars, and only when the role allows it — US contract roles). */
export function periodsFor(currency: string, hourlyAllowed = true): CompPeriod[] {
  return currency === 'USD' && hourlyAllowed ? ['year', 'month', 'hour'] : ['year', 'month']
}

/** Staff roles that may read compensation (never interviewer / client). */
export const COMPENSATION_ROLES: ReadonlySet<AtsRole> = new Set(['admin', 'recruiter', 'hiring_manager'])
export const canSeeCompensation = (role: AtsRole | null | undefined) => !!role && COMPENSATION_ROLES.has(role)

// ─── Parsing ─────────────────────────────────────────────────────────────────

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** "12,50,000" / "1 200 000" / 1200000 → 1200000. NaN for junk, null for blank. */
function money(v: unknown): number | null {
  if (blank(v)) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s_]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 'on' || v === '1' || v === 'yes') return true
  if (v === false || v === 'false' || v === '0' || v === 'no') return false
  return null
}

export function parseExperienceLevel(v: unknown): ExperienceLevel | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s === 'fresher' || s === 'experienced' ? s : null
}

export interface ParseCompOptions {
  source: Compensation['source']
  /** ISO-2; picks the default currency */
  country?: string | null
  /** ISO time for confirmed_at (HR form / recruiter) */
  confirmedAt?: string | null
  /** hourly pay allowed (USD only); the public forms pass job.employment_type === 'contract'. Default true. */
  allowHourly?: boolean
}

export type CompParse = { ok: true; value: Compensation } | { ok: false; errors: string[] }

/**
 * Validate a compensation body. Amounts are whole numbers in the chosen
 * currency per period; ranges are enforced here (the server's boundary).
 */
export function parseCompensation(raw: unknown, opts: ParseCompOptions): CompParse {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: string[] = []
  const level = parseExperienceLevel(r.experience_level)
  if (!level) return { ok: false, errors: ['Tell us whether you are a fresher or experienced'] }

  const curRaw = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : ''
  if (curRaw && !(COMP_CURRENCIES as readonly string[]).includes(curRaw)) errors.push(`Choose a currency: ${COMP_CURRENCIES.join(', ')}`)
  const cur = curRaw && (COMP_CURRENCIES as readonly string[]).includes(curRaw) ? curRaw : currencyForCountry(opts.country)
  const periodRaw = typeof r.period === 'string' ? r.period.trim().toLowerCase() : ''
  const period: CompPeriod = (COMP_PERIODS as string[]).includes(periodRaw) ? (periodRaw as CompPeriod) : 'year'
  if (!periodsFor(cur, opts.allowHourly !== false).includes(period)) errors.push('Hourly pay is only available for US contract roles, in US dollars')
  const max = COMP_MAX[period]

  const amount = (v: unknown, label: string, { required, min = 0 }: { required: boolean; min?: number }): number | null => {
    const n = money(v)
    if (n === null) {
      if (required) errors.push(`Enter your ${label}`)
      return null
    }
    if (Number.isNaN(n)) { errors.push(`${label[0].toUpperCase()}${label.slice(1)} must be a number`); return null }
    if (n < min) { errors.push(`${label[0].toUpperCase()}${label.slice(1)} must be more than ${min}`); return null }
    if (n > max) { errors.push(`${label[0].toUpperCase()}${label.slice(1)} looks too high — check the amount and the period`); return null }
    return period === 'hour' ? Math.round(n * 100) / 100 : Math.round(n)
  }

  const noticeRaw = money(r.notice_days)
  let notice: number | null = null
  if (noticeRaw !== null) {
    if (Number.isNaN(noticeRaw) || noticeRaw < 0 || noticeRaw > MAX_NOTICE_DAYS) errors.push(`Notice period must be between 0 and ${MAX_NOTICE_DAYS} days`)
    else notice = Math.round(noticeRaw)
  }
  const negotiable = boolOrNull(r.negotiable)

  let value: Compensation
  if (level === 'fresher') {
    const expected = amount(r.expected_ctc, 'expected CTC', { required: true, min: 1 })
    value = {
      experience_level: 'fresher', currency: cur, period,
      current_ctc: null, currently_employed: null, breakup: null,
      expected_ctc: expected, notice_days: notice, negotiable,
      source: opts.source, confirmed_at: opts.confirmedAt ?? null,
    }
  } else {
    const employed = boolOrNull(r.currently_employed)
    const label = employed === false ? 'last drawn CTC' : 'current CTC'
    const current = amount(r.current_ctc, label, { required: true, min: 1 })
    const b = (r.breakup && typeof r.breakup === 'object' ? r.breakup : {}) as Record<string, unknown>
    const fixed = amount(b.fixed ?? r.fixed, 'fixed pay', { required: false })
    const variable = amount(b.variable ?? r.variable, 'variable pay', { required: false })
    const other = amount(b.other ?? r.other, 'other pay', { required: false })
    const parts = [fixed, variable, other].filter((x): x is number => typeof x === 'number')
    if (current !== null && parts.length && parts.reduce((a, c) => a + c, 0) > current * 1.001) {
      errors.push(`The breakup adds up to more than the ${label}`)
    }
    const expected = amount(r.expected_ctc, 'expected CTC', { required: false, min: 1 })
    value = {
      experience_level: 'experienced', currency: cur, period,
      current_ctc: current, currently_employed: employed ?? true,
      breakup: parts.length ? { fixed, variable, other } : null,
      expected_ctc: expected,
      // Not employed → nothing to serve; keep what they typed otherwise.
      notice_days: employed === false ? (notice ?? 0) : notice,
      negotiable, source: opts.source, confirmed_at: opts.confirmedAt ?? null,
    }
  }
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value }
}

// ─── Apply form mapping ──────────────────────────────────────────────────────

/** Flat apply-form fields (strings) → compensation body. Legacy names map in. */
export function applyFieldsToBody(get: (k: string) => string): Record<string, unknown> {
  const pick = (...keys: string[]) => keys.map(get).find((v) => v !== '') ?? ''
  return {
    experience_level: get('experience_level'),
    currency: get('currency'),
    period: get('period'),
    current_ctc: pick('current_ctc', 'current_salary'),
    currently_employed: get('currently_employed'),
    breakup: { fixed: get('ctc_fixed'), variable: get('ctc_variable') },
    expected_ctc: pick('expected_ctc', 'expected_salary'),
    notice_days: get('notice_days'),
    negotiable: get('negotiable'),
  }
}

const ANNUAL_FACTOR: Record<CompPeriod, number> = { year: 1, month: 12, hour: 2080 }

/** Annualise for the parsed-résumé fields screening reads (current/expected salary, notice). */
export function compensationToOverrides(c: Compensation): { notice_days?: number; current_salary?: number; expected_salary?: number } {
  const f = ANNUAL_FACTOR[c.period] || 1
  return {
    ...(typeof c.notice_days === 'number' ? { notice_days: c.notice_days } : {}),
    ...(typeof c.current_ctc === 'number' ? { current_salary: Math.round(c.current_ctc * f) } : {}),
    ...(typeof c.expected_ctc === 'number' ? { expected_salary: Math.round(c.expected_ctc * f) } : {}),
  }
}

/** New latest + history ($set payload). History is capped, newest last. */
export function withCompensation(
  app: { compensation?: Compensation | null; compensation_history?: Compensation[] },
  c: Compensation,
): { compensation: Compensation; compensation_history: Compensation[] } {
  const hist = [...(app.compensation_history || []), c].slice(-MAX_COMP_HISTORY)
  return { compensation: c, compensation_history: hist }
}

// ─── Display ─────────────────────────────────────────────────────────────────

const SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }

/** "₹12.5L / year", "$85 / hour", "AED 240,000 / year". */
export function formatMoney(n: number | null | undefined, currency: string, period?: CompPeriod): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const sym = SYMBOL[currency] ?? `${currency} `
  let body: string
  if (currency === 'INR' && n >= 100_000) body = n >= 10_000_000 ? `${+(n / 10_000_000).toFixed(2)}Cr` : `${+(n / 100_000).toFixed(2)}L`
  else body = n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })
  return `${sym}${body}${period ? ` / ${period}` : ''}`
}

/** One-line summary for cards and timelines. */
export function compensationSummary(c: Compensation | null | undefined): string {
  if (!c) return 'Not shared'
  if (c.experience_level === 'fresher') return `Fresher · expects ${formatMoney(c.expected_ctc, c.currency, c.period)}`
  const cur = `${c.currently_employed === false ? 'Last drawn' : 'Current'} ${formatMoney(c.current_ctc, c.currency, c.period)}`
  return c.expected_ctc ? `${cur} · expects ${formatMoney(c.expected_ctc, c.currency, c.period)}` : cur
}
