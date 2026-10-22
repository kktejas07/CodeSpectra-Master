/**
 * Shared upload storage (lib/storage/*): config parsing, key layout, the S3
 * driver against a mocked S3 client, direct-upload start/finish/claim, the
 * Mongo → S3 migration, and the contest / answer-file size rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, PutObjectTaggingCommand, S3Client,
} from '@aws-sdk/client-s3'
import { MemoryDb } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({
  db: null as unknown as InstanceType<typeof import('@/lib/rag/eval/memory-mongo').MemoryDb>,
  secrets: {} as Record<string, string>,
  scan: 'clean' as 'clean' | 'infected' | 'offline',
  streamed: [] as number[],
}))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db }))
vi.mock('@/lib/server-secrets-cache', () => ({ readServerSecrets: async () => h.secrets }))
vi.mock('@/lib/ai/backend', () => ({
  backendPost: vi.fn(async () => {
    if (h.scan === 'infected') throw new Error('Backend returned 422: infected')
    if (h.scan === 'offline') throw new Error('fetch failed')
    return { ok: true }
  }),
  backendPostStream: vi.fn(async (_path: string, body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader()
    let n = 0
    for (;;) { const r = await reader.read(); if (r.done) break; n += r.value.length }
    h.streamed.push(n)
    if (h.scan === 'infected') throw new Error('backend /internal/security/scan-stream returned 400: infected')
    if (h.scan === 'offline') throw new Error('fetch failed')
    return { clean: true, scanned_bytes: n }
  }),
}))
vi.mock('@aws-sdk/s3-request-presigner', async (orig) => {
  const real = await orig<typeof import('@aws-sdk/s3-request-presigner')>()
  return {
    ...real,
    getSignedUrl: vi.fn(async (client: unknown, cmd: { input: { Key: string } }, opts: { expiresIn: number }) =>
      client instanceof S3Client ? real.getSignedUrl(client, cmd as never, opts as never) : `https://bucket.test/${cmd.input.Key}?X-Amz-Expires=${opts.expiresIn}`),
  }
})

import { parseStorageConfig, type ObjectStorageConfig } from '@/lib/storage/config'
import { isUploadKey, migrationObjectKey, newObjectKey, tenantSegment } from '@/lib/storage/keys'
import { __setS3ClientForTests, presignedPutHeaders, s3PresignGet, s3PresignPut, sseParams } from '@/lib/storage/s3'
import { blobDownloadUrl, deleteBlobs, putBlob, readBlob } from '@/lib/storage/blobs'
import { checkDeclaredUpload, claimUpload, finishDirectUpload, planScan, runBackgroundScan, startDirectUpload, sweepUploads } from '@/lib/storage/uploads'
import { scanResultFromError, streamScanTimeoutMs } from '@/lib/storage/scan'
import { migrateInlineFiles } from '@/lib/storage/migrate'
import { checkFileHead, checkFileMeta, slotMaxBytes } from '@/lib/contests/participation'

// ─── Fake S3 ─────────────────────────────────────────────────────────────────

type Obj = { body: Buffer; type: string; sse?: string; tags?: string }
const bucket = new Map<string, Obj>()
const calls: string[] = []
const notFound = () => Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })

const fakeS3 = {
  send: vi.fn(async (cmd: unknown) => {
    const input = (cmd as { input: Record<string, unknown> }).input
    const key = String(input.Key)
    if (cmd instanceof PutObjectCommand) {
      calls.push(`put ${key}`)
      bucket.set(key, { body: Buffer.from(input.Body as Buffer), type: String(input.ContentType), sse: input.ServerSideEncryption as string | undefined })
      return {}
    }
    if (cmd instanceof HeadObjectCommand) {
      const o = bucket.get(key)
      if (!o) throw notFound()
      return { ContentLength: o.body.byteLength, ContentType: o.type, ServerSideEncryption: o.sse }
    }
    if (cmd instanceof GetObjectCommand) {
      const o = bucket.get(key)
      if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
      const m = /^bytes=(\d+)-(\d+)$/.exec(String(input.Range || ''))
      const body = m ? o.body.subarray(Number(m[1]), Number(m[2]) + 1) : o.body
      calls.push(m ? `range ${key}` : `get ${key}`)
      return { Body: { transformToByteArray: async () => new Uint8Array(body), transformToWebStream: () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(body)); c.close() } }) } }
    }
    if (cmd instanceof DeleteObjectCommand) { calls.push(`delete ${key}`); bucket.delete(key); return {} }
    if (cmd instanceof PutObjectTaggingCommand) {
      const o = bucket.get(key)
      if (o) o.tags = 'state=ready'
      return {}
    }
    throw new Error('unexpected command')
  }),
}

const AWS = { uploads_s3_bucket: 'cs-uploads', uploads_s3_region: 'ap-south-1' }
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2000, 7)])

/** What the browser does with the presigned PUT. */
function browserPut(key: string, body: Buffer, type: string, sse = 'AES256') {
  bucket.set(key, { body, type, sse, tags: 'state=pending' })
}

