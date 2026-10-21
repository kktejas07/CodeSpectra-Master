/**
 * One-off: move files stored inline in MongoDB to the uploads bucket.
 *
 * Idempotent and resumable: each row gets a deterministic key
 * (migrationObjectKey), the object is written and verified (HEAD size) before
 * the row is switched to `storage: 's3'` and its bytes are unset, and rows
 * already switched no longer match the filter. Run in batches until
 * `remaining` is 0. Dry run only counts.
 */
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { bytesOf } from './blobs'
import { readStorageConfig, type ObjectStorageConfig } from './config'
import { migrationObjectKey, type StorageFeature } from './keys'
import { s3Head, s3Put } from './s3'

export const MIGRATION_TARGETS = ['exam_submission_files', 'contest_files', 'ats_bgv_files'] as const
export type MigrationTarget = (typeof MIGRATION_TARGETS)[number]

export interface TargetReport { target: MigrationTarget; pending: number; pending_bytes: number; moved: number; failed: number; remaining: number }

const INLINE = { data: { $exists: true, $ne: null }, storage: { $ne: 's3' } }

function featureFor(target: MigrationTarget, row: Document): StorageFeature {
  if (target === 'contest_files') return 'contest'
  if (target === 'ats_bgv_files') return 'ats-bgv'
  return row.kind === 'answer' ? 'exam-answer' : 'exam-cad'
}

async function pendingStats(col: Collection): Promise<{ n: number; bytes: number }> {
  const [r] = await col.aggregate<{ n: number; bytes: number }>([
    { $match: INLINE },
    { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: { $binarySize: '$data' } } } },
  ]).toArray()
  return { n: r?.n ?? 0, bytes: r?.bytes ?? 0 }
}

async function moveRow(cfg: ObjectStorageConfig, target: MigrationTarget, col: Collection, row: Document): Promise<boolean> {
  const bytes = bytesOf(row.data)
  const id = String(row.id || '')
  if (!bytes || !id) return false
  const key = migrationObjectKey(featureFor(target, row), row.tenant_id ?? null, id)
  const type = target === 'contest_files' ? String(row.mime || 'application/octet-stream')
    : target === 'exam_submission_files' ? String(row.content_type || 'application/octet-stream')
      : 'application/octet-stream' // BGV rows are AES-GCM boxes
  await s3Put(cfg, key, bytes, type)
  const head = await s3Head(cfg, key)
  if (!head || head.size !== bytes.byteLength) throw new Error('size mismatch after upload')

  if (target === 'ats_bgv_files') {
    // The case's document entry is the record of truth: point it at S3, then drop the Mongo row.
    const db = await getMongoDb()
    await db.collection('ats_bgv_cases').updateOne(
      { id: row.case_id, tenant_id: row.tenant_id },
      { $set: { 'checks.$[].documents.$[d].storage': 's3', 'checks.$[].documents.$[d].s3_key': key } },
      { arrayFilters: [{ 'd.id': id }] },
    )
    await col.deleteOne({ id, tenant_id: row.tenant_id })
    return true
  }
  const r = await col.updateOne({ id, ...INLINE }, { $set: { storage: 's3', s3_key: key }, $unset: { data: '' } })
  return r.modifiedCount === 1
}

export async function migrateInlineFiles(p: { dryRun: boolean; batch?: number; targets?: MigrationTarget[] }): Promise<{ ok: true; dry_run: boolean; reports: TargetReport[] } | { ok: false; error: string }> {
  const cfg = await readStorageConfig()
  if (!cfg && !p.dryRun) return { ok: false, error: 'Configure the uploads bucket first (uploads_s3_* server secrets or UPLOADS_S3_* env).' }
  const db = await getMongoDb()
  const batch = Math.max(1, Math.min(500, Math.floor(p.batch ?? 50)))
  const reports: TargetReport[] = []
  for (const target of p.targets?.length ? p.targets : MIGRATION_TARGETS) {
    const col = db.collection(target)
    const before = await pendingStats(col)
    const rep: TargetReport = { target, pending: before.n, pending_bytes: before.bytes, moved: 0, failed: 0, remaining: before.n }
    if (!p.dryRun && cfg && before.n) {
      const rows = await col.find(INLINE).sort({ _id: 1 }).limit(batch).toArray()
      for (const row of rows) {
        try {
          if (await moveRow(cfg, target, col, row)) rep.moved++
        } catch (e) {
          rep.failed++
          console.error('[storage/migrate]', target, e instanceof Error ? e.message.slice(0, 120) : 'error')
        }
      }
      rep.remaining = (await pendingStats(col)).n
    }
    reports.push(rep)
  }
  return { ok: true, dry_run: p.dryRun, reports }
}
