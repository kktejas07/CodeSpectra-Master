/**
 * The one origin browsers talk to for private uploads (lib/storage): presigned
 * PUT (connect-src) and GET (img-src / media-src). Derived from the storage
 * config exactly as the AWS SDK builds presigned URLs (checked against
 * @aws-sdk/s3-request-presigner):
 *
 *   AWS, virtual-hosted   https://<bucket>.s3.<region>.amazonaws.com
 *   AWS, path-style       https://s3.<region>.amazonaws.com
 *   endpoint, path-style  <endpoint origin>                 (MinIO)
 *   endpoint, virtual     <scheme>://<bucket>.<endpoint host> (R2, MinIO vhost)
 *
 * Nothing when no bucket is configured.
 */
import type { ObjectStorageConfig } from '@/lib/storage/config'

type OriginInput = Pick<ObjectStorageConfig, 'bucket' | 'region' | 'endpoint' | 'forcePathStyle'>

/** Pure: config → origin (or null). */
export function storageOrigin(cfg: OriginInput | null | undefined): string | null {
  if (!cfg?.bucket) return null
  if (!cfg.endpoint) {
    const region = /^[a-z0-9-]{2,32}$/.test(cfg.region) ? cfg.region : 'us-east-1'
    return cfg.forcePathStyle ? `https://s3.${region}.amazonaws.com` : `https://${cfg.bucket}.s3.${region}.amazonaws.com`
  }
  try {
    const u = new URL(cfg.endpoint)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return cfg.forcePathStyle ? u.origin : `${u.protocol}//${cfg.bucket}.${u.host}`
  } catch {
    return null
  }
}

const TTL_MS = 60_000
let memo: { at: number; value: string | null } | null = null

/**
 * Current origin for the proxy: storage config read lazily (server secrets are
 * cached in lib/server-secrets-cache), memoised 60 s, never throws, never
 * waits more than 300 ms (a slow DB must not stall page responses).
 */
export async function currentStorageOrigin(now = Date.now()): Promise<string | null> {
  if (memo && now - memo.at < TTL_MS) return memo.value
  let value: string | null = memo?.value ?? null
  try {
    const { readStorageConfig } = await import('@/lib/storage/config')
    const cfg = await Promise.race([
      readStorageConfig(),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 300)),
    ])
    if (cfg !== undefined) value = storageOrigin(cfg)
  } catch {
    /* keep the last known value */
  }
  memo = { at: now, value }
  return value
}

/** Tests / admin save: forget the memo. */
export function resetStorageOriginCache(): void {
  memo = null
}
