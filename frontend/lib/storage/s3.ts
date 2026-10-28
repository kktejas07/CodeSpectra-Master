/**
 * S3-compatible driver (AWS SDK v3). Private bucket only: no ACLs are ever
 * sent, every write carries the configured server-side encryption, presigned
 * GETs last at most 5 minutes and always download as an attachment.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GET_URL_TTL_SEC, PUT_URL_TTL_SEC, type ObjectStorageConfig } from './config'

/** The slice of S3Client we use; tests inject a fake through __setS3ClientForTests. */
export interface S3Like { send: S3Client['send'] }

let testClient: S3Like | null = null
const clients = new Map<string, S3Client>()

export function __setS3ClientForTests(c: S3Like | null): void {
  testClient = c
  clients.clear()
}

function client(cfg: ObjectStorageConfig): S3Client {
  if (testClient) return testClient as S3Client
  const id = JSON.stringify([cfg.endpoint, cfg.region, cfg.forcePathStyle, cfg.accessKeyId, cfg.secretAccessKey])
  let c = clients.get(id)
  if (!c) {
    c = new S3Client({
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint } : {}),
      forcePathStyle: cfg.forcePathStyle,
      // Keys empty → default provider chain (IAM role on EC2/ECS/EKS, env, profile).
      ...(cfg.accessKeyId && cfg.secretAccessKey ? { credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } } : {}),
      // Don't add CRC checksum headers to presigned PUTs (browsers can't compute them; R2/MinIO reject some).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    clients.set(id, c)
  }
  return c
}

/** SSE parameters for writes (none on R2/MinIO without KMS). */
export function sseParams(cfg: ObjectStorageConfig): { ServerSideEncryption?: 'AES256' | 'aws:kms'; SSEKMSKeyId?: string } {
  if (cfg.sse === 'none') return {}
  if (cfg.sse === 'aws:kms') return { ServerSideEncryption: 'aws:kms', ...(cfg.kmsKeyId ? { SSEKMSKeyId: cfg.kmsKeyId } : {}) }
  return { ServerSideEncryption: 'AES256' }
}

/** Headers the browser must send with a presigned PUT (they are part of the signature). */
export function presignedPutHeaders(cfg: ObjectStorageConfig, contentType: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': contentType }
  const sse = sseParams(cfg)
  if (sse.ServerSideEncryption) h['x-amz-server-side-encryption'] = sse.ServerSideEncryption
  if (sse.SSEKMSKeyId) h['x-amz-server-side-encryption-aws-kms-key-id'] = sse.SSEKMSKeyId
  if (cfg.pendingTag) h['x-amz-tagging'] = 'state=pending'
  return h
}

async function bodyBytes(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0)
  const b = body as { transformToByteArray?: () => Promise<Uint8Array> }
  if (typeof b.transformToByteArray === 'function') return Buffer.from(await b.transformToByteArray())
  if (body instanceof Uint8Array) return Buffer.from(body)
  throw new Error('Unexpected S3 body')
}

const isMissing = (e: unknown) => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } }
  return x?.name === 'NotFound' || x?.name === 'NoSuchKey' || x?.$metadata?.httpStatusCode === 404
}

export async function s3Put(cfg: ObjectStorageConfig, key: string, body: Buffer, contentType: string): Promise<void> {
  await client(cfg).send(new PutObjectCommand({
    Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength, ...sseParams(cfg),
  }))
}

export async function s3Get(cfg: ObjectStorageConfig, key: string): Promise<Buffer | null> {
  try {
    const r = await client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    return await bodyBytes(r.Body)
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

/** The object as a web stream (large-file virus scans; never buffered whole). Null when missing. */
export async function s3GetStream(cfg: ObjectStorageConfig, key: string): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const r = await client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    const b = r.Body as { transformToWebStream?: () => ReadableStream<Uint8Array> } | Uint8Array | undefined
    if (!b) return null
    if (b instanceof Uint8Array) return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(b)); c.close() } })
    if (typeof b.transformToWebStream === 'function') return b.transformToWebStream()
    throw new Error('Unexpected S3 body')
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

