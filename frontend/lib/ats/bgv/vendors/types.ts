/**
 * BGV vendor adapters. A vendor receives the candidate's data (decrypted on
 * the server only), runs the checks it supports and reports per-check results
 * back — by webhook (Checkr) or by polling getStatus (scheduler sweep).
 * 'manual' does nothing: verifiers mark every check themselves.
 */
import type { BgvCheckType, BgvRegion } from '@/lib/ats/contract'
import type { BgvCaseDoc, BgvCheckStatus, BgvSettingsDoc, VendorSecrets } from '../types'

export interface VendorPii {
  first_name: string
  middle_name?: string | null
  last_name: string
  email: string | null
  phone?: string | null
  dob?: string | null
  ssn?: string | null
  zipcode?: string | null
  dl_number?: string | null
  dl_state?: string | null
}

export interface VendorContext {
  case: BgvCaseDoc
  settings: BgvSettingsDoc
  secrets: VendorSecrets
  pii: VendorPii
  /** decrypted sensitive values of one check (PAN, ID numbers). Ordering only — never logged or stored. */
  sensitive?: (type: BgvCheckType) => Promise<Record<string, string>>
}

export interface VendorCheckResult {
  type: BgvCheckType
  status: BgvCheckStatus
  notes?: string | null
  vendor_ref?: string | null
}

export interface VendorOrderResult {
  /** vendor candidate id */
  candidate_ref?: string | null
  /** vendor report / order id */
  report_ref?: string | null
  /** checks now with the vendor (status in_progress) */
  checks: BgvCheckType[]
  invitation_url?: string | null
  /** per-check vendor reference (one vendor task / order per check) */
  check_refs?: Partial<Record<BgvCheckType, string>>
  /** checks the vendor refused (stay with the verifiers); neutral reason */
  failed?: { type: BgvCheckType; message: string }[]
}

export interface VendorStatus {
  done: boolean
  checks: VendorCheckResult[]
}

export interface WebhookEvent {
  id: string
  type: string
  report_ref: string | null
  candidate_ref: string | null
  /** per-check references the event is about (looked up in checks[].vendor_ref) */
  check_refs?: string[]
  /** results carried by an authenticated event (used only when `refresh` is false) */
  check_updates?: { ref: string; status: BgvCheckStatus; notes?: string | null }[]
  /** re-read the results with getStatus (the event body is not trusted for results) */
  refresh?: boolean
}

export interface WebhookContext {
  settings: BgvSettingsDoc
  /** the callback URL as received (IDfy: shared token in the query) */
  url: URL
  /** resolved client IP ('' when unknown) */
  ip: string
}

export interface ConnectionTest {
  ok: boolean
  message: string
}

export class VendorError extends Error {
  constructor(public vendor: string, message: string, public status = 502) {
    super(message)
  }
}

export interface BgvVendor {
  id: string
  label: string
  regions: BgvRegion[]
  /** check types this vendor can run (others stay manual) */
  supports: BgvCheckType[]
  /** false for skeleton adapters that need the vendor's API access first */
  ready: boolean
  order(ctx: VendorContext): Promise<VendorOrderResult>
  getStatus(ctx: VendorContext): Promise<VendorStatus>
  /** the scheduler sweep polls getStatus for checks still with the vendor (webhook fallback) */
  poll?: boolean
  /** raw body + headers → authentic? (timing-safe) */
  verifyWebhook?(rawBody: string, headers: { get(name: string): string | null }, secrets: VendorSecrets, ctx?: WebhookContext): boolean
  parseWebhook?(rawBody: string, settings?: BgvSettingsDoc): WebhookEvent | null
  /** admin "Test connection": checks the saved credentials without ordering anything */
  testConnection?(settings: BgvSettingsDoc, secrets: VendorSecrets): Promise<ConnectionTest>
}
