/**
 * Proctoring session recordings (audit CORE-011 / CORE-012 / CORE-013, A-004).
 *
 * How it works
 *  - The candidate's browser runs one MediaRecorder per stream ("webcam" with
 *    the mic, and "screen" when they share it) and restarts it every ~60 s, so
 *    every chunk is a small, self-contained WebM file (~2–5 MB).
 *  - POST /api/proctor/session-recording sends the raw bytes (no base64). The
 *    server checks the caller has a running attempt on that exam, rate-limits,
 *    caps bytes per chunk and per attempt, encrypts the bytes (AES-256-GCM) and
 *    stores them in object storage (lib/s3-storage, R2/S3) when configured,
 *    otherwise in GridFS (bucket `proctor_recordings_fs`). Never one big
 *    Mongo document (the old route hit the 16 MB limit and lost most video).
 *  - Metadata: `proctor_recording_chunks` (one row per chunk, unique on
 *    exam+user+attempt+stream+index so a retried upload is idempotent) and
 *    `proctor_recordings` (one manifest per attempt: bytes, counts, upload
 *    failures reported by the server or the browser).
 *  - Playback: staff (superadmin, or the exam's tenant admin) open
 *    /dashboard/admin/assessments/[id]/recordings; the API returns a
 *    playlist with per-chunk offsets and 30-minute viewer-bound URLs, and
 *    writes an audit log row. Gaps (missing chunks) are shown on the timeline.
 *  - Retention: same "Keep ID photos and selfies" setting as identity media,
 *    purged from purgeExpiredIdentityMedia (daily cron).
 */
import { createHash, randomUUID } from 'node:crypto'
import { ObjectId, type Db } from 'mongodb'
import { decryptBytesWithKey, encryptBytesWithKey } from '@/lib/ats/bgv/crypto'
import { signToken, verifyToken, type TokenKind } from '@/lib/ats/interviews/tokens'

export const RECORDING_STREAMS = ['webcam', 'screen'] as const
export type RecordingStream = (typeof RECORDING_STREAMS)[number]

/** Below the 10 MB proxy body buffer (next.config proxyClientMaxBodySize default). */
export const CHUNK_MAX_BYTES = 8 * 1024 * 1024
/** Per attempt, all streams. ~3 h of webcam + screen at the recorder's bitrates. */
export const ATTEMPT_MAX_BYTES = (() => {
  const n = Number(process.env.RECORDING_MAX_BYTES_PER_ATTEMPT)
  return Number.isFinite(n) && n > 0 ? n : 1536 * 1024 * 1024
})()
export const MAX_CHUNKS_PER_STREAM = 600
/** Uploads are accepted until this long after the attempt deadline / submit (final flush). */
export const UPLOAD_GRACE_MS = 15 * 60_000
/** Attempts with no deadline: accept for at most this long after the start. */
export const NO_DEADLINE_MAX_MS = 12 * 3_600_000
export const VIEW_URL_TTL_MS = 30 * 60_000

export const CHUNKS = 'proctor_recording_chunks'
export const MANIFESTS = 'proctor_recordings'
export const GRIDFS_BUCKET = 'proctor_recordings_fs'
const VIEW_KIND = 'recv' as unknown as TokenKind

export interface RecordingChunkDoc {
  id: string
  exam_id: string
  user_id: string
  tenant_id: string | null
  attempt_no: number
  stream: RecordingStream
  chunk_index: number
  /** Epoch ms when the browser started this chunk. */
  started_at_ms: number
  duration_ms: number
  mime: string
  size: number
  storage: 's3' | 'gridfs'
  key: string
  has_audio: boolean
  audio_error?: string
  /** W4-04: fingerprint of the data key that sealed the bytes (absent on old chunks). */
  key_id?: string
  created_at: string
}

export interface RecordingManifest {
  id: string
  exam_id: string
  user_id: string
  tenant_id: string | null
  attempt_no: number
  total_bytes: number
  chunk_count: number
  failed_uploads: number
  last_error?: string | null
  last_error_at?: string | null
  failed_chunks?: Array<{ stream: string; chunk_index: number; reason: string; at: string }>
  first_chunk_at_ms?: number
  last_chunk_end_ms?: number
  created_at: string
  updated_at: string
}

// ─── Pure helpers (unit tested) ─────────────────────────────────────────────

