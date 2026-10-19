/**
 * Exam identity photos (ID card + selfie) and face templates — encrypted at
 * rest, served only through short-lived signed URLs, purged after retention
 * (audits A-011 / A-042).
 *
 *  - Photos: AES-256-GCM bytes in object storage (lib/s3-storage.ts) when
 *    configured, else the `identity_media_blobs` collection. Metadata lives in
 *    `identity_media`. Records keep only a reference string "media:<id>"
 *    (so list queries stay small and existing "has a photo" checks still work).
 *  - Viewing: staff ask /api/admin/exams/[id]/identity-media for a URL; it
 *    returns /api/identity-media/<id>?t=<token> — HMAC-signed, bound to the
 *    viewer's user id, valid 5 minutes. The file route re-checks the viewer.
 *  - Face templates (user.facial_biometric_template): sealed as "v1." strings;
 *    legacy plain arrays still read.
 *  - Retention: Admin → Settings → "Keep ID photos and selfies" (default 180
 *    days) after the exam closes (exam ends_at, or archive date; exams with no
 *    closing date count from the attempt). Purged daily by lib/platform-cron.ts.
 *
 * Key: IDENTITY_MEDIA_KEY (32+ chars), else SECRETS_ENCRYPTION_KEY, else
 * derived from the session secret. To rotate, put the old value in
 * IDENTITY_MEDIA_KEY_PREVIOUS / SECRETS_ENCRYPTION_KEY_PREVIOUS (read-only).
 */
import { createHash } from 'node:crypto'
import { Binary, type Db } from 'mongodb'
import { decryptBytesWithKey, encryptBytesWithKey } from '@/lib/ats/bgv/crypto'
import { decryptWithKey, encryptWithKey, signToken, verifyToken, type TokenKind } from '@/lib/ats/interviews/tokens'

export const MEDIA_REF_PREFIX = 'media:'
export const MEDIA_URL_TTL_MS = 5 * 60_000
const VIEW_KIND = 'idm' as unknown as TokenKind

export type IdentityMediaKind = 'id' | 'face'

export interface IdentityMediaDoc {
  id: string
  exam_id: string
  user_id: string
  tenant_id: string | null
  kind: IdentityMediaKind
  mime: string
  size: number
  storage: 's3' | 'db'
  created_at: string
}

async function mediaKey(): Promise<Uint8Array> {
  return (await mediaKeys())[0]
}

/**
 * [current key, …older keys still accepted for reading]. SEC-018: once
 * IDENTITY_MEDIA_KEY / SECRETS_ENCRYPTION_KEY is set, media sealed earlier with
 * the session-derived key stays readable (new media uses the env key).
 */
async function mediaKeys(): Promise<Uint8Array[]> {
  const { deriveServerKey } = await import('@/lib/session')
  const legacy = await deriveServerKey('identity-media')
  const keys: Uint8Array[] = []
  const prev = [process.env.IDENTITY_MEDIA_KEY_PREVIOUS, process.env.SECRETS_ENCRYPTION_KEY_PREVIOUS].flatMap((v) => String(v || '').split(','))
  for (const v of [process.env.IDENTITY_MEDIA_KEY, process.env.SECRETS_ENCRYPTION_KEY, ...prev]) {
    const env = (v || '').trim()
    if (env.length >= 32) keys.push(new Uint8Array(createHash('sha256').update(`identity-media:${env}`).digest()))
  }
  keys.push(legacy)
  return keys
}
async function viewKey(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('identity-media-view')
}

// ─── Pure helpers (unit tested) ─────────────────────────────────────────────

export function isMediaRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(MEDIA_REF_PREFIX) && /^media:[A-Za-z0-9_-]{6,64}$/.test(v)
}
export function mediaIdFromRef(v: unknown): string | null {
  return isMediaRef(v) ? v.slice(MEDIA_REF_PREFIX.length) : null
}

/** data:image/...;base64,... → { mime, bytes } or null. */
export function parseImageDataUrl(v: unknown): { mime: string; bytes: Buffer } | null {
  if (typeof v !== 'string') return null
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(v)
  if (!m) return null
  return { mime: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], bytes: Buffer.from(m[2], 'base64') }
}

export function signMediaToken(k: Uint8Array, mediaId: string, viewerId: string, now = Date.now()): string {
  return signToken(k, { k: VIEW_KIND, i: mediaId, n: 'v', u: viewerId, e: now + MEDIA_URL_TTL_MS })
}
export function verifyMediaToken(k: Uint8Array, token: unknown, now = Date.now()): { mediaId: string; viewerId: string } | null {
  const p = verifyToken(k, token, VIEW_KIND, now)
  return p && p.u ? { mediaId: p.i, viewerId: p.u } : null
}

/**
 * When identity media of an exam may be purged. Pure.
 * closeAt = ends_at, else the archive date; null = no closing date (use the attempt date).
 */
