/**
 * BGV input validation (pure, client-safe; tests/ats-bgv.test.ts).
 *
 * sanitizeCheckData() cleans one check's form against the catalog: unknown
 * keys dropped, strings trimmed and capped, formats checked. Sensitive values
 * (PAN, SSN, licence number) are split out to be encrypted; the data keeps a
 * mask only. Aadhaar: only the last 4 digits ever survive — a full number typed
 * anywhere in the identity / Aadhaar checks is cut down to its last 4.
 *
 * missingItems() lists what a candidate still has to provide (portal + submit).
 */
import type { BgvCheckType, BgvRegion } from '@/lib/ats/contract'
import { checkDef, PAN_RE, SSN_RE, type CheckDef, type DocDef, type FieldDef, type GroupDef } from './catalog'
import type { BgvCheck, BgvDocument } from './types'

export function isValidPan(v: unknown): boolean {
  return typeof v === 'string' && new RegExp(PAN_RE).test(v.trim().toUpperCase())
}

export function normalizeSsn(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!new RegExp(SSN_RE).test(t)) return null
  const d = t.replace(/-/g, '')
  return d.length === 9 ? d : null
}

export function maskSsn(digits: string): string {
  return `***-**-${String(digits).replace(/\D/g, '').slice(-4)}`
}

export function maskTail(v: string, keep = 4): string {
  const s = String(v)
  return s.length <= keep ? '*'.repeat(s.length) : '*'.repeat(s.length - keep) + s.slice(-keep)
}

/** Aadhaar-looking 12-digit runs (with optional spaces / dashes). */
const AADHAAR_RUN = /(?<!\d)(\d{4})[ -]?(\d{4})[ -]?(\d{4})(?!\d)/g
export function stripAadhaar(text: string): string {
  return text.replace(AADHAAR_RUN, (_m, _a, _b, c: string) => `XXXX XXXX ${c}`)
}

/** Only the last 4 digits of whatever was typed (a full Aadhaar never gets through). */
export function aadhaarLast4(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

type Values = Record<string, unknown>

/** Is a field shown / applicable given the other values? (unchecked boxes count as false) */
export function fieldActive(f: Pick<FieldDef, 'when'> | Pick<DocDef, 'when'>, values: Values): boolean {
  if (!f.when) return true
  const v = values[f.when.key]
  const cur = v === undefined || v === null || v === '' ? false : v
  return cur === f.when.equals
}

function cleanValue(f: FieldDef, raw: unknown): unknown {
  if (f.type === 'checkbox') return raw === true || raw === 'true' || raw === 'on'
  if (raw === null || raw === undefined) return undefined
  let s = String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  if (f.type !== 'textarea') s = s.replace(/\s+/g, ' ')
  if (f.upper) s = s.toUpperCase().replace(/\s+/g, '')
  s = s.slice(0, f.max ?? (f.type === 'textarea' ? 2000 : 200))
  return s === '' ? undefined : s
}

function formatError(f: FieldDef, v: unknown): string | null {
  if (v === undefined || f.type === 'checkbox') return null
  const s = String(v)
  if (f.type === 'date') {
    if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return `${f.label}: enter a valid date`
    if (f.key === 'dob' && (Date.parse(s) > Date.now() - 14 * 365 * 86_400_000 || s < '1900-01-01')) return `${f.label}: check the date`
  }
  if (f.type === 'month' && (!MONTH_RE.test(s) || Number(s.slice(5)) < 1 || Number(s.slice(5)) > 12)) return `${f.label}: enter a month (YYYY-MM)`
  if (f.type === 'select' && f.options && !f.options.some((o) => o.value === s)) return `${f.label}: choose an option`
  if (f.pattern && !new RegExp(f.pattern).test(s)) return f.patternHint || `${f.label} doesn't look right`
  return null
}

export interface SanitizedCheck {
  data: Values
  /** plaintext sensitive values to encrypt (only the ones provided this time) */
  sensitive: Record<string, string>
  errors: string[]
}

function sanitizeFields(fields: FieldDef[], raw: Values, aadhaarSafe: boolean, prefix: string, out: SanitizedCheck): Values {
  const data: Values = {}
  for (const f of fields) {
    const v = cleanValue(f, raw[f.key])
    if (f.sensitive) {
      // Empty / masked (unchanged) input: the stored value stays — the service
      // carries the stored mask + ciphertext over (never trusted from the browser).
      if (typeof v === 'string' && !v.includes('*')) {
        const err = formatError(f, v)
        if (err) { out.errors.push(prefix + err); continue }
        const plain = f.sensitive === 'ssn' ? normalizeSsn(v)! : v
        out.sensitive[f.key] = plain
        data[`${f.key}_masked`] = f.sensitive === 'ssn' ? maskSsn(plain) : maskTail(plain)
      }
      continue
    }
    if (f.key === 'last4') {
      const l4 = aadhaarLast4(v)
      if (v !== undefined && !l4) out.errors.push(prefix + (f.patternHint || 'Enter the last 4 digits'))
      if (l4) data.last4 = l4
      continue
    }
    if (v === undefined) continue
    const err = formatError(f, v)
    if (err) { out.errors.push(prefix + err); continue }
    data[f.key] = typeof v === 'string' && aadhaarSafe ? stripAadhaar(v) : v
  }
  return data
}

/**
 * Clean a check's form. `raw` is the browser's data object; with a group, its
 * items are under raw[group.key] (array). Never throws.
 */
export function sanitizeCheckData(region: BgvRegion, type: BgvCheckType, raw: unknown): SanitizedCheck {
  const out: SanitizedCheck = { data: {}, sensitive: {}, errors: [] }
  const def = checkDef(region, type)
  if (!def || !def.candidate_input) return out
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Values
  const aadhaarSafe = region === 'IN' && (type === 'aadhaar' || type === 'identity')
  out.data = sanitizeFields(def.fields, r, aadhaarSafe, '', out)
  if (def.group) {
    const items = Array.isArray(r[def.group.key]) ? (r[def.group.key] as unknown[]).slice(0, def.group.max) : []
    out.data[def.group.key] = items.map((it, i) =>
      sanitizeFields(def.group!.fields, (it && typeof it === 'object' ? it : {}) as Values, aadhaarSafe, `${def.group!.itemLabel} ${i + 1}: `, out),
    )
  }
  // Drop answers to fields that the current choices hide (e.g. Aadhaar digits after opting out).
  for (const f of def.fields) if (!fieldActive(f, out.data)) { delete out.data[f.key]; delete out.data[`${f.key}_masked`] }
  if (type === 'aadhaar' && out.data.opt_out === true) delete out.data.last4
  return out
}

// ─── Completeness ────────────────────────────────────────────────────────────

const has = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== false

function docRequired(d: DocDef, values: Values, item: number | null): boolean {
  if (!d.required || !fieldActive(d, values)) return false
  if (d.requiredWhen === 'first_item') return item === 0
  if (d.requiredWhen === 'not_current') return values.current !== true
  return true
}

function missingIn(fields: FieldDef[], docs: DocDef[], values: Values, documents: BgvDocument[], item: number | null, prefix: string): string[] {
  const out: string[] = []
  for (const f of fields) {
    if (!f.required || !fieldActive(f, values)) continue
    const v = f.sensitive ? values[`${f.key}_masked`] : values[f.key]
    if (f.type === 'checkbox' ? v !== true : !has(v)) out.push(prefix + f.label)
  }
  for (const d of docs) {
    if (!docRequired(d, values, item)) continue
    if (!documents.some((x) => x.slot === d.slot && x.item === item)) out.push(prefix + d.label)
  }
  return out
}

function monthsAgo(ym: string, now: Date): number {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m)
}

