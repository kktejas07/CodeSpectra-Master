/**
 * Direct browser uploads to the private bucket (large files: answer videos,
 * contest videos/decks).
 *
 *   1. start   the route has authorised the user; we record an intent
 *              (`storage_uploads`, status pending) and return a presigned PUT
 *              signed for the exact size and content type.
 *   2. PUT     the browser sends the bytes straight to S3 / R2 / MinIO.
 *   3. finish  we HEAD the object (size must match), range-GET the first
 *              64 KB for the magic-byte check, run the virus scanner (files
 *              up to UPLOADS_SCAN_MAX_MB), then mark it ready. Anything that
 *              fails is deleted.
 *   4. claim   the feature attaches a ready upload to its record exactly once.
 *
 * Intents are bound to the uploader and a feature scope (e.g. exam + question),
 * so an upload id can't be attached by someone else or somewhere else.
 * Abandoned uploads: the pending tag + bucket lifecycle rule, and sweepUploads().
 */
import { randomBytes } from 'crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { largeUploadLimits, readStorageConfig, PUT_URL_TTL_SEC } from './config'
import { isUploadKey, newObjectKey, type StorageFeature } from './keys'
import { s3Delete, s3Get, s3GetHead, s3Head, s3MarkReady, s3PresignPut } from './s3'
import { scanBuffer, type ScanStatus } from './scan'

export const SNIFF_BYTES = 64 * 1024
const MAX_PENDING_PER_OWNER = 10
const PURGE_AFTER_MS = 7 * 24 * 3600_000

export type UploadStatus = 'pending' | 'ready' | 'used' | 'rejected' | 'expired'

export interface UploadIntentDoc {
  id: string
  key: string
  feature: StorageFeature
  tenant_id: string | null
  owner_id: string
  scope: string
  name: string
  size: number
  content_type: string
  status: UploadStatus
  scan_status?: ScanStatus
  meta?: Record<string, unknown>
  created_at: Date
  expires_at: Date
  purge_at?: Date
}

type Fail = { ok: false; status: number; error: string }
const fail = (status: number, error: string): Fail => ({ ok: false, status, error })

let indexed: Promise<unknown> | null = null
export async function uploadsCol(): Promise<Collection<UploadIntentDoc>> {
  const col = (await getMongoDb()).collection<UploadIntentDoc>('storage_uploads')
  if (!indexed) {
    indexed = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'storage_uploads_id' }),
      col.createIndex({ owner_id: 1, status: 1 }, { name: 'storage_uploads_owner' }),
      col.createIndex({ status: 1, expires_at: 1 }, { name: 'storage_uploads_sweep' }),
      col.createIndex({ purge_at: 1 }, { expireAfterSeconds: 0, name: 'storage_uploads_ttl' }),
    ]).catch((e) => { indexed = null; console.error('[storage] index build failed', e instanceof Error ? e.message : e) })
  }
  await indexed
  return col
}

/** Pure: the declared upload is acceptable? Returns an error message or null. */
export function checkDeclaredUpload(p: { size: number; contentType: string; maxBytes: number; allowedTypes: readonly string[] }): string | null {
  if (!Number.isInteger(p.size) || p.size <= 0) return 'This file is empty.'
  if (p.size > p.maxBytes) return `Files must be under ${Math.round(p.maxBytes / 1048576)} MB.`
  if (!p.allowedTypes.includes(p.contentType)) return 'This file type is not allowed here.'
  return null
}

export async function startDirectUpload(p: {
  feature: StorageFeature
  tenantId: string | null
  ownerId: string
  scope: string
  name: string
  size: number
  contentType: string
  maxBytes: number
  allowedTypes: readonly string[]
  meta?: Record<string, unknown>
}): Promise<{ ok: true; upload_id: string; url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string } | Fail | { ok: false; status: 409; inline: true; error: string }> {
  const cfg = await readStorageConfig()
  if (!cfg) return { ok: false, status: 409, inline: true, error: 'Direct uploads are off; send the file to the regular upload endpoint.' }
  const bad = checkDeclaredUpload(p)
  if (bad) return fail(p.size > p.maxBytes ? 413 : 400, bad)
  const col = await uploadsCol()
  const now = new Date()
  if ((await col.countDocuments({ owner_id: p.ownerId, status: 'pending', expires_at: { $gt: now } })) >= MAX_PENDING_PER_OWNER) {
    return fail(429, 'Too many uploads in progress. Finish or wait for them, then try again.')
  }
  const key = newObjectKey(p.feature, p.tenantId, now)
  const signed = await s3PresignPut(cfg, { key, contentType: p.contentType, size: p.size })
  const doc: UploadIntentDoc = {
    id: `up_${randomBytes(12).toString('hex')}`,
    key,
    feature: p.feature,
    tenant_id: p.tenantId,
    owner_id: p.ownerId,
    scope: p.scope,
    name: p.name,
    size: p.size,
    content_type: p.contentType,
    status: 'pending',
    ...(p.meta ? { meta: p.meta } : {}),
    created_at: now,
    expires_at: new Date(now.getTime() + PUT_URL_TTL_SEC * 1000),
  }
  await col.insertOne(doc)
  return { ok: true, upload_id: doc.id, url: signed.url, method: 'PUT', headers: signed.headers, expires_at: doc.expires_at.toISOString() }
}

