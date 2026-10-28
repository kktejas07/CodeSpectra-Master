/**
 * ATS collections (lib/ats/contract.ts types) with lazily-built indexes.
 * Every query in lib/ats/** filters by tenant_id — the indexes lead with it.
 */
import type { Collection, Db, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { AtsApplication, AtsCandidate, AtsClient, AtsJob } from './contract'

export { newId, nowIso } from '@/lib/db/ids'

/** Handler-run ledger: one row per (application, stage entry) side effect. */
export interface AtsStageRunDoc {
  key: string // `${app.id}:${stage.id}:${app.stage_entered_at}` (+ optional suffix for sub-effects)
  tenant_id: string
  application_id: string
  job_id: string
  stage_id: string
  type: string
  /** waiting: assessment invite out; submitted: taken on time, manual grading pending */
  status: 'running' | 'done' | 'failed' | 'waiting' | 'submitted'
  /** assessment: the exam + invite this entry is waiting on */
  exam_id?: string | null
  email?: string | null
  user_id?: string | null
  invite_id?: string | null
  deadline?: string | null
  /** hired: whether entering hired actually took an opening */
  decremented?: boolean
  error?: string | null
  created_at: string
  updated_at: string
}

/** Per-tenant ATS settings (rejection template etc). */
export interface AtsSettingsDoc {
  tenant_id: string
  rejection_email?: { subject: string; body: string } | null
  offer_email?: { subject: string; body: string } | null
  updated_at: string
  updated_by: string
}

const ready = new Map<string, Promise<unknown> | null>()

function lazy<T extends Document>(name: string, build: (col: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!ready.get(name)) {
      ready.set(
        name,
        build(col).catch((e) => {
          ready.set(name, null)
          console.error(`[ats] ${name} index build failed`, e)
        }),
      )
    }
    await ready.get(name)
    return col
  }
}

export const atsJobs = lazy<AtsJob>('ats_jobs', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_jobs_id' }),
    c.createIndex({ tenant_id: 1, status: 1, created_at: -1 }, { name: 'ats_jobs_tenant_status' }),
    c.createIndex({ is_public: 1, status: 1 }, { name: 'ats_jobs_public' }),
    c.createIndex({ legacy_job_id: 1 }, { name: 'ats_jobs_legacy' }),
  ]),
)

export const atsCandidates = lazy<AtsCandidate>('ats_candidates', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_candidates_id' }),
    c.createIndex(
      { tenant_id: 1, email: 1 },
      { unique: true, name: 'ats_candidates_tenant_email', partialFilterExpression: { email: { $type: 'string' } } },
    ),
    c.createIndex({ tenant_id: 1, phone: 1 }, { name: 'ats_candidates_tenant_phone' }),
    c.createIndex({ tenant_id: 1, updated_at: -1 }, { name: 'ats_candidates_tenant_recent' }),
  ]),
)

export const atsApplications = lazy<AtsApplication>('ats_applications', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_applications_id' }),
    c.createIndex({ tenant_id: 1, job_id: 1, stage_id: 1 }, { name: 'ats_applications_tenant_job_stage' }),
    c.createIndex({ job_id: 1, candidate_id: 1 }, { unique: true, name: 'ats_applications_job_candidate' }),
    c.createIndex({ tenant_id: 1, candidate_id: 1 }, { name: 'ats_applications_tenant_candidate' }),
    c.createIndex({ tenant_id: 1, 'pending_move.suggested_at': 1 }, { name: 'ats_applications_pending', sparse: true }),
    c.createIndex({ status: 1, stage_entered_at: 1 }, { name: 'ats_applications_sla' }),
  ]),
)

export const atsClients = lazy<AtsClient>('ats_clients', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ats_clients_id' }),
    c.createIndex({ tenant_id: 1, name: 1 }, { name: 'ats_clients_tenant_name' }),
  ]),
)

export const atsStageRuns = lazy<AtsStageRunDoc>('ats_stage_runs', (c) =>
  Promise.all([
    c.createIndex({ key: 1 }, { unique: true, name: 'ats_stage_runs_key' }),
    c.createIndex({ type: 1, exam_id: 1, status: 1 }, { name: 'ats_stage_runs_exam_wait' }),
    c.createIndex({ application_id: 1 }, { name: 'ats_stage_runs_app' }),
  ]),
)

export const atsSettings = lazy<AtsSettingsDoc>('ats_settings', (c) =>
  c.createIndex({ tenant_id: 1 }, { unique: true, name: 'ats_settings_tenant' }),
)

/** Tests only: forget built indexes so a fresh fake DB gets them again. */
export function __resetAtsIndexes() {
  ready.clear()
}

export const isDuplicateKey = (e: unknown) => (e as { code?: number } | null)?.code === 11000