export function examCloseAt(exam: { ends_at?: unknown; status?: unknown; updatedAt?: unknown; archived_at?: unknown } | null): number | null {
  if (!exam) return null
  const t = (v: unknown) => (typeof v === 'string' || v instanceof Date ? new Date(v as string).getTime() : NaN)
  const end = t(exam.ends_at)
  if (Number.isFinite(end)) return end
  if (exam.status === 'archived') {
    const a = t(exam.archived_at)
    if (Number.isFinite(a)) return a
    const u = t(exam.updatedAt)
    if (Number.isFinite(u)) return u
  }
  return null
}

// ─── Store / read ───────────────────────────────────────────────────────────

async function s3(): Promise<typeof import('@/lib/s3-storage') | null> {
  try {
    const mod = await import('@/lib/s3-storage')
    return (await mod.readS3Config()) ? mod : null
  } catch {
    return null
  }
}
const s3Key = (d: Pick<IdentityMediaDoc, 'exam_id' | 'id'>) => `identity-media/${d.exam_id}/${d.id}`

async function cols() {
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  return { db, meta: db.collection<IdentityMediaDoc>('identity_media'), blobs: db.collection('identity_media_blobs') }
}

/**
 * Store one photo. Accepts a data URL (encrypts + stores, returns "media:<id>")
 * or an existing media ref (returned unchanged). Anything else → null.
 */
export async function toMediaRef(
  value: unknown,
  ctx: { examId: string; userId: string; tenantId: string | null; kind: IdentityMediaKind },
): Promise<string | null> {
  if (isMediaRef(value)) return value
  const img = parseImageDataUrl(value)
  if (!img || img.bytes.length === 0) return null
  const { randomUUID } = await import('node:crypto')
  const id = randomUUID().replace(/-/g, '')
  const box = encryptBytesWithKey(await mediaKey(), img.bytes)
  const store = await s3()
  const doc: IdentityMediaDoc = {
    id, exam_id: ctx.examId, user_id: ctx.userId, tenant_id: ctx.tenantId, kind: ctx.kind,
    mime: img.mime, size: img.bytes.length, storage: store ? 's3' : 'db', created_at: new Date().toISOString(),
  }
  const { meta, blobs } = await cols()
  if (store) await store.s3PutObject(s3Key(doc), box, 'application/octet-stream')
  else await blobs.insertOne({ id, data: new Binary(box), created_at: doc.created_at })
  await meta.insertOne(doc)
  return MEDIA_REF_PREFIX + id
}

export async function getMediaDoc(mediaId: string): Promise<IdentityMediaDoc | null> {
  const { meta } = await cols()
  return (await meta.findOne({ id: mediaId }, { projection: { _id: 0 } })) as IdentityMediaDoc | null
}

export async function readMediaBytes(doc: IdentityMediaDoc): Promise<Buffer | null> {
  let box: Buffer | null = null
  if (doc.storage === 's3') {
    const store = await s3()
    box = store ? await store.s3GetObject(s3Key(doc)).catch(() => null) : null
  } else {
    const { blobs } = await cols()
    const row = await blobs.findOne({ id: doc.id })
    const d = row?.data as Binary | Buffer | undefined
    box = d ? (Buffer.isBuffer(d) ? d : Buffer.from((d as Binary).buffer)) : null
  }
  if (!box) return null
  for (const k of await mediaKeys()) {
    const out = decryptBytesWithKey(k, box)
    if (out) return out
  }
  return null
}

/** Signed 5-minute URL for one photo, bound to the viewer. Legacy data URLs pass through. */
export async function mediaViewUrl(value: unknown, viewerId: string): Promise<string | null> {
  if (typeof value === 'string' && value.startsWith('data:image/')) return value
  const id = mediaIdFromRef(value)
  if (!id) return null
  return `/api/identity-media/${id}?t=${encodeURIComponent(signMediaToken(await viewKey(), id, viewerId))}`
}

export async function verifyMediaViewToken(token: unknown): Promise<{ mediaId: string; viewerId: string } | null> {
  return verifyMediaToken(await viewKey(), token)
}

// ─── Face templates ─────────────────────────────────────────────────────────

export async function sealFaceTemplate(descriptor: number[]): Promise<string> {
  return encryptWithKey(await mediaKey(), JSON.stringify(descriptor))
}

/** Sealed string or legacy array → 128 numbers, or null. */
export async function openFaceTemplate(v: unknown): Promise<number[] | null> {
  if (Array.isArray(v)) return v.length === 128 && v.every((x) => typeof x === 'number') ? (v as number[]) : null
  if (typeof v !== 'string' || !v.startsWith('v1.')) return null
  let s: string | null = null
  for (const k of await mediaKeys()) {
    s = decryptWithKey(k, v)
    if (s) break
  }
  if (!s) return null
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) && arr.length === 128 ? (arr as number[]) : null
  } catch {
    return null
  }
}

/** Sync shape check (sealed or plain) — for "is a face enrolled". */
export function hasFaceTemplate(v: unknown): boolean {
  return (Array.isArray(v) && v.length === 128) || (typeof v === 'string' && v.startsWith('v1.') && v.length > 40)
}

