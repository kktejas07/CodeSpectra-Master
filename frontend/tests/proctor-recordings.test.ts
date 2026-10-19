import { describe, it, expect, beforeAll } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'
import {
  buildPlaylist, parseChunkMeta, parseRange, uploadWindow, storeRecordingChunk, readChunkBytes,
  signChunkToken, verifyChunkToken, CHUNK_MAX_BYTES, CHUNKS, MANIFESTS, manifestId, purgeExpiredRecordings,
  type RecordingBlobStore,
} from '@/lib/proctoring/recordings'
import { locate } from '@/lib/proctoring/recording-playback'
import { retryDelayMs, isRetryableStatus } from '@/lib/proctoring/recording-upload'

beforeAll(() => { process.env.SECRETS_ENCRYPTION_KEY = 'x'.repeat(40) })

function memStore(fail = false): RecordingBlobStore & { blobs: Map<string, Buffer> } {
  const blobs = new Map<string, Buffer>()
  return {
    kind: 'gridfs',
    blobs,
    async put(k, b) { if (fail) throw new Error('down'); blobs.set(k, b) },
    async get(k) { return blobs.get(k) ?? null },
    async del(k) { blobs.delete(k) },
  }
}
const ctx = { examId: 'e1', userId: 'u1', tenantId: 't1', attemptNo: 1 }
const meta = (i: number, stream: 'webcam' | 'screen' = 'webcam') => ({ stream, chunk_index: i, started_at_ms: 1_000_000 + i * 60_000, duration_ms: 60_000, mime: 'video/webm', has_audio: true })

describe('upload window (CORE-013)', () => {
  const exam = { duration: 60 }
  const start = '2026-10-19T10:00:00.000Z'
  const t0 = Date.parse(start)
  it('needs a started attempt', () => {
    expect(uploadWindow(null, exam, t0).ok).toBe(false)
    expect(uploadWindow({ attempt_no: 1 }, exam, t0).ok).toBe(false)
  })
  it('accepts during the attempt and a short grace after the deadline', () => {
    const d = { attempt_no: 2, attempt_started_at: start }
    expect(uploadWindow(d, exam, t0 + 30 * 60_000)).toEqual({ ok: true, attemptNo: 2, startMs: t0 })
    expect(uploadWindow(d, exam, t0 + 70 * 60_000).ok).toBe(true)
    expect(uploadWindow(d, exam, t0 + 80 * 60_000).ok).toBe(false)
  })
  it('closes 15 minutes after submit', () => {
    const d = { attempt_no: 1, attempt_started_at: start, submitted_at: new Date(t0 + 10 * 60_000).toISOString() }
    expect(uploadWindow(d, exam, t0 + 20 * 60_000).ok).toBe(true)
    expect(uploadWindow(d, exam, t0 + 26 * 60_000).ok).toBe(false)
  })
})

describe('chunk metadata', () => {
  const win = { startMs: 1_000_000, nowMs: 2_000_000 }
  it('validates stream and index, clamps timestamps', () => {
    expect(parseChunkMeta({ stream: 'desktop', chunk_index: 0 }, win).ok).toBe(false)
    expect(parseChunkMeta({ stream: 'webcam', chunk_index: -1 }, win).ok).toBe(false)
    const r = parseChunkMeta({ stream: 'screen', chunk_index: '3', started_at: 99_999_999, duration_ms: 'x', mime: 'text/html', has_audio: false, audio_error: 'NotAllowedError<script>' }, win)
    expect(r.ok && r.meta).toMatchObject({ stream: 'screen', chunk_index: 3, started_at_ms: 2_000_000, duration_ms: 60_000, mime: 'video/webm', has_audio: false, audio_error: 'NotAllowedErrorscript' })
  })
})

describe('playlist + seek', () => {
  it('orders chunks, shares one clock across streams and reports gaps', () => {
    const rows = [
      { id: 'c2', stream: 'webcam' as const, chunk_index: 2, started_at_ms: 1_120_000, duration_ms: 60_000, mime: 'video/webm', size: 1, has_audio: true },
      { id: 'c0', stream: 'webcam' as const, chunk_index: 0, started_at_ms: 1_000_000, duration_ms: 60_000, mime: 'video/webm', size: 1, has_audio: true },
      { id: 's0', stream: 'screen' as const, chunk_index: 0, started_at_ms: 1_005_000, duration_ms: 60_000, mime: 'video/webm', size: 1, has_audio: false },
    ]
    const p = buildPlaylist(rows)
    expect(p.origin_ms).toBe(1_000_000)
    expect(p.streams.webcam.map((i) => [i.id, i.offset_ms])).toEqual([['c0', 0], ['c2', 120_000]])
    expect(p.streams.screen[0].offset_ms).toBe(5_000)
    expect(p.total_ms).toBe(180_000)
    expect(p.gaps).toEqual([{ stream: 'webcam', after_index: 0, missing: [1] }])
    expect(locate(p.streams.webcam, 30_000)).toEqual({ index: 0, within_ms: 30_000 })
    expect(locate(p.streams.webcam, 90_000)).toEqual({ index: 1, within_ms: 0 }) // inside the gap → next part
    expect(locate(p.streams.webcam, 150_000)).toEqual({ index: 1, within_ms: 30_000 })
    expect(locate(p.streams.webcam, 500_000)).toBeNull()
  })
  it('parses byte ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=200-', 100)).toBeNull()
    expect(parseRange(null, 100)).toBeNull()
  })
  it('view tokens are bound to the viewer and expire', () => {
    const k = new Uint8Array(32).fill(7)
    const t = signChunkToken(k, 'c1', 'admin1', 1000)
    expect(verifyChunkToken(k, t, 1000)).toEqual({ chunkId: 'c1', viewerId: 'admin1' })
    expect(verifyChunkToken(k, t, 1000 + 31 * 60_000)).toBeNull()
    expect(verifyChunkToken(new Uint8Array(32).fill(8), t, 1000)).toBeNull()
  })
})

