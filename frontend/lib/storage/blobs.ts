/**
 * Shared upload storage: one API for every feature that keeps user files.
 *
 *   S3 driver   (lib/storage/s3.ts)  when an uploads bucket is configured
 *   Mongo driver (inline `data`)     otherwise — the caller keeps the bytes in
 *                                    its own record, exactly as before
 *
 * Records carry `storage: 'db' | 's3'` and, for S3, `s3_key`. Reads, deletes
 * and downloads go through the record, so old Mongo rows keep working after
 * S3 is switched on (and the admin migration moves them over).
 */
import type { Collection, Document, Filter } from 'mongodb'
import { readStorageConfig, type ObjectStorageConfig } from './config'
import { isUploadKey, newObjectKey, type StorageFeature } from './keys'
import { s3Delete, s3Get, s3PresignGet, s3Put } from './s3'

export interface BlobRef {
  storage?: 'db' | 's3' | string
  s3_key?: string | null
  data?: unknown
}

export type PutResult = { storage: 's3'; s3_key: string } | { storage: 'db'; data: Buffer }

export async function storageConfig(): Promise<ObjectStorageConfig | null> {
  return readStorageConfig()
}

/** True when uploads go to object storage (and the larger limits apply). */
export async function objectStorageOn(): Promise<boolean> {
  return !!(await readStorageConfig())
}

/** Buffer from a Mongo Binary / Buffer / Uint8Array field, or null. */
export function bytesOf(data: unknown): Buffer | null {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  // BSON Binary: .buffer holds the bytes
  const bin = data as { buffer?: unknown }
  if (bin.buffer && ArrayBuffer.isView(bin.buffer)) return Buffer.from(bin.buffer.buffer, bin.buffer.byteOffset, bin.buffer.byteLength)
  return null
}

/** Store bytes the server already holds (and has validated + scanned). */
export async function putBlob(p: { feature: StorageFeature; tenantId?: string | null; bytes: Buffer; contentType: string }): Promise<PutResult> {
  const cfg = await readStorageConfig()
  if (!cfg) return { storage: 'db', data: p.bytes }
  const key = newObjectKey(p.feature, p.tenantId)
  await s3Put(cfg, key, p.bytes, p.contentType || 'application/octet-stream')
  return { storage: 's3', s3_key: key }
}

export async function readBlob(ref: BlobRef): Promise<Buffer | null> {
  if (ref.storage === 's3') {
    if (!isUploadKey(ref.s3_key)) return null
    const cfg = await readStorageConfig()
    if (!cfg) return null
    return s3Get(cfg, ref.s3_key)
  }
  return bytesOf(ref.data)
}

/**
 * Presigned download URL (≤ 5 min, attachment) for an S3-stored record, or
 * null for a Mongo-stored one (the route streams `data` itself). Call only
 * after the route's own authorisation check.
 */
export async function blobDownloadUrl(ref: BlobRef, filename: string, contentType?: string): Promise<string | null> {
  if (ref.storage !== 's3' || !isUploadKey(ref.s3_key)) return null
  const cfg = await readStorageConfig()
  if (!cfg) return null
  return s3PresignGet(cfg, { key: ref.s3_key, filename, contentType })
}

/** Delete the objects behind records that are about to be removed. Returns how many failed. */
export async function deleteBlobs(refs: BlobRef[]): Promise<number> {
  const keys = refs.filter((r) => r.storage === 's3' && isUploadKey(r.s3_key)).map((r) => r.s3_key as string)
  if (!keys.length) return 0
  const cfg = await readStorageConfig()
  if (!cfg) return keys.length
  let failed = 0
  for (const key of keys) {
    await s3Delete(cfg, key).catch((e) => {
      failed++
      console.error('[storage] delete failed:', e instanceof Error ? e.name : 'error')
    })
  }
  return failed
}

/** Remove S3 objects for Mongo rows matching `filter` (call right before deleteMany on them). */
export async function deleteBlobsFor<T extends Document>(col: Collection<T>, filter: Record<string, unknown>): Promise<number> {
  const rows = (await col.find({ ...filter, storage: 's3' } as unknown as Filter<T>, { projection: { _id: 0, storage: 1, s3_key: 1 } }).toArray()) as unknown as BlobRef[]
  return deleteBlobs(rows)
}