/** W4-03: find candidates in `user` by any of the ids a manifest may hold. */
export function candidateLookupFilter(userIds: string[]): Record<string, unknown> {
  const ids = [...new Set(userIds.filter(Boolean).map(String))]
  const or: Record<string, unknown>[] = [{ id: { $in: ids } }, { _id: { $in: ids } }, { firebase_uid: { $in: ids } }]
  const oids = ids.filter((x) => /^[0-9a-f]{24}$/i.test(x))
  if (oids.length) {
    or.push({ _id: { $in: oids.map((x) => new ObjectId(x)) } })
  }
  return { $or: or }
}

/** user rows → Map(any id → { name, email }). */
export function candidateMap(rows: Array<Record<string, unknown>>): Map<string, { name: string; email: string }> {
  const m = new Map<string, { name: string; email: string }>()
  for (const p of rows) {
    const v = { name: String(p.full_name || p.name || ''), email: String(p.email || '') }
    for (const k of [p.id, p._id, p.firebase_uid]) if (k !== undefined && k !== null && k !== '') m.set(String(k), v)
  }
  return m
}

export const manifestId = (examId: string, userId: string, attemptNo: number) => `${examId}:${userId}:${attemptNo}`
export const chunkKey = (c: Pick<RecordingChunkDoc, 'exam_id' | 'user_id' | 'attempt_no' | 'stream' | 'chunk_index'>) =>
  `proctor-recordings/${c.exam_id}/${c.user_id}/${c.attempt_no}/${c.stream}/${String(c.chunk_index).padStart(5, '0')}.webm.enc`

export function isRecordingStream(v: unknown): v is RecordingStream {
  return typeof v === 'string' && (RECORDING_STREAMS as readonly string[]).includes(v)
}

export function normalizeMime(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  // Only the container types MediaRecorder produces; anything else is stored as plain webm.
  const m = /^(video\/(?:webm|mp4))(;\s*codecs=[a-z0-9.,\s]{1,60})?$/.exec(s)
  return m ? (m[1] + (m[2] ? m[2].replace(/\s+/g, '') : '')) : 'video/webm'
}

export type ChunkMetaInput = {
  stream?: unknown
  chunk_index?: unknown
  started_at?: unknown
  duration_ms?: unknown
  mime?: unknown
  has_audio?: unknown
  audio_error?: unknown
}
export type ChunkMeta = {
  stream: RecordingStream
  chunk_index: number
  started_at_ms: number
  duration_ms: number
  mime: string
  has_audio: boolean
  audio_error?: string
}

/** Validates what the browser says about a chunk. Timestamps are clamped to the attempt window. */
export function parseChunkMeta(
  input: ChunkMetaInput,
  window: { startMs: number; nowMs: number },
): { ok: true; meta: ChunkMeta } | { ok: false; error: string } {
  if (!isRecordingStream(input.stream)) return { ok: false, error: 'stream must be webcam or screen' }
  const idx = Number(input.chunk_index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CHUNKS_PER_STREAM) return { ok: false, error: 'Invalid chunk_index' }
  let started = Number(input.started_at)
  if (!Number.isFinite(started)) started = window.nowMs
  // A browser clock can be off; keep the chunk inside [attempt start - 1 min, now].
  started = Math.min(Math.max(started, window.startMs - 60_000), window.nowMs)
  let dur = Number(input.duration_ms)
  if (!Number.isFinite(dur) || dur <= 0) dur = 60_000
  dur = Math.min(Math.round(dur), 10 * 60_000)
  const hasAudio = !(input.has_audio === false || input.has_audio === '0' || input.has_audio === 'false')
  const audioError = !hasAudio && typeof input.audio_error === 'string' ? input.audio_error.replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 60) : undefined
  return {
    ok: true,
    meta: {
      stream: input.stream,
      chunk_index: idx,
      started_at_ms: Math.round(started),
      duration_ms: dur,
      mime: normalizeMime(input.mime),
      has_audio: hasAudio,
      ...(audioError ? { audio_error: audioError } : {}),
    },
  }
}

/**
 * May this user upload recording chunks for the exam right now? Pure. Needs a
 * started attempt (exam_drafts) that is running, or ended less than
 * UPLOAD_GRACE_MS ago (the recorder flushes its last chunk after submit).
 */
