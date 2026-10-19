/**
 * Checkr (US). Setup: tenant pastes the Checkr API key (and optionally a
 * separate webhook secret) in Hiring settings → Background checks, picks the
 * package slug, and registers the webhook URL
 *   {origin}/api/ats/bgv/webhooks/checkr?tenant={tenantId}
 * in the Checkr dashboard (events: report.completed, report.created,
 * invitation.completed).
 *
 * order(): POST /v1/candidates, then POST /v1/reports (mode 'report', uses the
 * data the candidate gave us) or POST /v1/invitations (mode 'invitation',
 * Checkr's own hosted form collects it). Webhook X-Checkr-Signature =
 * hex HMAC-SHA256(raw body) with the API key (or the configured secret).
 * getStatus(): GET /v1/reports/{id}?include=… and map each screening's
 * clear / consider / pending to our check statuses.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BgvCheckType } from '@/lib/ats/contract'
import type { BgvCheckStatus, VendorSecrets } from '../types'
import { VendorError, type BgvVendor, type VendorCheckResult, type VendorContext, type WebhookEvent } from './types'

const API = 'https://api.checkr.com/v1'

/** Checkr screening object key → our check type. */
export const CHECKR_SCREENINGS: Record<string, BgvCheckType> = {
  ssn_trace: 'ssn_trace',
  sex_offender_search: 'sex_offender',
  national_criminal_search: 'national_criminal',
  global_watchlist_search: 'national_criminal',
  county_criminal_searches: 'county_criminal',
  federal_criminal_search: 'federal_criminal',
  motor_vehicle_report: 'mvr',
  employment_verification: 'employment',
  education_verification: 'education',
  drug_screening: 'drug_test',
}
export const CHECKR_SUPPORTS: BgvCheckType[] = [...new Set([...Object.values(CHECKR_SCREENINGS), 'criminal' as BgvCheckType])]

/** Pure: Checkr status → ours. */
export function mapCheckrStatus(s: unknown): BgvCheckStatus {
  switch (String(s || '').toLowerCase()) {
    case 'clear': case 'complete': return 'verified'
    case 'consider': return 'discrepancy'
    case 'canceled': case 'cancelled': case 'suspended': return 'unable_to_verify'
    default: return 'in_progress'
  }
}

/** Pure: per-check results from a report object (screenings embedded via include=). */
export function checksFromReport(report: Record<string, unknown>, ordered: BgvCheckType[]): { done: boolean; checks: VendorCheckResult[] } {
  const want = new Set(ordered)
  const out = new Map<BgvCheckType, VendorCheckResult>()
  const worse = (a: BgvCheckStatus, b: BgvCheckStatus) => {
    const rank: Record<string, number> = { discrepancy: 4, unable_to_verify: 3, in_progress: 2, verified: 1 }
    return (rank[b] || 0) > (rank[a] || 0) ? b : a
  }
  for (const [key, type] of Object.entries(CHECKR_SCREENINGS)) {
    if (!want.has(type)) continue
    const raw = report[key]
    const items = (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []) as Record<string, unknown>[]
    for (const it of items) {
      const st = mapCheckrStatus(it.result ?? it.status)
      const prev = out.get(type)
      out.set(type, { type, status: prev ? worse(prev.status, st) : st, vendor_ref: typeof it.id === 'string' ? it.id : prev?.vendor_ref ?? null, notes: `Checkr: ${String(it.result ?? it.status ?? 'pending')}` })
    }
  }
  const reportStatus = String(report.result ?? report.status ?? '').toLowerCase()
  const complete = String(report.status || '').toLowerCase() === 'complete' || reportStatus === 'clear' || reportStatus === 'consider'
  // Checks the report did not break out: take the report's overall result once it is complete.
  if (complete) {
    for (const t of ordered) if (!out.has(t)) out.set(t, { type: t, status: mapCheckrStatus(reportStatus === 'consider' ? 'consider' : 'clear'), notes: `Checkr report: ${reportStatus || 'complete'}` })
  }
  return { done: complete, checks: [...out.values()] }
}