// ─── Retention purge ────────────────────────────────────────────────────────

async function deleteMedia(db: Db, docs: IdentityMediaDoc[]): Promise<void> {
  if (!docs.length) return
  const s3Docs = docs.filter((d) => d.storage === 's3')
  if (s3Docs.length) {
    const store = await s3()
    if (store) for (const d of s3Docs) await store.s3DeleteObject(s3Key(d)).catch((e) => console.error('[identity-media] s3 delete failed', d.id, (e as Error)?.message))
  }
  const ids = docs.map((d) => d.id)
  await db.collection('identity_media_blobs').deleteMany({ id: { $in: ids } })
  await db.collection('identity_media').deleteMany({ id: { $in: ids } })
}

/** Strip photos (refs and legacy data URLs) from one exam's records. */
async function stripExamPhotos(db: Db, examId: string, userFilter: Record<string, unknown> = {}): Promise<void> {
  const at = new Date().toISOString()
  for (const col of ['exam_identity_checks', 'exam_submissions']) {
    await db.collection(col).updateMany(
      { exam_id: examId, ...userFilter, $or: [{ id_photo: { $type: 'string' } }, { face_photo: { $type: 'string' } }] },
      { $set: { id_photo: null, face_photo: null, identity_media_purged_at: at } },
    )
  }
}

/** Daily: purge identity photos past retention. Returns the number of exams purged. */
export async function purgeExpiredIdentityMedia(now: Date = new Date(), maxExams = 200): Promise<number> {
  const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
  const days = (await getGeneralSettingsCached()).identity_media_retention_days
  const cutoff = now.getTime() - days * 86_400_000
  const cutoffIso = new Date(cutoff).toISOString()
  const { db, meta } = await cols()
  let purged = 0

  // 1) Exams with stored media older than the cutoff (necessary condition).
  // W4-14: open exams are skipped without consuming maxExams.
  const candidates = (await meta.distinct('exam_id', { created_at: { $lt: cutoffIso } })) as string[]
  const { examsDueForPurge } = await import('@/lib/proctoring/recordings')
  const due = await examsDueForPurge(db, candidates, cutoff, (e) => examCloseAt(e as Parameters<typeof examCloseAt>[0]), maxExams)
  for (const { examId, closeAt } of due) {
    const filter = closeAt === null ? { exam_id: examId, created_at: { $lt: cutoffIso } } : { exam_id: examId }
    const docs = (await meta.find(filter, { projection: { _id: 0 } }).toArray()) as IdentityMediaDoc[]
    await deleteMedia(db, docs)
    if (closeAt !== null) {
      await stripExamPhotos(db, examId)
    } else {
      const users = [...new Set(docs.map((d) => d.user_id))]
      if (users.length) await stripExamPhotos(db, examId, { user_id: { $in: users } })
    }
    purged++
  }

  // 2) Legacy base64 photos on exams that closed before the cutoff.
  const legacy = await db.collection('exams')
    .find({ ends_at: { $lt: cutoffIso }, identity_media_purged_at: { $exists: false } }, { projection: { _id: 0, id: 1 } })
    .limit(maxExams).toArray()
  for (const e of legacy) {
    await stripExamPhotos(db, String(e.id))
    await db.collection('exams').updateOne({ id: e.id }, { $set: { identity_media_purged_at: now.toISOString() } })
    purged++
  }

  // 3) Proctoring session recordings follow the same retention (audit CORE-011).
  try {
    const { purgeExpiredRecordings } = await import('@/lib/proctoring/recordings')
    await purgeExpiredRecordings(db, cutoff, (e) => examCloseAt(e as Parameters<typeof examCloseAt>[0]), maxExams)
  } catch (e) {
    console.error('[identity-media] recording purge failed:', (e as Error)?.message)
  }
  return purged
}

/**
 * Account deletion (SEC-027): remove every ID photo / selfie the user ever
 * submitted (object storage + DB), strip photo refs from their exam records,
 * and delete their KYC sessions. Exam results themselves stay with the
 * organisation that owns them. Returns counts for the audit log.
 */
export async function purgeUserIdentityData(userId: string): Promise<{ media: number; kyc: number }> {
  const { db, meta } = await cols()
  const docs = (await meta.find({ user_id: userId }, { projection: { _id: 0 } }).toArray()) as IdentityMediaDoc[]
  await deleteMedia(db, docs)
  const at = new Date().toISOString()
  for (const col of ['exam_identity_checks', 'exam_submissions']) {
    await db.collection(col).updateMany(
      { user_id: userId, $or: [{ id_photo: { $type: 'string' } }, { face_photo: { $type: 'string' } }] },
      { $set: { id_photo: null, face_photo: null, identity_media_purged_at: at } },
    ).catch(() => {})
  }
  const kyc = await db.collection('kyc_sessions').deleteMany({ user_id: userId }).catch(() => ({ deletedCount: 0 }))
  return { media: docs.length, kyc: kyc.deletedCount ?? 0 }
}