beforeEach(() => {
  h.db = new MemoryDb()
  h.secrets = {}
  h.scan = 'clean'
  h.streamed = []
  bucket.clear()
  calls.length = 0
  __setS3ClientForTests(fakeS3)
})

// ─── Config ──────────────────────────────────────────────────────────────────

describe('parseStorageConfig', () => {
  it('is off without a bucket and rejects invalid bucket names', () => {
    expect(parseStorageConfig({}, {})).toBeNull()
    expect(parseStorageConfig({ uploads_s3_bucket: 'Bad_Bucket' }, {})).toBeNull()
  })

  it('AWS: SSE-S3 by default, IAM role when keys are empty, pending tag on', () => {
    const c = parseStorageConfig({}, { UPLOADS_S3_BUCKET: 'cs-uploads' })!
    expect(c).toMatchObject({ bucket: 'cs-uploads', region: 'us-east-1', endpoint: '', forcePathStyle: false, sse: 'AES256', accessKeyId: '', pendingTag: true })
  })

  it('KMS when a key id is set; secrets win over env', () => {
    const c = parseStorageConfig({ uploads_s3_bucket: 'from-secrets', uploads_s3_kms_key_id: 'arn:aws:kms:ap-south-1:1:key/abc' }, { UPLOADS_S3_BUCKET: 'from-env' })!
    expect(c.bucket).toBe('from-secrets')
    expect(c.sse).toBe('aws:kms')
    expect(sseParams(c)).toEqual({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'arn:aws:kms:ap-south-1:1:key/abc' })
  })

  it('R2: auto region, virtual-host style, no SSE header, no tagging', () => {
    const c = parseStorageConfig({ uploads_s3_bucket: 'cs-uploads', uploads_s3_endpoint: 'https://acc.r2.cloudflarestorage.com/' }, {})!
    expect(c).toMatchObject({ region: 'auto', endpoint: 'https://acc.r2.cloudflarestorage.com', forcePathStyle: false, sse: 'none', pendingTag: false })
    expect(presignedPutHeaders(c, 'video/mp4')).toEqual({ 'Content-Type': 'video/mp4' })
  })

  it('MinIO: path style; SSE can be forced on', () => {
    const c = parseStorageConfig({ uploads_s3_bucket: 'cs-uploads', uploads_s3_endpoint: 'http://minio:9000', uploads_s3_sse: 'AES256' }, {})!
    expect(c.forcePathStyle).toBe(true)
    expect(c.sse).toBe('AES256')
  })
})

// ─── Keys ────────────────────────────────────────────────────────────────────

describe('object keys', () => {
  it('feature/tenant/month/random — no names or emails', () => {
    const k = newObjectKey('exam-answer', 'tenant_1', new Date(Date.UTC(2026, 9, 2)))
    expect(k).toMatch(/^u\/exam-answer\/t-tenant_1\/202610\/[0-9a-f]{32}$/)
    expect(isUploadKey(k)).toBe(true)
    expect(tenantSegment('jane@example.com')).toBe('platform')
    expect(newObjectKey('contest', null)).not.toBe(newObjectKey('contest', null))
  })

  it('migration keys are deterministic per row and still valid upload keys', () => {
    const a = migrationObjectKey('contest', null, 'f_1')
    expect(a).toBe(migrationObjectKey('contest', null, 'f_1'))
    expect(a).not.toBe(migrationObjectKey('contest', null, 'f_2'))
    expect(isUploadKey(a)).toBe(true)
    expect(isUploadKey('../etc/passwd')).toBe(false)
    expect(isUploadKey('courses/x/lesson.mp4')).toBe(false)
  })
})

