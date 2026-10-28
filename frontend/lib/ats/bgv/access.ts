/**
 * Who sees what of a BGV case — pure (tests/ats-bgv.test.ts).
 *
 *   admin / recruiter  full case: per-check data (sensitive values masked),
 *                      document metadata, notes, consent, adverse action.
 *                      They verify, request info, assign vendors and decide.
 *   hiring_manager     summary: overall status + per-check status. No data,
 *                      documents or notes.
 *   interviewer        nothing.
 *   client             only the overall result ('clear' / 'consider' /
 *                      'pending') and only when the BGV stage is client_visible.
 * Ciphertext, link nonces and bookkeeping never leave the server.
 */
import type { AtsRole } from '@/lib/ats/contract'
import { CHECK_LABEL } from './catalog'
import type { BgvCaseDoc, BgvCaseStatus, BgvCheck } from './types'

export const BGV_VERIFIER_ROLES: readonly AtsRole[] = ['admin', 'recruiter']
export const canVerifyBgv = (role: AtsRole) => role === 'admin' || role === 'recruiter'
/** Revealing a full PAN / SSN / licence number: admins only (audit-logged). */
export const canRevealBgv = (role: AtsRole) => role === 'admin'

export type BgvFullView = Omit<BgvCaseDoc, 'token_nonce' | 'vendor_events' | 'sent' | 'checks' | 'entry_key'> & {
  checks: (Omit<BgvCheck, 'enc'> & { label: string })[]
  view: 'full'
}
export interface BgvSummaryView {
  view: 'summary'
  id: string
  application_id: string
  region: BgvCaseDoc['region']
  status: BgvCaseStatus
  submitted_at: string | null
  checks: { type: BgvCheck['type']; label: string; status: BgvCheck['status'] }[]
  updated_at: string
}
export interface BgvClientView {
  view: 'client'
  id: string
  result: 'clear' | 'consider' | 'pending'
}
export type BgvView = BgvFullView | BgvSummaryView | BgvClientView

export function clientResult(status: BgvCaseStatus): BgvClientView['result'] {
  if (status === 'clear') return 'clear'
  if (status === 'consider' || status === 'failed') return 'consider'
  return 'pending'
}

export function bgvViewFor(role: AtsRole, c: BgvCaseDoc): BgvView | null {
  const label = (t: BgvCheck['type']) => CHECK_LABEL(c.region, t)
  if (role === 'admin' || role === 'recruiter') {
    const { token_nonce: _n, vendor_events: _v, sent: _s, entry_key: _e, checks, ...rest } = c
    return {
      ...rest,
      view: 'full',
      checks: checks.map(({ enc: _x, ...k }) => ({ ...k, label: label(k.type) })),
    }
  }
  if (role === 'hiring_manager') {
    return {
      view: 'summary',
      id: c.id,
      application_id: c.application_id,
      region: c.region,
      status: c.status,
      submitted_at: c.submitted_at,
      checks: c.checks.map((k) => ({ type: k.type, label: label(k.type), status: k.status })),
      updated_at: c.updated_at,
    }
  }
  if (role === 'client' && c.client_visible) return { view: 'client', id: c.id, result: clientResult(c.status) }
  return null
}