export function webhookSecret(s: VendorSecrets): string | null {
  return (s.checkr_webhook_secret || s.checkr_api_key || '').trim() || null
}

/** Pure: X-Checkr-Signature check (hex HMAC-SHA256 of the raw body). */
export function verifyCheckrSignature(rawBody: string, header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !header) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header.trim().toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}

async function call(key: string, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new VendorError('checkr', `Checkr: ${String(j.error || res.statusText || res.status).slice(0, 200)}`, res.status >= 500 ? 502 : 400)
  return j
}

const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as T

export const checkrVendor: BgvVendor = {
  id: 'checkr',
  label: 'Checkr (US)',
  regions: ['US'],
  supports: CHECKR_SUPPORTS,
  ready: true,
  async order(ctx: VendorContext) {
    const key = ctx.secrets.checkr_api_key
    if (!key) throw new VendorError('checkr', 'Add your Checkr API key in Hiring settings → Background checks first.', 400)
    const pkg = ctx.settings.checkr?.package
    if (!pkg) throw new VendorError('checkr', 'Pick the Checkr package in Hiring settings → Background checks first.', 400)
    const p = ctx.pii
    const cand = await call(key, 'POST', '/candidates', clean({
      first_name: p.first_name, middle_name: p.middle_name || undefined, no_middle_name: p.middle_name ? undefined : true,
      last_name: p.last_name, email: p.email, phone: p.phone, dob: p.dob, ssn: p.ssn, zipcode: p.zipcode,
      driver_license_number: p.dl_number, driver_license_state: p.dl_state,
      custom_id: ctx.case.id,
    }))
    const candidateId = String(cand.id || '')
    if (!candidateId) throw new VendorError('checkr', 'Checkr did not return a candidate id.')
    const work_locations = [clean({ country: 'US', state: ctx.settings.checkr?.work_state || undefined, city: ctx.settings.checkr?.work_city || undefined })]
    const checks = ctx.case.checks.filter((k) => CHECKR_SUPPORTS.includes(k.type) && k.status !== 'waived').map((k) => k.type)
    if (ctx.settings.checkr?.mode === 'invitation') {
      const inv = await call(key, 'POST', '/invitations', { candidate_id: candidateId, package: pkg, work_locations })
      return { candidate_ref: candidateId, report_ref: null, checks, invitation_url: typeof inv.invitation_url === 'string' ? inv.invitation_url : null }
    }
    const rep = await call(key, 'POST', '/reports', { candidate_id: candidateId, package: pkg, work_locations })
    return { candidate_ref: candidateId, report_ref: String(rep.id || '') || null, checks }
  },
  async getStatus(ctx: VendorContext) {
    const key = ctx.secrets.checkr_api_key
    const reportId = ctx.case.vendor_report_ref
    if (!key || !reportId) return { done: false, checks: [] }
    const include = Object.keys(CHECKR_SCREENINGS).join(',')
    const report = await call(key, 'GET', `/reports/${encodeURIComponent(reportId)}?include=${include}`)
    const ordered = ctx.case.checks.filter((k) => k.status === 'in_progress' && CHECKR_SUPPORTS.includes(k.type)).map((k) => k.type)
    return checksFromReport(report, ordered)
  },
  verifyWebhook(raw, headers, secrets) {
    return verifyCheckrSignature(raw, headers.get('x-checkr-signature'), webhookSecret(secrets))
  },
  parseWebhook(raw): WebhookEvent | null {
    try {
      const j = JSON.parse(raw) as { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } }
      const obj = j.data?.object || {}
      if (typeof j.id !== 'string' || typeof j.type !== 'string') return null
      const isReport = obj.object === 'report' || j.type.startsWith('report.')
      return {
        id: j.id,
        type: j.type,
        report_ref: isReport && typeof obj.id === 'string' ? obj.id : typeof obj.report_id === 'string' ? obj.report_id : null,
        candidate_ref: typeof obj.candidate_id === 'string' ? obj.candidate_id : null,
      }
    } catch {
      return null
    }
  },
}