// ─── Presigned URLs (real signer, no network) ────────────────────────────────

describe('presigned URLs', () => {
  const cfg: ObjectStorageConfig = { ...parseStorageConfig(AWS, {})!, accessKeyId: 'AKIDTEST', secretAccessKey: 'secret' }

  it('PUT signs content-type, content-length, SSE and the pending tag; never an ACL', async () => {
    __setS3ClientForTests(null)
    const r = await s3PresignPut(cfg, { key: 'u/contest/platform/202610/' + 'a'.repeat(32), contentType: 'video/mp4', size: 1234, expiresIn: 99_999 })
    const url = new URL(r.url)
    const signed = url.searchParams.get('X-Amz-SignedHeaders')!.split(';')
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host', 'x-amz-server-side-encryption', 'x-amz-tagging']))
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(900)
    expect(r.url).not.toMatch(/acl/i)
    expect(r.headers).toEqual({ 'Content-Type': 'video/mp4', 'x-amz-server-side-encryption': 'AES256', 'x-amz-tagging': 'state=pending' })
  })

  it('GET lasts at most 5 minutes and downloads as an attachment', async () => {
    __setS3ClientForTests(null)
    const u = new URL(await s3PresignGet(cfg, { key: 'u/contest/platform/202610/' + 'b'.repeat(32), filename: 'deck "final".pdf', expiresIn: 3600 }))
    expect(Number(u.searchParams.get('X-Amz-Expires'))).toBe(300)
    expect(u.searchParams.get('response-content-disposition')).toMatch(/^attachment; filename="deck _final_.pdf"/)
    expect(u.searchParams.get('response-content-type')).toBe('application/octet-stream')
  })
})

// ─── Blobs: S3 vs Mongo driver ───────────────────────────────────────────────

