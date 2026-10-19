/**
 * Background verification (BGV) — case model and settings. Pure types,
 * client-safe. Contract: BgvConfig / BgvRegion / BgvCheckType in lib/ats/contract.ts.
 *
 * Collections (lib/ats/bgv/db.ts): ats_bgv_cases, ats_bgv_files (encrypted
 * document bytes when no object storage is configured), ats_bgv_settings.
 */
import type { BgvCheckType, BgvRegion } from '@/lib/ats/contract'

export type { BgvCheckType, BgvRegion }

export type BgvCheckStatus = 'not_started' | 'submitted' | 'in_progress' | 'verified' | 'discrepancy' | 'unable_to_verify' | 'waived'
export const BGV_CHECK_STATUSES: readonly BgvCheckStatus[] = ['not_started', 'submitted', 'in_progress', 'verified', 'discrepancy', 'unable_to_verify', 'waived']
/** Verifier decisions (terminal for a check unless more info is requested). */
export const DECIDED: ReadonlySet<BgvCheckStatus> = new Set(['verified', 'discrepancy', 'unable_to_verify', 'waived'])

export type BgvCaseStatus = 'invited' | 'in_progress' | 'submitted' | 'verifying' | 'clear' | 'consider' | 'failed' | 'cancelled'

export interface BgvDocument {
  id: string
  /** catalog document slot, e.g. "pan_card", "payslips" */
  slot: string
  /** index into a repeatable group (education entry, employer…), null for check-level documents */
  item: number | null
  name: string
  type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size: number
  storage: 's3' | 'db'
  scanned: boolean
  uploaded_at: string
}

export interface BgvCheck {
  type: BgvCheckType
  status: BgvCheckStatus
  /** candidate data; sensitive values are replaced by masks (e.g. ssn_masked) */
  data: Record<string, unknown>
  /** AES-GCM box of the sensitive values (PAN, SSN, licence number). Never sent to the browser. */
  enc?: string | null
  documents: BgvDocument[]
  /** internal verifier + vendor timeline (staff only) */
  notes?: string | null
  /** latest neutral vendor finding — the only note candidate notices may quote */
  vendor_notes?: string | null
  verified_by?: string | null
  verified_at?: string | null
  vendor_ref?: string | null
  /** verifier asked for more info: the check is editable again for the candidate */
  info_request?: { message: string; at: string; by: string } | null
  updated_at: string
}

export interface BgvConsent {
  signed_at: string
  ip: string
  version: string
  name: string
  user_agent?: string | null
  /** US: the standalone FCRA disclosure was shown (separately) and acknowledged */
  disclosure_version?: string | null
  disclosure_ack_at?: string | null
  /** US: state the candidate lives / will work in (for state notices) */
  state?: string | null
  state_notice_versions?: string[] | null
  withdrawn_at?: string | null
}

export interface BgvAdverseAction {
  pre_adverse_sent_at: string | null
  /** business days between the pre-adverse and final notices */
  waiting_days: number
  /** pre-adverse + waiting_days business days */
  earliest_final_at: string | null
  final_sent_at: string | null
  reason?: string | null
  by?: string | null
  /** the waiting period ended and the recruiter was told */
  wait_over_notified?: boolean
  withdrawn_at?: string | null
}

export interface BgvCaseDoc {
  id: string
  tenant_id: string
  application_id: string
  job_id: string
  candidate_id: string
  stage_id: string
  /** engine stage-entry key (idempotent create, recordStageResult entryKey) */
  entry_key: string
  region: BgvRegion
  checks: BgvCheck[]
  critical_checks: BgvCheckType[]
  options: { employment_years: number | null; address_years: number | null; references_count: number }
  vendor: string
  /** vendor's candidate id (Checkr candidate) */
  vendor_ref?: string | null
  /** vendor's report / order id */
  vendor_report_ref?: string | null
  vendor_ordered_at?: string | null
  vendor_invitation_url?: string | null
  /** processed vendor webhook event ids (idempotency) */
  vendor_events?: string[]
  consent: BgvConsent | null
  status: BgvCaseStatus
  submitted_at: string | null
  deadline: string | null
  /** portal link nonce; rotating it kills older links */
  token_nonce: string
  reminders_sent: number
  last_reminder_at: string | null
  /** consider → recruiter decision; clear → automatic */
  decision?: { outcome: 'pass' | 'fail'; by: string; at: string; note?: string | null } | null
  adverse_action?: BgvAdverseAction | null
  /** outcome sent to the engine (once) */
  result_recorded?: 'pass' | 'fail' | null
  /** idempotent side effects: "invite", "consider_notice", ... */
  sent: string[]
  /** snapshot for messages */
  candidate_name: string
  candidate_email: string | null
  job_title: string
  stage_name: string
  client_visible: boolean
  closed_at: string | null
  /** when the case last entered 'consider' (auto-closed after CONSIDER_MAX_DAYS) */
  consider_at?: string | null
  /** last candidate self-service link resend (per-case throttle) */
  link_resent_at?: string | null
  /** an erase whose file deletes failed: the files still to delete (retried by the sweep) */
  purge_pending?: { reason: 'retention' | 'candidate_request'; docs: Pick<BgvDocument, 'id' | 'storage'>[]; at: string } | null
  /** retention purge ran: documents + data deleted, outcome kept */
  purged_at?: string | null
  purge_reason?: 'retention' | 'candidate_request' | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface BgvTextVersion {
  version: string
  text: string
  updated_at: string
  updated_by?: string | null
}

export interface BgvStateNotice {
  state: string // e.g. "CA", "NY"
  title: string
  text: string
  version: string
}

export interface BgvRegionSettings {
  default_checks: BgvCheckType[]
  critical_checks: BgvCheckType[]
  /** India: DPDP consent notice. US: written authorization text. */
  consent: BgvTextVersion
  /** US only: standalone FCRA disclosure (nothing else on that page) */
  disclosure?: BgvTextVersion | null
  /** US only: state notices (placeholder text — review with counsel) */
  state_notices?: BgvStateNotice[]
  /** older versions (kept so a signed consent can be traced to its text) */
  history?: { kind: 'consent' | 'disclosure'; version: string; text: string; updated_at: string }[]
}

export interface BgvSettingsDoc {
  tenant_id: string
  regions: Record<BgvRegion, BgvRegionSettings>
  retention_days: number
  reminder_every_days: number
  max_reminders: number
  form_deadline_days: number
  adverse_waiting_days: number
  /** encrypted vendor credentials: { checkr_api_key, checkr_webhook_secret } */
  vendor_secret?: string | null
  checkr?: { package: string | null; mode: 'report' | 'invitation'; work_state: string | null; work_city: string | null } | null
  updated_at: string
  updated_by: string
}

export interface VendorSecrets {
  checkr_api_key?: string | null
  checkr_webhook_secret?: string | null
}
