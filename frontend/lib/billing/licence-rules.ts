/**
 * College / company licences (pure). An organisation (tenant) buys a number
 * of Pro seats for a year; seats are given to people by email (CSV upload)
 * or automatically to anyone signing in with one of the org's email domains.
 * A seat grants Pro entitlements while the licence is live.
 */
import { z } from 'zod'

export const MAX_LICENCE_SEATS = 50_000
export const MAX_SEAT_ROWS = 5_000
export const LICENCE_PLAN_KEY = 'pro'

export interface LicenceLike {
  status?: string | null
  starts_at?: string | null
  ends_at?: string | null
  seats?: number | null
  seats_used?: number | null
  email_domains?: string[] | null
  auto_assign?: boolean | null
}

export function licenceLive(l: LicenceLike | null | undefined, now: Date = new Date()): boolean {
  if (!l || l.status !== 'active' || !l.ends_at) return false
  const start = l.starts_at ? Date.parse(l.starts_at) : 0
  const end = Date.parse(l.ends_at)
  return Number.isFinite(end) && end > now.getTime() && (!Number.isFinite(start) || start <= now.getTime())
}

export function seatsFree(l: LicenceLike): number {
  return Math.max(0, (Number(l.seats) || 0) - (Number(l.seats_used) || 0))
}

const EMAIL_RE = /^[^\s@,;<>"']{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,}$/

export function normEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  return EMAIL_RE.test(e) ? e : null
}

export function normDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.trim().toLowerCase().replace(/^@/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && d.length <= 253 ? d : null
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/** Does the licence's domain rule cover this email (exact domain or a sub-domain)? */
export function domainMatches(email: string, domains: string[] | null | undefined): boolean {
  const d = emailDomain(email)
  return (domains || []).some((x) => d === x || d.endsWith(`.${x}`))
}

/**
 * Emails from a CSV / pasted list: first column or any cell with an @,
 * de-duplicated, invalid rows reported (line numbers are 1-based).
 */
export function parseSeatEmails(text: string): { emails: string[]; invalid: number[]; truncated: boolean } {
  const lines = String(text || '').split(/\r?\n/)
  const seen = new Set<string>()
  const invalid: number[] = []
  let truncated = false
  lines.forEach((line, i) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (!cells.some(Boolean)) return
    const cell = cells.find((c) => c.includes('@'))
    if (!cell) {
      if (i === 0) return // header row
      invalid.push(i + 1)
      return
    }
    const e = normEmail(cell)
    if (!e) {
      invalid.push(i + 1)
      return
    }
    if (seen.size >= MAX_SEAT_ROWS) {
      truncated = true
      return
    }
    seen.add(e)
  })
  return { emails: [...seen], invalid, truncated }
}

/** Which of `emails` can get a seat now: skip ones that already hold one, stop at the free seats. */
export function planSeatAssignment(emails: string[], alreadyAssigned: Set<string>, free: number): { assign: string[]; skipped: string[]; overLimit: string[] } {
  const assign: string[] = []
  const skipped: string[] = []
  const overLimit: string[] = []
  for (const e of emails) {
    if (alreadyAssigned.has(e)) skipped.push(e)
    else if (assign.length < free) assign.push(e)
    else overLimit.push(e)
  }
  return { assign, skipped, overLimit }
}

/** Price of a licence order: seats × per-seat yearly price (minor units). */
export function licenceAmount(seats: number, perSeatMinor: number): number {
  if (!Number.isInteger(seats) || seats < 1 || !Number.isInteger(perSeatMinor) || perSeatMinor < 0) return 0
  return seats * perSeatMinor
}

/** New end date on renewal: a year after the later of now and the current end (no lost days). */
export function renewalEnd(currentEnd: string | null | undefined, now: Date = new Date()): { stillLive: boolean; end: string } {
  const cur = currentEnd ? Date.parse(currentEnd) : NaN
  const stillLive = Number.isFinite(cur) && cur > now.getTime()
  const base = stillLive ? cur : now.getTime()
  return { stillLive, end: new Date(base + 365 * 86_400_000).toISOString() }
}

export const licencePurchaseSchema = z.object({
  seats: z.coerce.number().int().min(1).max(MAX_LICENCE_SEATS),
  currency: z.enum(['INR', 'USD']),
  licence_id: z.string().uuid().optional(),
}).strict()

export const licenceSettingsSchema = z.object({
  email_domains: z.array(z.string()).max(10).optional(),
  auto_assign: z.boolean().optional(),
}).strict()