export function uploadWindow(
  draft: { attempt_no?: unknown; attempt_started_at?: unknown; submitted_at?: unknown } | null,
  exam: { duration?: unknown; ends_at?: unknown } | null,
  nowMs: number,
): { ok: true; attemptNo: number; startMs: number } | { ok: false; error: string } {
  if (!draft || !exam) return { ok: false, error: 'No running attempt for this test' }
  const startMs = new Date(String(draft.attempt_started_at ?? '')).getTime()
  const attemptNo = Number(draft.attempt_no)
  if (!Number.isFinite(startMs) || !Number.isInteger(attemptNo) || attemptNo < 1) return { ok: false, error: 'No running attempt for this test' }
  const submittedMs = draft.submitted_at ? new Date(String(draft.submitted_at)).getTime() : NaN
  const durMin = Number(exam.duration)
  let endMs = Number.isFinite(durMin) && durMin > 0 ? startMs + durMin * 60_000 : startMs + NO_DEADLINE_MAX_MS
  const closes = exam.ends_at ? new Date(String(exam.ends_at)).getTime() : NaN
  if (Number.isFinite(closes)) endMs = Math.min(endMs, Math.max(closes, startMs))
  if (Number.isFinite(submittedMs) && submittedMs >= startMs) endMs = Math.min(endMs, submittedMs)
  if (nowMs > endMs + UPLOAD_GRACE_MS) return { ok: false, error: 'This attempt has ended' }
  return { ok: true, attemptNo, startMs }
}

export interface PlaylistItem {
  id: string
  chunk_index: number
  /** ms from the start of the recording (earliest chunk of any stream). */
  offset_ms: number
  duration_ms: number
  mime: string
  size: number
  has_audio: boolean
}
export interface PlaylistGap { stream: RecordingStream; after_index: number; missing: number[] }

/**
 * Build per-stream playlists with a shared time origin, so the player can
 * seek to the same moment on webcam and screen, and list gaps (missing chunk
 * indexes) so reviewers see where footage was lost. Pure.
 */
export function buildPlaylist(chunks: Array<Pick<RecordingChunkDoc, 'id' | 'stream' | 'chunk_index' | 'started_at_ms' | 'duration_ms' | 'mime' | 'size' | 'has_audio'>>): {
  origin_ms: number
  total_ms: number
  streams: Record<RecordingStream, PlaylistItem[]>
  gaps: PlaylistGap[]
} {
  const streams: Record<RecordingStream, PlaylistItem[]> = { webcam: [], screen: [] }
  if (!chunks.length) return { origin_ms: 0, total_ms: 0, streams, gaps: [] }
  const origin = Math.min(...chunks.map((c) => c.started_at_ms))
  let end = origin
  const gaps: PlaylistGap[] = []
  for (const s of RECORDING_STREAMS) {
    const rows = chunks.filter((c) => c.stream === s).sort((a, b) => a.chunk_index - b.chunk_index)
    // Offsets come from the browser's start times, but a chunk never starts before the previous one ends.
    let cursor = 0
    let prevIdx = -1
    for (const c of rows) {
      if (c.chunk_index === prevIdx) continue // duplicate (should not happen: unique index)
      if (c.chunk_index > prevIdx + 1) {
        const missing: number[] = []
        for (let i = prevIdx + 1; i < c.chunk_index && missing.length < 50; i++) missing.push(i)
        gaps.push({ stream: s, after_index: prevIdx, missing })
      }
      const offset = Math.max(c.started_at_ms - origin, cursor)
      streams[s].push({ id: c.id, chunk_index: c.chunk_index, offset_ms: offset, duration_ms: c.duration_ms, mime: c.mime, size: c.size, has_audio: c.has_audio })
      cursor = offset + c.duration_ms
      end = Math.max(end, origin + cursor)
      prevIdx = c.chunk_index
    }
  }
  return { origin_ms: origin, total_ms: end - origin, streams, gaps }
}

export { locate } from '@/lib/proctoring/recording-playback'

/** Parse a single "bytes=a-b" Range header against a length. Pure. */
export function parseRange(header: string | null, length: number): { start: number; end: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    start = Math.max(0, length - suffix)
    end = length - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? length - 1 : Math.min(Number(m[2]), length - 1)
  }
  if (start > end || start >= length) return null
  return { start, end }
}

