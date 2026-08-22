/**
 * S3-compatible object storage for course media.
 * One client: Cloudflare R2, AWS S3, GCS (HMAC), Hetzner Object Storage, MinIO on a VPS.
 * ponytail: not GCS XML / Azure blob APIs — those providers all speak S3.
 */
import { createHash, createHmac } from 'crypto'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import {
  endpointHost,
  lessonObjectKey,
  normalizeEndpoint,
  r2EndpointFromAccount,
  type S3Provider,
} from '@/lib/s3-presets'

export type { S3Provider }
export { lessonObjectKey, lessonVideoKey, r2EndpointFromAccount, normalizeEndpoint, endpointHost, presetFor } from '@/lib/s3-presets'

const SERVICE = 's3'
const SIGNED_GET_TTL_SEC = 3600

export type S3Config = {
  provider: S3Provider
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export async function readS3Config(): Promise<S3Config | null> {
  const s = await readServerSecrets()
  const accessKeyId = (s.s3_access_key_id || s.r2_access_key_id || process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (s.s3_secret_access_key || s.r2_secret_access_key || process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '').trim()
  const bucket = (s.s3_bucket || s.r2_bucket || process.env.S3_BUCKET || process.env.R2_BUCKET || '').trim()
  const accountId = (s.r2_account_id || process.env.R2_ACCOUNT_ID || '').trim()
  const provider = (s.s3_provider || (accountId ? 'r2' : '') || 'custom') as S3Provider
  let endpoint = normalizeEndpoint(s.s3_endpoint || process.env.S3_ENDPOINT || '')
  if (!endpoint && accountId) endpoint = r2EndpointFromAccount(accountId)
  const region = (s.s3_region || process.env.S3_REGION || (provider === 'r2' || provider === 'gcs' ? 'auto' : 'us-east-1')).trim()
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null
  return { provider: provider || 'custom', endpoint, region: region || 'us-east-1', bucket, accessKeyId, secretAccessKey }
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function amzDate(d = new Date()): { amz: string; day: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amz: iso, day: iso.slice(0, 8) }
}

function encodePath(path: string): string {
  return path.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

function signingKey(secret: string, day: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, day)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

function authorization(opts: {
  cfg: S3Config
  method: string
  path: string
  query: string
  headers: Record<string, string>
  payloadHash: string
  amz: string
  day: string
}): string {
  const signed = Object.keys(opts.headers).map(h => h.toLowerCase()).sort()
  const canonicalHeaders = signed.map(h => `${h}:${opts.headers[h]}\n`).join('')
  const canonical = [
    opts.method,
    opts.path,
    opts.query,
    canonicalHeaders,
    signed.join(';'),
    opts.payloadHash,
  ].join('\n')
  const scope = `${opts.day}/${opts.cfg.region}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', opts.amz, scope, sha256Hex(canonical)].join('\n')
  const sig = createHmac('sha256', signingKey(opts.cfg.secretAccessKey, opts.day, opts.cfg.region))
    .update(stringToSign)
    .digest('hex')
  return `AWS4-HMAC-SHA256 Credential=${opts.cfg.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}`
}

async function s3Fetch(cfg: S3Config, method: string, objectPath: string, body?: Buffer, extraHeaders?: Record<string, string>): Promise<Response> {
  const host = endpointHost(cfg.endpoint)
  const path = `/${encodePath(cfg.bucket)}/${encodePath(objectPath.replace(/^\//, ''))}`
  const { amz, day } = amzDate()
  const payloadHash = body ? sha256Hex(body) : sha256Hex('')
  const toSign: Record<string, string> = {
    host,
    'x-amz-date': amz,
    'x-amz-content-sha256': payloadHash,
  }
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) toSign[k.toLowerCase()] = v
  }
  const headers: Record<string, string> = { ...toSign }
  headers.authorization = authorization({
    cfg, method, path, query: '', headers: toSign, payloadHash, amz, day,
  })
  return fetch(`${cfg.endpoint}${path}`, { method, headers, body: body ? new Uint8Array(body) : undefined })
}

export async function s3GetObject(key: string): Promise<Buffer> {
  const cfg = await readS3Config()
  if (!cfg) throw new Error('Object storage is not configured')
  const res = await s3Fetch(cfg, 'GET', key)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 GET ${res.status}: ${text.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function s3PutObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const cfg = await readS3Config()
  if (!cfg) throw new Error('Object storage is not configured')
  const res = await s3Fetch(cfg, 'PUT', key, body, { 'content-type': contentType })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 PUT ${res.status}: ${text.slice(0, 200)}`)
  }
}

export async function s3DeleteObject(key: string): Promise<void> {
  const cfg = await readS3Config()
  if (!cfg) return
  const res = await s3Fetch(cfg, 'DELETE', key)
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 DELETE ${res.status}: ${text.slice(0, 200)}`)
  }
}

/** List object keys under a prefix (for wiping a course’s media). */
export async function s3ListPrefix(prefix: string): Promise<string[]> {
  const cfg = await readS3Config()
  if (!cfg) return []
  const keys: string[] = []
  let token: string | undefined
  do {
    const host = endpointHost(cfg.endpoint)
    const path = `/${encodePath(cfg.bucket)}`
    const pairs: [string, string][] = [
      ['list-type', '2'],
      ['prefix', prefix],
      ['max-keys', '1000'],
    ]
    if (token) pairs.push(['continuation-token', token])
    const query = pairs
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .sort()
      .join('&')
    const { amz, day } = amzDate()
    const payloadHash = sha256Hex('')
    const toSign: Record<string, string> = {
      host,
      'x-amz-date': amz,
      'x-amz-content-sha256': payloadHash,
    }
    const headers: Record<string, string> = { ...toSign }
    headers.authorization = authorization({
      cfg, method: 'GET', path, query, headers: toSign, payloadHash, amz, day,
    })
    const res = await fetch(`${cfg.endpoint}${path}?${query}`, { method: 'GET', headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`S3 LIST ${res.status}: ${text.slice(0, 200)}`)
    }
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1])
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    token = next?.[1]
    const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml)
    if (!truncated) break
  } while (token)
  return keys
}