/** The first `n` bytes (for magic-byte checks without downloading a 500 MB video). */
export async function s3GetHead(cfg: ObjectStorageConfig, key: string, n: number): Promise<Buffer | null> {
  try {
    const r = await client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key, Range: `bytes=0-${Math.max(0, n - 1)}` }))
    return (await bodyBytes(r.Body)).subarray(0, n)
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

export async function s3Head(cfg: ObjectStorageConfig, key: string): Promise<{ size: number; contentType: string; sse: string } | null> {
  try {
    const r = await client(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }))
    return { size: Number(r.ContentLength ?? -1), contentType: String(r.ContentType || ''), sse: String(r.ServerSideEncryption || '') }
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

export async function s3Delete(cfg: ObjectStorageConfig, key: string): Promise<void> {
  try {
    await client(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } catch (e) {
    if (!isMissing(e)) throw e
  }
}

/** Clear the `state=pending` tag so the lifecycle rule no longer expires the object. */
export async function s3MarkReady(cfg: ObjectStorageConfig, key: string): Promise<void> {
  if (!cfg.pendingTag) return
  await client(cfg).send(new PutObjectTaggingCommand({ Bucket: cfg.bucket, Key: key, Tagging: { TagSet: [{ Key: 'state', Value: 'ready' }] } }))
}

/**
 * Presigned PUT for one object. Content-Type, Content-Length (exact size the
 * server approved), SSE and the pending tag are signed, so S3 rejects a body
 * of another size or type, and the URL can't be reused for another key.
 */
export async function s3PresignPut(cfg: ObjectStorageConfig, p: { key: string; contentType: string; size: number; expiresIn?: number }): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = presignedPutHeaders(cfg, p.contentType)
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: p.key,
    ContentType: p.contentType,
    ContentLength: p.size,
    ...sseParams(cfg),
    ...(cfg.pendingTag ? { Tagging: 'state=pending' } : {}),
  })
  const url = await getSignedUrl(client(cfg), cmd, {
    expiresIn: Math.min(PUT_URL_TTL_SEC, p.expiresIn ?? PUT_URL_TTL_SEC),
    signableHeaders: new Set(['content-type', 'content-length']),
    unhoistableHeaders: new Set(['x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id', 'x-amz-tagging']),
  })
  return { url, headers }
}

/** Presigned GET (≤ 5 min) that always downloads as an attachment with a generic type. */
export async function s3PresignGet(cfg: ObjectStorageConfig, p: { key: string; filename: string; expiresIn?: number; contentType?: string }): Promise<string> {
  const ascii = p.filename.replace(/[^\w.\- ]/g, '_').slice(0, 150) || 'file'
  const cmd = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: p.key,
    ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(p.filename.slice(0, 150))}`,
    ResponseContentType: p.contentType || 'application/octet-stream',
    ResponseCacheControl: 'private, no-store',
  })
  return getSignedUrl(client(cfg), cmd, { expiresIn: Math.max(1, Math.min(GET_URL_TTL_SEC, p.expiresIn ?? GET_URL_TTL_SEC)) })
}

/**
 * Connection test for the admin page: write a tiny encrypted object, read its
 * metadata back, delete it. Proves credentials, bucket, write + delete rights
 * and that the configured encryption is applied. Never throws.
 */
export async function s3Probe(cfg: ObjectStorageConfig, key: string): Promise<{ ok: true; latency_ms: number; encrypted: boolean } | { ok: false; step: 'write' | 'read' | 'delete'; error: string }> {
  const t0 = Date.now()
  let step: 'write' | 'read' | 'delete' = 'write'
  try {
    await s3Put(cfg, key, Buffer.from('codespectra storage probe'), 'text/plain')
    step = 'read'
    const head = await s3Head(cfg, key)
    if (!head) throw Object.assign(new Error('Object missing after write'), { name: 'NotFound' })
    step = 'delete'
    await s3Delete(cfg, key)
    return { ok: true, latency_ms: Date.now() - t0, encrypted: cfg.sse === 'none' ? !!head.sse : head.sse !== '' }
  } catch (e) {
    const x = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    // Error name / code / HTTP status only — never the message (it can echo the request).
    const code = x?.Code || x?.name || 'Error'
    return { ok: false, step, error: `${code}${x?.$metadata?.httpStatusCode ? ` (HTTP ${x.$metadata.httpStatusCode})` : ''}`.slice(0, 120) }
  }
}
