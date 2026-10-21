/**
 * Locale-aware formatting through Intl (pure, client-safe). Indian region tags
 * (en-IN / hi-IN / te-IN) give lakh/crore grouping and ₹; digits stay Latin,
 * which is what students read in both languages.
 */
import { LOCALE_META, type Locale } from './config'

const tag = (locale: Locale) => LOCALE_META[locale].intl

export function formatNumber(locale: Locale, n: number, opts?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(tag(locale), opts).format(n)
}

export function formatPercent(locale: Locale, ratio: number, digits = 0): string {
  return formatNumber(locale, ratio, { style: 'percent', maximumFractionDigits: digits })
}

export function formatCurrency(locale: Locale, amount: number, currency = 'INR'): string {
  const whole = Number.isInteger(amount)
  return formatNumber(locale, amount, { style: 'currency', currency, maximumFractionDigits: whole ? 0 : 2 })
}

type DateInput = Date | string | number

function toDate(d: DateInput): Date | null {
  const v = d instanceof Date ? d : new Date(d)
  return Number.isNaN(v.getTime()) ? null : v
}

export function formatDate(locale: Locale, d: DateInput, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const v = toDate(d)
  return v ? new Intl.DateTimeFormat(tag(locale), opts).format(v) : '—'
}

export function formatDateTime(locale: Locale, d: DateInput, timeZone?: string): string {
  return formatDate(locale, d, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) })
}

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
]

/** "3 days ago" / "in 2 hours" in the locale. */
export function formatRelative(locale: Locale, d: DateInput, now: DateInput = Date.now()): string {
  const v = toDate(d)
  const n = toDate(now)
  if (!v || !n) return '—'
  const diff = Math.round((v.getTime() - n.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' })
  for (const [unit, secs] of REL_UNITS) {
    if (Math.abs(diff) >= secs || unit === 'second') return rtf.format(Math.round(diff / secs), unit)
  }
  return rtf.format(0, 'second')
}

export function formatList(locale: Locale, items: string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(tag(locale), { style: 'long', type }).format(items)
}

/** Countdown clock "1:05:09" / "05:09" (digits are locale-neutral on purpose). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(tag(locale)).select(count)
}