describe('storing chunks (CORE-011)', () => {
  it('stores encrypted bytes outside the metadata doc and reads them back', async () => {
    const db = new FakeDb()
    const store = memStore()
    const bytes = Buffer.from('webm-bytes-'.repeat(100))
    const r = await storeRecordingChunk(db as never, ctx, meta(0), bytes, store)
    expect(r.ok).toBe(true)
    const doc = db.collection(CHUNKS).docs[0]
    expect(doc).not.toHaveProperty('data')
    expect(doc.size).toBe(bytes.length)
    const stored = store.blobs.get(doc.key)!
    expect(stored.includes(Buffer.from('webm-bytes'))).toBe(false) // encrypted at rest
    expect((await readChunkBytes(db as never, doc as never, store))?.equals(bytes)).toBe(true)
    const m = db.collection(MANIFESTS).docs[0]
    expect(m).toMatchObject({ id: manifestId('e1', 'u1', 1), total_bytes: bytes.length, chunk_count: 1 })
  })

  it('is idempotent for a retried upload of the same part', async () => {
    const db = new FakeDb()
    const store = memStore()
    const a = await storeRecordingChunk(db as never, ctx, meta(0), Buffer.from('a'.repeat(50)), store)
    const b = await storeRecordingChunk(db as never, ctx, meta(0), Buffer.from('a'.repeat(50)), store)
    expect(a.ok && b.ok && b.duplicate && a.id === b.id).toBe(true)
    expect(db.collection(CHUNKS).docs).toHaveLength(1)
    expect(db.collection(MANIFESTS).docs[0].total_bytes).toBe(50)
  })

  it('rejects oversize chunks and enforces the per-attempt cap', async () => {
    const db = new FakeDb()
    const store = memStore()
    expect(await storeRecordingChunk(db as never, ctx, meta(0), Buffer.alloc(CHUNK_MAX_BYTES + 1), store)).toMatchObject({ ok: false, status: 413 })
    await storeRecordingChunk(db as never, ctx, meta(0), Buffer.alloc(10), store)
    db.collection(MANIFESTS).docs[0].total_bytes = Number.MAX_SAFE_INTEGER - 5 // at the cap
    const r = await storeRecordingChunk(db as never, ctx, meta(1), Buffer.alloc(10), store)
    expect(r).toMatchObject({ ok: false, status: 413 })
    expect(db.collection(MANIFESTS).docs[0]).toMatchObject({ failed_uploads: 1, last_error: 'attempt_size_cap' })
  })

  it('records a storage failure for the reviewer and releases the reserved bytes', async () => {
    const db = new FakeDb()
    const r = await storeRecordingChunk(db as never, ctx, meta(0), Buffer.alloc(10), memStore(true))
    expect(r).toMatchObject({ ok: false, status: 503 })
    expect(db.collection(CHUNKS).docs).toHaveLength(0)
    expect(db.collection(MANIFESTS).docs[0]).toMatchObject({ total_bytes: 0, failed_uploads: 1, last_error: 'storage_gridfs_error' })
  }, 10_000)

  it('purges recordings of exams closed before the cutoff', async () => {
    const db = new FakeDb()
    const store = memStore()
    await storeRecordingChunk(db as never, ctx, meta(0), Buffer.alloc(10), store)
    db.collection(CHUNKS).docs[0].created_at = '2020-01-01T00:00:00.000Z'
    db.collection(CHUNKS).docs[0].storage = 'gridfs'
    await db.collection('exams').insertOne({ id: 'e1', ends_at: '2020-02-01T00:00:00.000Z' })
    // Exam still inside retention → kept.
    await purgeExpiredRecordings(db as never, Date.parse('2020-01-15T00:00:00Z'), (e) => Date.parse(String(e?.ends_at)))
    expect(db.collection(CHUNKS).docs).toHaveLength(1)
  })
})

describe('client retry policy', () => {
  it('backs off and only retries transient failures', () => {
    expect(retryDelayMs(0)).toBe(2000)
    expect(retryDelayMs(1)).toBe(5000)
    expect(retryDelayMs(10)).toBe(60_000)
    expect([408, 429, 500, 503].every(isRetryableStatus)).toBe(true)
    expect([400, 401, 403, 413].some(isRetryableStatus)).toBe(false)
  })
})