export async function s3HeadObject(key: string): Promise<boolean> {
  const cfg = await readS3Config()
  if (!cfg) return false
  const res = await s3Fetch(cfg, 'HEAD', key)
  return res.ok
}

export async function s3SignedGetUrl(key: string, expiresSec = SIGNED_GET_TTL_SEC): Promise<string> {
  const cfg = await readS3Config()
  if (!cfg) throw new Error('Object storage is not configured')
  const host = endpointHost(cfg.endpoint)
  const path = `/${encodePath(cfg.bucket)}/${encodePath(key)}`
  const { amz, day } = amzDate()
  const scope = `${day}/${cfg.region}/${SERVICE}/aws4_request`
  const queryPairs: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKeyId}/${scope}`],
    ['X-Amz-Date', amz],
    ['X-Amz-Expires', String(expiresSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  const query = queryPairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&')
  const canonical = ['GET', path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonical)].join('\n')
  const sig = createHmac('sha256', signingKey(cfg.secretAccessKey, day, cfg.region)).update(stringToSign).digest('hex')
  return `${cfg.endpoint}${path}?${query}&X-Amz-Signature=${sig}`
}

const CORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Accept-Ranges</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Range</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`

export async function s3PutBucketCors(): Promise<void> {
  const cfg = await readS3Config()
  if (!cfg) throw new Error('Object storage is not configured')
  const host = endpointHost(cfg.endpoint)
  const path = `/${encodePath(cfg.bucket)}`
  const body = Buffer.from(CORS_XML)
  const { amz, day } = amzDate()
  const payloadHash = sha256Hex(body)
  const md5 = createHash('md5').update(body).digest('base64')
  const signedHeaders = { host, 'content-md5': md5, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz }
  const auth = authorization({
    cfg, method: 'PUT', path, query: 'cors=', headers: signedHeaders, payloadHash, amz, day,
  })
  const res = await fetch(`${cfg.endpoint}${path}?cors=`, {
    method: 'PUT',
    headers: { ...signedHeaders, authorization: auth, 'content-type': 'application/xml', 'content-md5': md5 },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 CORS ${res.status}: ${text.slice(0, 200)}`)
  }
}

export async function s3Ping(): Promise<{ ok: true; bucket: string; provider: string; endpoint: string }> {
  const cfg = await readS3Config()
  if (!cfg) throw new Error('Fill provider, endpoint, bucket, access key, and secret first')
  const key = `_health/${Date.now()}.txt`
  await s3PutObject(key, Buffer.from('ok'), 'text/plain')
  const exists = await s3HeadObject(key)
  await s3DeleteObject(key)
  if (!exists) throw new Error('Uploaded health object but HEAD failed')
  try { await s3PutBucketCors() } catch { /* some providers lock CORS to the console */ }
  return { ok: true, bucket: cfg.bucket, provider: cfg.provider, endpoint: cfg.endpoint }
}

/** @deprecated use lessonObjectKey */
export const lessonR2Key = lessonObjectKey
/** @deprecated use readS3Config */
export const readR2Config = readS3Config
export const r2PutObject = s3PutObject
export const r2DeleteObject = s3DeleteObject
export const r2SignedGetUrl = s3SignedGetUrl
export const r2Ping = s3Ping
export function r2Host(accountId: string): string {
  return endpointHost(r2EndpointFromAccount(accountId))
}