describe('putBlob / readBlob / deleteBlobs', () => {
  it('keeps bytes inline when no bucket is configured', async () => {
    const r = await putBlob({ feature: 'exam-cad', tenantId: 't1', bytes: Buffer.from('abc'), contentType: 'application/octet-stream' })
    expect(r).toEqual({ storage: 'db', data: Buffer.from('abc') })
    expect(await readBlob(r)).toEqual(Buffer.from('abc'))
    expect(await blobDownloadUrl(r, 'x.step')).toBeNull()
    expect(fakeS3.send).not.toHaveBeenCalledWith(expect.any(PutObjectCommand))
  })

  it('writes encrypted objects to the bucket, reads, presigns and deletes them', async () => {
    h.secrets = AWS
    const r = await putBlob({ feature: 'exam-cad', tenantId: 't1', bytes: Buffer.from('abc'), contentType: 'application/octet-stream' })
    if (r.storage !== 's3') throw new Error('expected s3')
    expect(bucket.get(r.s3_key)).toMatchObject({ sse: 'AES256' })
    expect(await readBlob(r)).toEqual(Buffer.from('abc'))
    expect(await blobDownloadUrl(r, 'x.step')).toMatch(/^https:\/\/bucket\.test\//)
    expect(await deleteBlobs([r, { storage: 's3', s3_key: '../not-ours' }])).toBe(0)
    expect(bucket.has(r.s3_key)).toBe(false)
  })
})

// ─── Direct uploads ──────────────────────────────────────────────────────────

describe('direct uploads', () => {
  const base = { feature: 'exam-answer' as const, tenantId: 't1', ownerId: 'u1', scope: 'exam:e1:q1:1', name: 'answer.mp4', contentType: 'video/mp4', maxBytes: 500 * 1048576, allowedTypes: ['video/mp4'] }
  const sniffMp4 = (head: Uint8Array) => Buffer.from(head.subarray(4, 8)).toString('latin1') === 'ftyp'

  it('pure declared checks', () => {
    expect(checkDeclaredUpload({ size: 0, contentType: 'video/mp4', maxBytes: 10, allowedTypes: ['video/mp4'] })).toMatch(/empty/)
    expect(checkDeclaredUpload({ size: 11, contentType: 'video/mp4', maxBytes: 10, allowedTypes: ['video/mp4'] })).toMatch(/under/)
    expect(checkDeclaredUpload({ size: 5, contentType: 'text/html', maxBytes: 10, allowedTypes: ['video/mp4'] })).toMatch(/not allowed/)
  })

  it('says inline when object storage is off', async () => {
    const r = await startDirectUpload({ ...base, size: MP4.length })
    expect(r).toMatchObject({ ok: false, status: 409, inline: true })
  })

  it('start → PUT → finish (size, range sniff, scan, tag) → claim once', async () => {
    h.secrets = AWS
    const s = await startDirectUpload({ ...base, size: MP4.length })
    if (!s.ok) throw new Error(s.error)
    expect(s.headers['x-amz-server-side-encryption']).toBe('AES256')
    const intent = await h.db.collection('storage_uploads').findOne({ id: s.upload_id })
    browserPut(intent!.key, MP4, 'video/mp4')

    expect((await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u2', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })).ok).toBe(false)
    const done = await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })
    if (!done.ok) throw new Error(done.error)
    expect(done.upload).toMatchObject({ status: 'ready', scan_status: 'clean', size: MP4.length })
    expect(calls).toContain(`range ${intent!.key}`)
    expect(bucket.get(intent!.key)!.tags).toBe('state=ready')

    expect(await claimUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: 'exam:e1:q2:1' })).toBeNull()
    expect((await claimUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope }))?.status).toBe('used')
    expect(await claimUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope })).toBeNull()
  })

  it('rejects and deletes a body of another size, wrong magic bytes, or malware', async () => {
    h.secrets = AWS
    for (const [body, scan, msg] of [
      [Buffer.concat([MP4, Buffer.from('x')]), 'clean', /size/],
      [Buffer.alloc(MP4.length, 1), 'clean', /does not match/],
      [MP4, 'infected', /scanner rejected/],
    ] as const) {
      h.scan = scan
      const s = await startDirectUpload({ ...base, size: MP4.length })
      if (!s.ok) throw new Error(s.error)
      const key = (await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.key
      browserPut(key, Buffer.from(body), 'video/mp4')
      const r = await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(msg)
      expect(bucket.has(key)).toBe(false)
      expect((await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.status).toBe('rejected')
    }
  })

  it('scanner offline: strict asks to retry (kept pending), soft stores as unscanned', async () => {
    h.secrets = AWS
    h.scan = 'offline'
    const s = await startDirectUpload({ ...base, size: MP4.length })
    if (!s.ok) throw new Error(s.error)
    browserPut((await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.key, MP4, 'video/mp4')
    const strict = await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'strict' })
    expect(strict).toMatchObject({ ok: false, status: 503 })
    const soft = await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })
    expect(soft.ok && soft.upload.scan_status).toBe('unscanned')
  })

  it('streams the object to the scanner (no whole-file buffer)', async () => {
    h.secrets = AWS
    const s = await startDirectUpload({ ...base, size: MP4.length })
    if (!s.ok) throw new Error(s.error)
    browserPut((await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.key, MP4, 'video/mp4')
    const done = await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'strict' })
    expect(done.ok).toBe(true)
    expect(h.streamed).toEqual([MP4.length])
  })

  describe('large files (above the inline scan size)', () => {
    const BIG = Buffer.concat([MP4, Buffer.alloc(1_200_000, 3)])
    const env = { ...process.env }
    beforeEach(() => { process.env.UPLOADS_SCAN_INLINE_MB = '1' })
    afterEach(() => { process.env = { ...env } })

    async function startBig() {
      const s = await startDirectUpload({ ...base, size: BIG.length })
      if (!s.ok) throw new Error(s.error)
      browserPut((await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.key, BIG, 'video/mp4')
      return s.upload_id
    }
    const finish = (id: string, scanMode: 'soft' | 'strict' = 'soft') => finishDirectUpload({ uploadId: id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode })

    it('scans in the background; unusable (409 upload_scanning) until clean, then ready', async () => {
      h.secrets = AWS
      const id = await startBig()
      // Hold the scan so the "still scanning" state is observable.
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      const backend = await import('@/lib/ai/backend')
      const orig = vi.mocked(backend.backendPostStream).getMockImplementation()!
      vi.mocked(backend.backendPostStream).mockImplementationOnce(async (...a) => { await gate; return orig(...a) })
      expect(await finish(id)).toMatchObject({ ok: false, status: 409, code: 'upload_scanning' })
      expect(await finish(id)).toMatchObject({ ok: false, status: 409, code: 'upload_scanning' })
      expect(await findReady(id)).toBeNull()
      release()
      await vi.waitFor(async () => expect((await h.db.collection('storage_uploads').findOne({ id }))!.status).toBe('ready'))
      const done = await finish(id)
      expect(done.ok && done.upload.scan_status).toBe('clean')
      expect(h.streamed).toEqual([BIG.length])
    })

    it('infected in the background: deleted, finish reports the rejection', async () => {
      h.secrets = AWS
      h.scan = 'infected'
      const id = await startBig()
      await finish(id)
      await vi.waitFor(async () => expect((await h.db.collection('storage_uploads').findOne({ id }))!.status).toBe('rejected'))
      expect(await finish(id)).toMatchObject({ ok: false, status: 400, code: 'scanner_rejected' })
    })

    it('scanner offline: stays pending even in soft mode, unless the admin allowed unscanned files for the feature', async () => {
      h.secrets = AWS
      h.scan = 'offline'
      const id = await startBig()
      await finish(id)
      await vi.waitFor(async () => expect((await h.db.collection('storage_uploads').findOne({ id }))!.scan_reason).toBe('offline'))
      expect(await finish(id, 'soft')).toMatchObject({ ok: false, status: 503, code: 'upload_scan_offline' })
      expect((await h.db.collection('storage_uploads').findOne({ id }))!.status).toBe('pending')
      h.secrets = { ...AWS, uploads_allow_unscanned: 'exam-answer' }
      const done = await finish(id)
      expect(done.ok && done.upload.scan_status).toBe('unscanned')
    })

    it('above the scan limit: refused at start unless allowed', async () => {
      h.secrets = AWS
      process.env.UPLOADS_SCAN_MAX_MB = '1'
      expect(await startDirectUpload({ ...base, size: BIG.length })).toMatchObject({ ok: false, status: 413, code: 'upload_too_large_to_scan' })
      h.secrets = { ...AWS, uploads_allow_unscanned: 'exam-answer,contest' }
      expect((await startDirectUpload({ ...base, size: BIG.length })).ok).toBe(true)
    })

    async function findReady(id: string) {
      return h.db.collection('storage_uploads').findOne({ id, status: 'ready' })
    }
  })

  it('planScan / scan helpers (pure)', () => {
    const limits = { scanBytes: 2000, scanInlineBytes: 100 }
    const now = 1_000_000
    expect(planScan({ size: 50, limits, allowUnscanned: false, now })).toBe('inline')
    expect(planScan({ size: 500, limits, allowUnscanned: false, now })).toBe('background')
    expect(planScan({ size: 500, limits, allowUnscanned: false, leaseUntil: new Date(now + 1), now })).toBe('wait')
    expect(planScan({ size: 500, limits, allowUnscanned: false, leaseUntil: new Date(now - 1), now })).toBe('background')
    expect(planScan({ size: 500, limits, allowUnscanned: false, reason: 'offline', failedAt: new Date(now - 1000), now })).toBe('offline')
    expect(planScan({ size: 500, limits, allowUnscanned: false, reason: 'offline', failedAt: new Date(now - 120_000), now })).toBe('background')
    expect(planScan({ size: 500, limits, allowUnscanned: true, reason: 'offline', failedAt: new Date(now), now })).toBe('ready_unscanned')
    expect(planScan({ size: 5000, limits, allowUnscanned: false, now })).toBe('reject_too_large')
    expect(planScan({ size: 5000, limits, allowUnscanned: true, now })).toBe('ready_unscanned')
    expect(planScan({ size: 500, limits, allowUnscanned: false, reason: 'too_large', now })).toBe('reject_too_large')
    expect(scanResultFromError('backend x returned 400: FOUND')).toEqual({ status: 'infected' })
    expect(scanResultFromError('backend x returned 413: big')).toEqual({ status: 'unscanned', reason: 'too_large' })
    expect(scanResultFromError('fetch failed')).toEqual({ status: 'unscanned', reason: 'offline' })
    expect(streamScanTimeoutMs(0)).toBe(60_000)
    expect(streamScanTimeoutMs(2048 * 1048576)).toBe(60_000 + 512_000)
    expect(streamScanTimeoutMs(1e13)).toBe(20 * 60_000)
    expect(typeof runBackgroundScan).toBe('function')
  })

  it('rejects an unencrypted object when SSE is required, and waits for a missing one', async () => {
    h.secrets = AWS
    const s = await startDirectUpload({ ...base, size: MP4.length })
    if (!s.ok) throw new Error(s.error)
    expect(await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })).toMatchObject({ status: 409 })
    browserPut((await h.db.collection('storage_uploads').findOne({ id: s.upload_id }))!.key, MP4, 'video/mp4', '')
    expect(await finishDirectUpload({ uploadId: s.upload_id, ownerId: 'u1', scope: base.scope, sniff: sniffMp4, scanMode: 'soft' })).toMatchObject({ ok: false, error: expect.stringMatching(/encrypted/) })
  })

  it('sweep deletes abandoned uploads', async () => {
    h.secrets = AWS
    const s = await startDirectUpload({ ...base, size: MP4.length })
    if (!s.ok) throw new Error(s.error)
    const col = h.db.collection('storage_uploads')
    const key = (await col.findOne({ id: s.upload_id }))!.key
    browserPut(key, MP4, 'video/mp4')
    await col.updateOne({ id: s.upload_id }, { $set: { expires_at: new Date(Date.now() - 2 * 3600_000) } })
    expect(await sweepUploads()).toEqual({ removed: 1, failed: 0 })
    expect(bucket.has(key)).toBe(false)
    expect((await col.findOne({ id: s.upload_id }))!.status).toBe('expired')
  })
})

