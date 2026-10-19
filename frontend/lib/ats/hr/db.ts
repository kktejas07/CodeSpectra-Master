/**
 * `ats_hr_forms`: one compensation-confirmation form per HR-round stage entry.
 * Server only; send to the browser through publicHrForm().
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { HrDecision } from './rules'

export { newId, nowIso } from '@/lib/db/ids'

export interface AtsHrFormDoc {
  id: string
  tenant_id: string
  application_id: string
  job_id: string
  candidate_id: string
  stage_id: string
  /** stage entry key (unique) — one form per entry */
  entry_key: string
  collect: boolean
  /** not_sent: collect off or no email on file */
  status: 'not_sent' | 'sent' | 'submitted' | 'expired'
  token_nonce: string
  sent_at: string | null
  deadline: string | null
  remind_at: string | null
  reminded_at: string | null
  submitted_at: string | null
  /** times the candidate submitted (they may correct it until HR decides) */
  submissions: number
  hr_interview_id?: string | null
  decision?: {
    decision: HrDecision
    notes: string | null
    offered_ctc: number | null
    currency: string | null
    period: string | null
    override_reason: string | null
    by: string
    at: string
  } | null
  created_at: string
  updated_at: string
}

let ready: Promise<unknown> | null = null

export async function atsHrForms(): Promise<Collection<AtsHrFormDoc>> {
  const col = (await getMongoDb()).collection<AtsHrFormDoc>('ats_hr_forms')
  if (!ready) {
    ready = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'ats_hr_forms_id' }),
      col.createIndex({ entry_key: 1 }, { unique: true, name: 'ats_hr_forms_entry' }),
      col.createIndex({ tenant_id: 1, application_id: 1, created_at: -1 }, { name: 'ats_hr_forms_app' }),
      col.createIndex({ status: 1, remind_at: 1 }, { name: 'ats_hr_forms_due' }),
    ]).catch((e) => {
      ready = null
      console.error('[ats/hr] index build failed', e)
    })
  }
  await ready
  return col
}

/** Tests only. */
export function __resetHrIndexes() {
  ready = null
}

/** What the recruiter UI gets (no nonce). */
export function publicHrForm(f: AtsHrFormDoc | null) {
  if (!f) return null
  const { token_nonce: _n, ...rest } = f
  void _n
  return rest
}
