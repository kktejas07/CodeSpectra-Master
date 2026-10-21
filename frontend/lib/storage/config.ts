/**
 * Private upload storage configuration (lib/storage/*).
 *
 * One S3-compatible bucket for user uploads (exam answer files and videos,
 * CAD files, contest submissions, BGV documents): AWS S3, Cloudflare R2 or
 * MinIO (custom endpoint + path-style). Read from admin server secrets
 * (Settings → server secrets, keys `uploads_s3_*`) first, then env
 * (`UPLOADS_S3_*`). When no bucket is set the callers keep storing bytes in
 * MongoDB with their old caps.
 *
 * This is deliberately separate from the course-media bucket (lib/s3-storage):
 * that one has a public-read style CORS rule for the video player, this one is
 * private, encrypted and only reachable through short presigned URLs.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'

export type SseMode = 'AES256' | 'aws:kms' | 'none'

export interface ObjectStorageConfig {
  bucket: string
  region: string
  /** Empty for AWS S3; https://<account>.r2.cloudflarestorage.com or a MinIO URL otherwise. */
  endpoint: string
  forcePathStyle: boolean
  /** Empty → the SDK's default provider chain (IAM role, ECS task role, env, profile). */
  accessKeyId: string
  secretAccessKey: string
  sse: SseMode
  kmsKeyId: string
  /** Tag direct uploads `state=pending` until finalized (needs object tagging; AWS and MinIO, not R2). */
  pendingTag: boolean
}

type Source = Record<string, string | undefined>

const pick = (s: Source, env: Source, key: string): string =>
  String(s[`uploads_s3_${key}`] ?? '').trim() || String(env[`UPLOADS_S3_${key.toUpperCase()}`] ?? '').trim()

const truthy = (v: string) => /^(1|true|yes|on)$/i.test(v)

/** Pure: config from a secrets record + env, or null when no bucket is configured. */
export function parseStorageConfig(secrets: Source, env: Source): ObjectStorageConfig | null {
  const bucket = pick(secrets, env, 'bucket')
  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null
  const endpoint = pick(secrets, env, 'endpoint').replace(/\/+$/, '')
  if (endpoint && !/^https?:\/\/[^\s/]+/.test(endpoint)) return null
  const r2 = /\.r2\.cloudflarestorage\.com$/i.test(endpoint.replace(/^https?:\/\//, '').split('/')[0] || '')
  const region = pick(secrets, env, 'region') || (r2 ? 'auto' : 'us-east-1')
  const kmsKeyId = pick(secrets, env, 'kms_key_id')
  const sseRaw = pick(secrets, env, 'sse').toLowerCase()
  // Default: KMS when a key id is given, SSE-S3 on AWS, none on R2/MinIO (R2 always encrypts at rest;
  // MinIO needs KMS set up before it accepts SSE headers).
  const sse: SseMode = sseRaw === 'none' ? 'none'
    : sseRaw === 'aws:kms' || sseRaw === 'kms' || kmsKeyId ? 'aws:kms'
      : sseRaw === 'aes256' || !endpoint ? 'AES256'
        : 'none'
  const pathStyleRaw = pick(secrets, env, 'force_path_style')
  const tagRaw = pick(secrets, env, 'pending_tag')
  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: pathStyleRaw ? truthy(pathStyleRaw) : !!endpoint && !r2,
    accessKeyId: pick(secrets, env, 'access_key_id'),
    secretAccessKey: pick(secrets, env, 'secret_access_key'),
    sse,
    kmsKeyId: sse === 'aws:kms' ? kmsKeyId : '',
    pendingTag: tagRaw ? truthy(tagRaw) : !r2,
  }
}

export async function readStorageConfig(): Promise<ObjectStorageConfig | null> {
  const secrets = (await readServerSecrets().catch(() => ({}))) as Source
  return parseStorageConfig(secrets, process.env as Source)
}

// ─── Limits ──────────────────────────────────────────────────────────────────

const MB = 1024 * 1024
const envMb = (name: string, fallback: number, max: number) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 1 ? Math.min(max, Math.floor(n)) : fallback
}

/** Caps when object storage is on (direct browser uploads). Off: each caller keeps its ~9 MB cap. */
export function largeUploadLimits() {
  return {
    videoBytes: envMb('UPLOADS_VIDEO_MAX_MB', 500, 5000) * MB,
    fileBytes: envMb('UPLOADS_FILE_MAX_MB', 100, 2000) * MB,
    /** Files above this are stored but not sent to the scanner (it takes the whole file in one request). */
    scanBytes: envMb('UPLOADS_SCAN_MAX_MB', 64, 1024) * MB,
  }
}

/** Presigned URL lifetimes. GET is capped at 5 minutes. */
export const PUT_URL_TTL_SEC = 15 * 60
export const GET_URL_TTL_SEC = 300