export function signChunkToken(k: Uint8Array, chunkId: string, viewerId: string, now = Date.now()): string {
  return signToken(k, { k: VIEW_KIND, i: chunkId, n: 'r', u: viewerId, e: now + VIEW_URL_TTL_MS })
}
export function verifyChunkToken(k: Uint8Array, token: unknown, now = Date.now()): { chunkId: string; viewerId: string } | null {
  const p = verifyToken(k, token, VIEW_KIND, now)
  return p && p.u ? { chunkId: p.i, viewerId: p.u } : null
}

// ─── Keys ───────────────────────────────────────────────────────────────────
//
// W4-04 key ring. Order = preference for NEW chunks (first entry):
//   IDENTITY_MEDIA_KEY, SECRETS_ENCRYPTION_KEY,
//   IDENTITY_MEDIA_KEY_PREVIOUS, SECRETS_ENCRYPTION_KEY_PREVIOUS (comma-separated, read-only),
//   the session-derived key (read-only once an env key exists).
// Every chunk stores `key_id` (a fingerprint, not the key); decryption tries that
// key first and then every other key, so adding IDENTITY_MEDIA_KEY later, or
// rotating a key (move the old value to *_PREVIOUS), never loses recordings.
// See docs/devops/05-Production-Checklist.md "Key rotation".

export interface RingKey { kid: string; key: Uint8Array }

export function keyFingerprint(key: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(key)).update('kid').digest('hex').slice(0, 16)
}

/** Pure given env + the derived key. */
export function recordingKeyRing(env: Record<string, string | undefined>, derived: Uint8Array | null): RingKey[] {
  const raw: string[] = []
  for (const v of [env.IDENTITY_MEDIA_KEY, env.SECRETS_ENCRYPTION_KEY]) raw.push((v || '').trim())
  for (const v of [env.IDENTITY_MEDIA_KEY_PREVIOUS, env.SECRETS_ENCRYPTION_KEY_PREVIOUS]) {
    for (const part of String(v || '').split(',')) raw.push(part.trim())
  }
  const out: RingKey[] = []
  const seen = new Set<string>()
  const add = (key: Uint8Array) => {
    const kid = keyFingerprint(key)
    if (seen.has(kid)) return
    seen.add(kid)
    out.push({ kid, key })
  }
  for (const r of raw) if (r.length >= 32) add(new Uint8Array(createHash('sha256').update(`proctor-recording:${r}`).digest()))
  if (derived) add(derived)
  return out
}

/** Keys to try for a chunk: its own key_id first, then the rest. Pure. */
export function decryptOrder(ring: RingKey[], keyId: string | null | undefined): RingKey[] {
  if (!keyId) return ring
  const own = ring.filter((k) => k.kid === keyId)
  return [...own, ...ring.filter((k) => k.kid !== keyId)]
}

/** Try each key in order. Pure. */
export function decryptWithRing(ring: RingKey[], keyId: string | null | undefined, box: Buffer): Buffer | null {
  for (const k of decryptOrder(ring, keyId)) {
    const out = decryptBytesWithKey(k.key, box)
    if (out) return out
  }
  return null
}

async function keyRing(): Promise<RingKey[]> {
  const { deriveServerKey } = await import('@/lib/session')
  const derived = await deriveServerKey('proctor-recording').catch(() => null)
  return recordingKeyRing(process.env, derived)
}
async function dataKey(): Promise<RingKey> {
  const ring = await keyRing()
  if (!ring.length) throw new Error('No recording encryption key available')
  return ring[0]
}
async function viewKey(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('proctor-recording-view')
}
export async function chunkViewUrl(chunkId: string, viewerId: string): Promise<string> {
  return `/api/proctor/recordings/${chunkId}?t=${encodeURIComponent(signChunkToken(await viewKey(), chunkId, viewerId))}`
}
export async function verifyChunkViewToken(token: unknown) {
  return verifyChunkToken(await viewKey(), token)
}

// ─── Blob stores ────────────────────────────────────────────────────────────