// ─── Migration ───────────────────────────────────────────────────────────────

describe('migrateInlineFiles', () => {
  function withAggregate() {
    // MemoryDb has no aggregate: count + $binarySize sum over the inline filter.
    for (const name of ['exam_submission_files', 'contest_files', 'ats_bgv_files']) {
      const col = h.db.collection(name) as unknown as Record<string, unknown> & { find: (f: object) => { toArray: () => Promise<Record<string, unknown>[]> } }
      col.aggregate = (pipeline: { $match: object }[]) => ({
        toArray: async () => {
          const rows = await col.find(pipeline[0].$match).toArray()
          return rows.length ? [{ n: rows.length, bytes: rows.reduce((s, r) => s + (r.data as Uint8Array).byteLength, 0) }] : []
        },
      })
    }
  }

  it('dry run counts, real run moves + verifies, re-run is a no-op', async () => {
    withAggregate()
    await h.db.collection('exam_submission_files').insertOne({ id: 'f1', kind: 'answer', tenant_id: 't1', content_type: 'video/mp4', data: MP4 })
    await h.db.collection('exam_submission_files').insertOne({ id: 'f2', kind: 'answer', storage: 's3', s3_key: 'u/exam-answer/t-t1/202610/' + 'c'.repeat(32) })
    await h.db.collection('ats_bgv_files').insertOne({ id: 'b1', tenant_id: 't1', case_id: 'c1', data: Buffer.from('box') })
    await h.db.collection('ats_bgv_cases').insertOne({ id: 'c1', tenant_id: 't1', checks: [{ id: 'k1', documents: [{ id: 'b1', storage: 'db' }] }] })

    const caseUpdate = vi.spyOn(h.db.collection('ats_bgv_cases'), 'updateOne')
    expect(await migrateInlineFiles({ dryRun: false })).toMatchObject({ ok: false })
    h.secrets = AWS
    const dry = await migrateInlineFiles({ dryRun: true })
    if (!dry.ok) throw new Error(dry.error)
    expect(dry.reports.find((r) => r.target === 'exam_submission_files')).toMatchObject({ pending: 1, pending_bytes: MP4.length, moved: 0 })
    expect(bucket.size).toBe(0)

    const run = await migrateInlineFiles({ dryRun: false })
    if (!run.ok) throw new Error(run.error)
    expect(run.reports.map((r) => [r.target, r.moved, r.remaining])).toEqual([['exam_submission_files', 1, 0], ['contest_files', 0, 0], ['ats_bgv_files', 1, 0]])
    const f1 = await h.db.collection('exam_submission_files').findOne({ id: 'f1' })
    expect(f1).toMatchObject({ storage: 's3', s3_key: migrationObjectKey('exam-answer', 't1', 'f1') })
    expect(f1!.data).toBeUndefined()
    expect(bucket.get(f1!.s3_key)!.body.equals(MP4)).toBe(true)
    // MemoryDb has no `$[]` / arrayFilters: assert the atomic update MongoDB receives.
    expect(caseUpdate).toHaveBeenCalledWith(
      { id: 'c1', tenant_id: 't1' },
      { $set: { 'checks.$[].documents.$[d].storage': 's3', 'checks.$[].documents.$[d].s3_key': migrationObjectKey('ats-bgv', 't1', 'b1') } },
      { arrayFilters: [{ 'd.id': 'b1' }] },
    )
    expect(await h.db.collection('ats_bgv_files').findOne({ id: 'b1' })).toBeNull()

    const again = await migrateInlineFiles({ dryRun: false })
    expect(again.ok && again.reports.every((r) => r.moved === 0 && r.remaining === 0)).toBe(true)
  })
})

