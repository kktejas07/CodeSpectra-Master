/**
 * Object key layout: u/<feature>/<tenant>/<yyyymm>/<random>. No names, emails
 * or user ids in keys — only the feature, the tenant id (or "platform") and a
 * random 128-bit id. The file name lives in the database record.
 */
import { createHash, randomBytes } from 'crypto'

export const STORAGE_FEATURES = ['exam-answer', 'exam-cad', 'contest', 'ats-bgv', 'integrity', 'interview-sim'] as const
export type StorageFeature = (typeof STORAGE_FEATURES)[number]

export function tenantSegment(tenantId: string | null | undefined): string {
  const t = String(tenantId ?? '').trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(t) ? `t-${t}` : 'platform'
}

/** A fresh random key for a new upload. */
export function newObjectKey(feature: StorageFeature, tenantId: string | null | undefined, now = new Date()): string {
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `u/${feature}/${tenantSegment(tenantId)}/${ym}/${randomBytes(16).toString('hex')}`
}

/** Deterministic key for migrating an existing Mongo row (re-running the migration rewrites the same object). */
export function migrationObjectKey(feature: StorageFeature, tenantId: string | null | undefined, rowId: string): string {
  const h = createHash('sha256').update(`${feature}:${rowId}`).digest('hex').slice(0, 32)
  return `u/${feature}/${tenantSegment(tenantId)}/m/${h}`
}

/** True for keys this module writes (guards against reading arbitrary bucket paths from a tampered record). */
export function isUploadKey(key: unknown): key is string {
  return typeof key === 'string' && /^u\/[a-z-]{2,20}\/(platform|t-[A-Za-z0-9_-]{1,64})\/(\d{6}|m)\/[0-9a-f]{32}$/.test(key)
}