export interface RecordingBlobStore {
  kind: 's3' | 'gridfs'
  put(key: string, bytes: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  del(key: string): Promise<void>
}

async function s3Store(): Promise<RecordingBlobStore | null> {
  try {
    const mod = await import('@/lib/s3-storage')
    if (!(await mod.readS3Config())) return null
    return {
      kind: 's3',
      put: (key, bytes) => mod.s3PutObject(key, bytes, 'application/octet-stream'),
      get: (key) => mod.s3GetObject(key).catch(() => null),
      del: (key) => mod.s3DeleteObject(key),
    }
  } catch {
    return null
  }
}

function gridfsStore(db: Db): RecordingBlobStore {
  // Lazy import keeps the mongodb driver out of client bundles that import the pure helpers.
  const bucket = async () => new (await import('mongodb')).GridFSBucket(db, { bucketName: GRIDFS_BUCKET })
  return {
    kind: 'gridfs',
    async put(key, bytes) {
      const b = await bucket()
      // Idempotent on retry: drop a partial file with the same name first.
      for (const f of await b.find({ filename: key }).toArray()) await b.delete(f._id).catch(() => {})
      await new Promise<void>((resolve, reject) => {
        const up = b.openUploadStream(key, { metadata: { kind: 'proctor-recording' } })
        up.once('finish', () => resolve())
        up.once('error', reject)
        up.end(bytes)
      })
    },
    async get(key) {
      const b = await bucket()
      const parts: Buffer[] = []
      try {
        for await (const c of b.openDownloadStreamByName(key)) parts.push(c as Buffer)
      } catch {
        return null
      }
      return Buffer.concat(parts)
    },
    async del(key) {
      const b = await bucket()
      for (const f of await b.find({ filename: key }).toArray()) await b.delete(f._id).catch(() => {})
    },
  }
}

/** Object storage when configured, else GridFS. */
export async function recordingStore(db: Db, kind?: 's3' | 'gridfs'): Promise<RecordingBlobStore> {
  if (kind === 'gridfs') return gridfsStore(db)
  const s3 = await s3Store()
  if (s3) return s3
  if (kind === 's3') throw new Error('Object storage is not configured')
  return gridfsStore(db)
}

async function withRetries<T>(fn: () => Promise<T>, tries = 3, baseMs = 300): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i))
    }
  }
  throw last
}

// ─── Store / read ───────────────────────────────────────────────────────────

let indexesReady: Promise<void> | null = null
export function ensureRecordingIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      try {
        await db.collection(CHUNKS).createIndex(
          { exam_id: 1, user_id: 1, attempt_no: 1, stream: 1, chunk_index: 1 },
          { unique: true, name: 'proctor_recording_chunk_unique' },
        )
        await db.collection(CHUNKS).createIndex({ id: 1 }, { unique: true, name: 'proctor_recording_chunk_id' })
        await db.collection(MANIFESTS).createIndex({ id: 1 }, { unique: true, name: 'proctor_recordings_id' })
        await db.collection(MANIFESTS).createIndex({ exam_id: 1, updated_at: -1 }, { name: 'proctor_recordings_exam' })
      } catch (e) {
        console.error('[recordings] ensure indexes:', (e as Error)?.message)
      }
    })()
  }
  return indexesReady
}

export type StoreChunkResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; status: 413 | 503; error: string }

function nowIso() { return new Date().toISOString() }

/** Record an upload failure on the attempt's manifest so staff see it (never shown to the candidate). */
export async function recordUploadFailure(
  db: Db,
  ctx: { examId: string; userId: string; tenantId: string | null; attemptNo: number },
  f: { stream: string; chunk_index: number; reason: string },
): Promise<void> {
  const at = nowIso()
  const reason = f.reason.replace(/[^A-Za-z0-9_ .:-]/g, '').slice(0, 80) || 'unknown'
  await db.collection(MANIFESTS).updateOne(
    { id: manifestId(ctx.examId, ctx.userId, ctx.attemptNo) },
    {
      $inc: { failed_uploads: 1 },
      $set: { last_error: reason, last_error_at: at, updated_at: at },
      $push: { failed_chunks: { $each: [{ stream: String(f.stream).slice(0, 10), chunk_index: f.chunk_index, reason, at }], $slice: -50 } } as never,
      $setOnInsert: {
        exam_id: ctx.examId, user_id: ctx.userId, tenant_id: ctx.tenantId, attempt_no: ctx.attemptNo,
        total_bytes: 0, chunk_count: 0, created_at: at,
      },
    },
    { upsert: true },
  ).catch((e) => console.error('[recordings] failure note:', (e as Error)?.message))
}

/**
 * Store one chunk. Idempotent: the same (attempt, stream, index) stored twice
 * returns the first id. Enforces the per-attempt byte cap atomically.
 */