// ─── Contest size / type rules ───────────────────────────────────────────────

describe('contest file rules', () => {
  const video = { role: 'video' as const, label: 'Short video (MP4)', exts: ['mp4'], required: false, maxBytes: 9 * 1048576 }
  const deck = { role: 'deck' as const, label: 'Pitch deck', exts: ['pdf', 'pptx'], required: true, maxBytes: 9 * 1048576 }
  const limits = { videoBytes: 500 * 1048576, fileBytes: 100 * 1048576 }

  it('raises caps only when object storage is on', () => {
    expect(slotMaxBytes(video, false, limits)).toBe(9 * 1048576)
    expect(slotMaxBytes(video, true, limits)).toBe(500 * 1048576)
    expect(slotMaxBytes(deck, true, limits)).toBe(100 * 1048576)
  })

  it('declared checks, then magic bytes on the first bytes', () => {
    expect(checkFileMeta(video, 'clip.mov', 10, limits.videoBytes)).toMatch(/MP4/)
    expect(checkFileMeta(video, 'clip.mp4', 501 * 1048576, limits.videoBytes)).toMatch(/up to 500 MB/)
    expect(checkFileHead(video, 'clip.mp4', MP4.subarray(0, 64), 200 * 1048576, limits.videoBytes)).toBeNull()
    expect(checkFileHead(deck, 'deck.pdf', Buffer.from('not a pdf'), 9, limits.fileBytes)).toMatch(/does not match/)
  })
})

