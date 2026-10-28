/**
 * Campus collections + indexes (server only). Indexes are built once per
 * process on first use (createIndex is idempotent).
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import type { ApplicationDoc, CollegeDoc, DriveDoc, OfferDoc, StudentDoc } from './types'

export const COLLEGES = 'campus_colleges'
export const STUDENTS = 'campus_students'
export const DRIVES = 'campus_drives'
export const APPLICATIONS = 'campus_applications'
export const OFFERS = 'campus_offers'
export const USAGE = 'campus_usage'

let indexes: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      await Promise.all([
        db.collection(COLLEGES).createIndex({ tenant_id: 1 }, { unique: true, name: 'cc_tenant' }),
        db.collection(COLLEGES).createIndex({ slug: 1 }, { unique: true, name: 'cc_slug' }),
        db.collection(COLLEGES).createIndex({ 'staff.user_id': 1 }, { name: 'cc_staff' }),
        db.collection(STUDENTS).createIndex({ id: 1 }, { unique: true, name: 'cst_id' }),
        db.collection(STUDENTS).createIndex({ college_id: 1, email: 1 }, { unique: true, name: 'cst_college_email' }),
        db.collection(STUDENTS).createIndex({ college_id: 1, roll_no: 1 }, { unique: true, name: 'cst_college_roll', partialFilterExpression: { roll_no: { $type: 'string' } } }),
        db.collection(STUDENTS).createIndex({ college_id: 1, department_id: 1, batch_id: 1 }, { name: 'cst_group' }),
        db.collection(STUDENTS).createIndex({ user_id: 1 }, { name: 'cst_user', partialFilterExpression: { user_id: { $type: 'string' } } }),
        db.collection(STUDENTS).createIndex({ invite_token_hash: 1 }, { name: 'cst_invite', partialFilterExpression: { invite_token_hash: { $type: 'string' } } }),
        db.collection(DRIVES).createIndex({ id: 1 }, { unique: true, name: 'cd_id' }),
        db.collection(DRIVES).createIndex({ college_id: 1, status: 1, 'schedule.apply_by': -1 }, { name: 'cd_college' }),
        db.collection(APPLICATIONS).createIndex({ id: 1 }, { unique: true, name: 'ca_id' }),
        db.collection(APPLICATIONS).createIndex({ drive_id: 1, student_id: 1 }, { unique: true, name: 'ca_drive_student' }),
        db.collection(APPLICATIONS).createIndex({ user_id: 1, applied_at: -1 }, { name: 'ca_user' }),
        db.collection(OFFERS).createIndex({ id: 1 }, { unique: true, name: 'co_id' }),
        db.collection(OFFERS).createIndex({ college_id: 1, year: 1 }, { name: 'co_college_year' }),
        db.collection(OFFERS).createIndex({ student_id: 1 }, { name: 'co_student' }),
        db.collection(USAGE).createIndex({ key: 1 }, { unique: true, name: 'cu_key' }),
        db.collection(USAGE).createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 40, name: 'cu_ttl' }),
      ])
    })().catch((e) => {
      indexes = null
      logger.error('[campus] index build failed', (e as Error).message)
    })
  }
  await indexes
}

async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  await ensureIndexes(db)
  return db.collection<T>(name)
}

export const collegesCol = () => col<CollegeDoc>(COLLEGES)
export const studentsCol = () => col<StudentDoc>(STUDENTS)
export const drivesCol = () => col<DriveDoc>(DRIVES)
export const applicationsCol = () => col<ApplicationDoc>(APPLICATIONS)
export const offersCol = () => col<OfferDoc>(OFFERS)
export const usageCol = () => col<{ key: string; n: number; at: Date }>(USAGE)

export const isDuplicateKey = (e: unknown) => (e as { code?: number } | null)?.code === 11000

/** Strip Mongo's _id (and secrets) before a doc leaves the server. */
export function clean<T extends object>(doc: T | null): T | null {
  if (!doc) return null
  const { _id, invite_token_hash, ...rest } = doc as T & { _id?: unknown; invite_token_hash?: unknown }
  void _id; void invite_token_hash
  return rest as T
}