export async function storeRecordingChunk(
  db: Db,
  ctx: { examId: string; userId: string; tenantId: string | null; attemptNo: number },
  meta: ChunkMeta,
  bytes: Buffer,
  store?: RecordingBlobStore,
): Promise<StoreChunkResult> {
  if (bytes.length === 0) return { ok: false, status: 413, error: 'Empty chunk' }
  if (bytes.length > CHUNK_MAX_BYTES) return { ok: false, status: 413, error: 'Chunk too large' }
  await ensureRecordingIndexes(db)
  const chunks = db.collection<RecordingChunkDoc>(CHUNKS)
  const ident = { exam_id: ctx.examId, user_id: ctx.userId, attempt_no: ctx.attemptNo, stream: meta.stream, chunk_index: meta.chunk_index }
  const existing = await chunks.findOne(ident, { projection: { _id: 0, id: 1 } })
  if (existing) return { ok: true, id: existing.id, duplicate: true }

  // Reserve bytes on the manifest (atomic cap check; upsert creates it).
  const mId = manifestId(ctx.examId, ctx.userId, ctx.attemptNo)
  const at = nowIso()
  const manifests = db.collection(MANIFESTS)
  const reserve = await manifests.updateOne(
    { id: mId, $expr: { $lte: [{ $add: [{ $ifNull: ['$total_bytes', 0] }, bytes.length] }, ATTEMPT_MAX_BYTES] } },
    { $inc: { total_bytes: bytes.length }, $set: { updated_at: at } },
  )
  if (reserve.matchedCount === 0) {
    const m = await manifests.findOne({ id: mId }, { projection: { _id: 0, id: 1 } })
    if (m) {
      await recordUploadFailure(db, ctx, { stream: meta.stream, chunk_index: meta.chunk_index, reason: 'attempt_size_cap' })
      return { ok: false, status: 413, error: 'Recording size limit reached for this attempt' }
    }
    try {
      await manifests.insertOne({
        id: mId, exam_id: ctx.examId, user_id: ctx.userId, tenant_id: ctx.tenantId, attempt_no: ctx.attemptNo,
        total_bytes: bytes.length, chunk_count: 0, failed_uploads: 0, created_at: at, updated_at: at,
      })
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
      // Created concurrently — reserve against it.
      const again = await manifests.updateOne(
        { id: mId, $expr: { $lte: [{ $add: [{ $ifNull: ['$total_bytes', 0] }, bytes.length] }, ATTEMPT_MAX_BYTES] } },
        { $inc: { total_bytes: bytes.length }, $set: { updated_at: at } },
      )
      if (again.matchedCount === 0) return { ok: false, status: 413, error: 'Recording size limit reached for this attempt' }
    }
  }
  const release = () => manifests.updateOne({ id: mId }, { $inc: { total_bytes: -bytes.length } }).catch(() => {})

  const blobs = store ?? (await recordingStore(db))
  const doc: RecordingChunkDoc = {
    id: randomUUID().replace(/-/g, ''),
    exam_id: ctx.examId, user_id: ctx.userId, tenant_id: ctx.tenantId, attempt_no: ctx.attemptNo,
    stream: meta.stream, chunk_index: meta.chunk_index, started_at_ms: meta.started_at_ms, duration_ms: meta.duration_ms,
    mime: meta.mime, size: bytes.length, storage: blobs.kind, key: '', has_audio: meta.has_audio,
    ...(meta.audio_error ? { audio_error: meta.audio_error } : {}),
    created_at: at,
  }
  doc.key = chunkKey(doc)
  try {
    const k = await dataKey()
    doc.key_id = k.kid
    const box = encryptBytesWithKey(k.key, bytes)
    await withRetries(() => blobs.put(doc.key, box))
  } catch (e) {
    await release()
    console.error('[recordings] store failed:', (e as Error)?.message?.slice(0, 200))
    await recordUploadFailure(db, ctx, { stream: meta.stream, chunk_index: meta.chunk_index, reason: `storage_${blobs.kind}_error` })
    return { ok: false, status: 503, error: 'Could not store the recording chunk' }
  }
  try {
    await chunks.insertOne(doc)
  } catch (e) {
    await release()
    if ((e as { code?: number })?.code === 11000) {
      const won = await chunks.findOne(ident, { projection: { _id: 0, id: 1 } })
      return { ok: true, id: won?.id ?? doc.id, duplicate: true }
    }
    throw e
  }
  await manifests.updateOne(
    { id: mId },
    {
      $inc: { chunk_count: 1 },
      $min: { first_chunk_at_ms: meta.started_at_ms },
      $max: { last_chunk_end_ms: meta.started_at_ms + meta.duration_ms },
      $set: { updated_at: nowIso() },
    },
  ).catch(() => {})
  return { ok: true, id: doc.id, duplicate: false }
}