// ─── Answer-file rules ───────────────────────────────────────────────────────

describe('answerUploadRule', () => {
  const limits = { videoBytes: 500 * 1048576, fileBytes: 100 * 1048576, scanBytes: 2048 * 1048576, scanInlineBytes: 64 * 1048576 }
  it('videos get the large cap only with object storage; files keep the author cap', async () => {
    const { answerUploadRule } = await import('@/lib/storage/exam-answer-files')
    const video = { id: 'q1', type: 'video_response' }
    expect(answerUploadRule(video, 'answer.webm', false, limits)).toMatchObject({ kind: 'webm', maxBytes: 9 * 1048576 })
    expect(answerUploadRule(video, 'answer.mp4', true, limits)).toMatchObject({ kind: 'mp4', maxBytes: 500 * 1048576 })
    expect(answerUploadRule(video, 'answer.mov', true, limits)).toMatchObject({ status: 400 })
    const file = { id: 'q2', type: 'file_upload', upload: { allowed: ['pdf'], max_mb: 5 } }
    expect(answerUploadRule(file, 'cv.pdf', true, limits)).toMatchObject({ kind: 'pdf', maxBytes: 5 * 1048576 })
    expect(answerUploadRule(file, 'cv.exe', true, limits)).toMatchObject({ status: 400 })
    expect(answerUploadRule({ id: 'q3', type: 'mcq' }, 'a.pdf', true, limits)).toMatchObject({ status: 400 })
  })
})
