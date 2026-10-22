/**
 * Live drive collections + indexes (server only). Indexes are built once per
 * process on first use (createIndex is idempotent).
 *
 *   live_drives             one per drive (settings, schedule, invigilators, broadcasts)
 *   live_drive_candidates   one per drive + candidate (clock, answers, inbox, result)
 *   live_drive_papers       the frozen question paper of a drive (answer keys stay server-side)
 *   live_drive_actions      audit trail of every invigilator action
 * Also adds an index on integrity_events for the control-room flags stream.
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import type { LiveCandidateDoc, LiveDriveDoc } from './types'
import type { SnapshotQuestion } from '@/lib/company-tests/practice'

export interface PaperSection { id: string; name: string; cutoffPercent: number; questions: SnapshotQuestion[] }
export interface PaperDoc {
  drive_id: string
  sections: PaperSection[]
  negative_marking: number
  cutoff_percent: number
  version_revision: number
  built_at: string
}

export interface ActionDoc {
  id: string
  drive_id: string
  candidate_id: string | null
  actor_id: string
  action: string
  reason: string | null
  params: Record<string, unknown>
  at: string
}

let indexes: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      await Promise.all([
        db.collection('live_drives').createIndex({ id: 1 }, { unique: true, name: 'live_drives_id' }),
        db.collection('live_drives').createIndex({ 'owner.tenant_id': 1, 'schedule.start_at': -1 }, { name: 'live_drives_owner' }),
        db.collection('live_drives').createIndex({ 'invigilators.user_id': 1 }, { name: 'live_drives_invigilator' }),
        db.collection('live_drive_candidates').createIndex({ id: 1 }, { unique: true, name: 'ldc_id' }),
        db.collection('live_drive_candidates').createIndex({ drive_id: 1, user_id: 1 }, { unique: true, name: 'ldc_drive_user' }),
        db.collection('live_drive_candidates').createIndex({ drive_id: 1, group_no: 1 }, { name: 'ldc_drive_group' }),
        db.collection('live_drive_candidates').createIndex({ drive_id: 1, invigilator_id: 1 }, { name: 'ldc_drive_invigilator' }),
        db.collection('live_drive_candidates').createIndex({ drive_id: 1, state: 1, scored_at: 1 }, { name: 'ldc_drive_state' }),
        db.collection('live_drive_candidates').createIndex({ user_id: 1, created_at: -1 }, { name: 'ldc_user' }),
        db.collection('live_drive_papers').createIndex({ drive_id: 1 }, { unique: true, name: 'ldp_drive' }),
        db.collection('live_drive_actions').createIndex({ drive_id: 1, at: -1 }, { name: 'lda_drive_at' }),
        db.collection('live_drive_actions').createIndex({ drive_id: 1, candidate_id: 1, at: -1 }, { name: 'lda_candidate_at' }),
        db.collection('integrity_events').createIndex({ target_kind: 1, target_id: 1, received_at: 1 }, { name: 'integrity_events_target_received' }),
      ])
    })().catch((e) => {
      indexes = null
      logger.error('[live-drives] index build failed', (e as Error).message)
    })
  }
  await indexes
}

async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  await ensureIndexes(db)
  return db.collection<T>(name)
}

export const drivesCol = () => col<LiveDriveDoc>('live_drives')
export const candidatesCol = () => col<LiveCandidateDoc>('live_drive_candidates')
export const papersCol = () => col<PaperDoc>('live_drive_papers')
export const actionsCol = () => col<ActionDoc>('live_drive_actions')
export const integrityEventsCol = () => col<{ target_kind: string; target_id: string; user_id: string; type: string; at: number; received_at: Date; snapshot_id: string | null; q: string | null }>('integrity_events')