export interface CaseOptions {
  employment_years: number | null
  address_years: number | null
  references_count: number
}

/** What the candidate still has to provide for one check (empty = complete). */
export function missingItems(region: BgvRegion, check: Pick<BgvCheck, 'type' | 'data' | 'documents'>, opts: CaseOptions, now = new Date()): string[] {
  const def: CheckDef | null = checkDef(region, check.type)
  if (!def || !def.candidate_input) return []
  const data = check.data || {}
  const docs = check.documents || []
  const out = missingIn(def.fields, def.documents, data, docs, null, '')
  const g: GroupDef | undefined = def.group
  if (!g) return out
  if (def.skipGroupWith && data[def.skipGroupWith] === true) return out
  const items = (Array.isArray(data[g.key]) ? data[g.key] : []) as Values[]
  const min = check.type === 'reference' ? Math.max(1, opts.references_count || g.min) : g.min
  items.forEach((it, i) => out.push(...missingIn(g.fields, g.documents, it, docs, i, `${g.itemLabel} ${i + 1}: `)))
  if (items.length < min) out.push(min === 1 ? `Add at least one ${g.itemLabel.toLowerCase()}` : `Add at least ${min} ${g.label.toLowerCase()}`)

  if (check.type === 'education' && region === 'IN') {
    const levels = new Set(items.map((it) => it.level))
    if (!levels.has('10th')) out.push('Add your 10th')
    if (!levels.has('12th') && !levels.has('diploma')) out.push('Add your 12th or diploma')
  }
  if (check.type === 'address' && region === 'US' && opts.address_years) {
    const froms = items.map((it) => String(it.from || '')).filter((s) => MONTH_RE.test(s))
    const oldest = froms.length ? Math.max(...froms.map((f) => monthsAgo(f, now))) : 0
    if (!items.some((it) => it.current === true)) out.push('Mark your current address')
    if (items.length && oldest < opts.address_years * 12) out.push(`Add addresses covering the last ${opts.address_years} years`)
  }
  return out
}