async function reject(col: Collection<UploadIntentDoc>, doc: UploadIntentDoc, cfgKey: string, status: number, error: string): Promise<Fail> {
  const cfg = await readStorageConfig()
  if (cfg) await s3Delete(cfg, cfgKey).catch(() => {})
  await col.updateOne({ id: doc.id }, { $set: { status: 'rejected', purge_at: new Date(Date.now() + PURGE_AFTER_MS) } })
  return fail(status, error)
}

/**
 * Verify an uploaded object and mark it ready.
 *   sniff     magic-byte check on the first 64 KB
 *   scanMode  'strict' → scanner offline is a 503 (retry finish later);
 *             'soft'   → stored as 'unscanned' (reviewers see the flag)
 */
export async function finishDirectUpload(p: {
  uploadId: string
  ownerId: string
  scope: string
  sniff: (head: Uint8Array, doc: UploadIntentDoc) => boolean
  sniffError?: string
  scanMode: 'strict' | 'soft'
}): Promise<{ ok: true; upload: UploadIntentDoc } | Fail> {
  if (!/^up_[0-9a-f]{24}$/.test(p.uploadId)) return fail(400, 'Unknown upload.')
  const cfg = await readStorageConfig()
  if (!cfg) return fail(409, 'Direct uploads are off.')
  const col = await uploadsCol()
  const doc = await col.findOne({ id: p.uploadId, owner_id: p.ownerId, scope: p.scope })
  if (!doc) return fail(404, 'Unknown upload.')
  if (doc.status === 'ready') return { ok: true, upload: doc }
  if (doc.status !== 'pending') return fail(409, 'This upload can no longer be used. Upload the file again.')
  if (!isUploadKey(doc.key)) return fail(400, 'Unknown upload.')

  const head = await s3Head(cfg, doc.key)
  if (!head) {
    if (doc.expires_at.getTime() < Date.now()) return reject(col, doc, doc.key, 410, 'The upload link expired. Upload the file again.')
    return fail(409, 'The file has not arrived yet. Wait for the upload to finish, then try again.')
  }
  if (head.size !== doc.size) return reject(col, doc, doc.key, 400, 'The uploaded file size does not match. Upload it again.')
  if (cfg.sse !== 'none' && !head.sse) return reject(col, doc, doc.key, 400, 'The upload was not encrypted. Upload it again.')

  const first = await s3GetHead(cfg, doc.key, SNIFF_BYTES)
  if (!first || !p.sniff(new Uint8Array(first), doc)) {
    return reject(col, doc, doc.key, 400, p.sniffError || 'The file content does not match its type. Save it again in the right format and retry.')
  }

  let scan: ScanStatus = 'unscanned'
  if (doc.size <= largeUploadLimits().scanBytes) {
    const all = await s3Get(cfg, doc.key)
    if (!all) return fail(409, 'The file has not arrived yet. Try again.')
    scan = await scanBuffer(all, doc.name)
    if (scan === 'infected') return reject(col, doc, doc.key, 400, 'The security scanner rejected this file.')
    if (scan === 'unscanned' && p.scanMode === 'strict') return fail(503, 'The security scanner is offline right now. Try again in a few minutes.')
  }
  await s3MarkReady(cfg, doc.key).catch((e) => console.error('[storage] tag update failed:', e instanceof Error ? e.name : 'error'))
  const updated = await col.findOneAndUpdate(
    { id: doc.id, status: 'pending' },
    { $set: { status: 'ready', scan_status: scan } },
    { returnDocument: 'after' },
  )
  if (!updated) return fail(409, 'This upload was already finished.')
  return { ok: true, upload: updated }
}

/** A finished, not yet attached upload for this owner + scope (validation before claimUpload). */
export async function findReadyUpload(p: { uploadId: string; ownerId: string; scope: string }): Promise<UploadIntentDoc | null> {
  if (!/^up_[0-9a-f]{24}$/.test(p.uploadId)) return null
  return (await uploadsCol()).findOne({ id: p.uploadId, owner_id: p.ownerId, scope: p.scope, status: 'ready' })
}

/** Attach a ready upload exactly once. */
export async function claimUpload(p: { uploadId: string; ownerId: string; scope: string }): Promise<UploadIntentDoc | null> {
  if (!/^up_[0-9a-f]{24}$/.test(p.uploadId)) return null
  const col = await uploadsCol()
  return col.findOneAndUpdate(
    { id: p.uploadId, owner_id: p.ownerId, scope: p.scope, status: 'ready' },
    { $set: { status: 'used', purge_at: new Date(Date.now() + PURGE_AFTER_MS) } },
    { returnDocument: 'after' },
  )
}

/**
 * Delete objects of uploads that were never finished (pending past expiry)
 * or never attached (ready for over a day). Idempotent; safe to run from a cron.
 */
export async function sweepUploads(limit = 200): Promise<{ removed: number; failed: number }> {
  const cfg = await readStorageConfig()
  const col = await uploadsCol()
  const now = Date.now()
  const stale = await col.find({
    $or: [
      { status: 'pending', expires_at: { $lt: new Date(now - 3600_000) } },
      { status: 'ready', created_at: { $lt: new Date(now - 24 * 3600_000) } },
    ],
  }).limit(limit).toArray()
  let removed = 0
  let failed = 0
  for (const d of stale) {
    if (cfg && isUploadKey(d.key)) {
      try { await s3Delete(cfg, d.key) } catch { failed++; continue }
    }
    await col.updateOne({ id: d.id, status: d.status }, { $set: { status: 'expired', purge_at: new Date(now + PURGE_AFTER_MS) } })
    removed++
  }
  return { removed, failed }
}