let warnedUndecryptable = false
export async function readChunkBytes(db: Db, doc: Pick<RecordingChunkDoc, 'storage' | 'key' | 'key_id'>, store?: RecordingBlobStore): Promise<Buffer | null> {
  const blobs = store ?? (await recordingStore(db, doc.storage).catch(() => null))
  if (!blobs) return null
  const box = await blobs.get(doc.key)
  if (!box) return null
  const out = decryptWithRing(await keyRing(), doc.key_id, box)
  if (!out && !warnedUndecryptable) {
    warnedUndecryptable = true
    console.error('[recordings] a chunk could not be decrypted with any configured key — set the old value in IDENTITY_MEDIA_KEY_PREVIOUS / SECRETS_ENCRYPTION_KEY_PREVIOUS')
  }
  return out
}

/** Delete every chunk of the given manifests (retention). */
export async function deleteRecordings(db: Db, filter: Record<string, unknown>): Promise<number> {
  const rows = (await db.collection(CHUNKS).find(filter, { projection: { _id: 0, id: 1, key: 1, storage: 1 } }).toArray()) as unknown as Array<Pick<RecordingChunkDoc, 'id' | 'key' | 'storage'>>
  const stores: Partial<Record<'s3' | 'gridfs', RecordingBlobStore | null>> = {}
  for (const r of rows) {
    if (!(r.storage in stores)) stores[r.storage] = await recordingStore(db, r.storage).catch(() => null)
    await stores[r.storage]?.del(r.key).catch((e) => console.error('[recordings] delete failed', r.id, (e as Error)?.message))
  }
  if (rows.length) await db.collection(CHUNKS).deleteMany({ id: { $in: rows.map((r) => r.id) } })
  await db.collection(MANIFESTS).deleteMany(filter)
  return rows.length
}

/**
 * W4-14: walk candidate exam ids in batches and return up to `limit` exams
 * whose retention window has passed (closeAt null = count from the row date).
 * Exams still open are skipped without consuming the limit.
 */
export async function examsDueForPurge(
  db: Db,
  examIds: string[],
  cutoffMs: number,
  examCloseAt: (exam: Record<string, unknown> | null) => number | null,
  limit: number,
  batch = 500,
): Promise<Array<{ examId: string; closeAt: number | null }>> {
  const out: Array<{ examId: string; closeAt: number | null }> = []
  for (let i = 0; i < examIds.length && out.length < limit; i += batch) {
    const ids = examIds.slice(i, i + batch)
    const rows = await db.collection('exams')
      .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, ends_at: 1, status: 1, updatedAt: 1, archived_at: 1 } })
      .toArray()
    const byId = new Map(rows.map((r) => [String(r.id), r as Record<string, unknown>]))
    for (const examId of ids) {
      const closeAt = examCloseAt(byId.get(examId) ?? null)
      if (closeAt !== null && closeAt >= cutoffMs) continue
      out.push({ examId, closeAt })
      if (out.length >= limit) break
    }
  }
  return out
}

/**
 * Daily: purge recordings past the identity-media retention window
 * (closeAt = exam close; exams with no close date count from the chunk).
 * Also drops legacy base64 rows in `session_recordings`.
 */
export async function purgeExpiredRecordings(
  db: Db,
  cutoffMs: number,
  examCloseAt: (exam: Record<string, unknown> | null) => number | null,
  maxExams = 200,
): Promise<number> {
  const cutoffIso = new Date(cutoffMs).toISOString()
  let purged = 0
  // W4-14: still-open exams are skipped without using up the budget — only
  // exams actually purged count toward maxExams.
  const candidates = (await db.collection(CHUNKS).distinct('exam_id', { created_at: { $lt: cutoffIso } })) as string[]
  const due = await examsDueForPurge(db, candidates, cutoffMs, examCloseAt, maxExams)
  for (const { examId, closeAt } of due) {
    purged += await deleteRecordings(db, closeAt === null ? { exam_id: examId, created_at: { $lt: cutoffIso } } : { exam_id: examId })
  }
  await db.collection('session_recordings').deleteMany({ created_at: { $lt: cutoffIso } }).catch(() => {})
  return purged
}
