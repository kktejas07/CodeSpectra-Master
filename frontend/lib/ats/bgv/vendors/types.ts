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
  /** raw body + headers → authentic? (timing-safe) */
  verifyWebhook?(rawBody: string, headers: { get(name: string): string | null }, secrets: VendorSecrets): boolean
  parseWebhook?(rawBody: string): WebhookEvent | null
}
