/**
 * At-rest encryption for platform_settings.secrets (audit A-028).
 *
 * Values are stored as "enc:v1:" + base64url(iv | tag | ciphertext), AES-256-GCM.
 *
 * Key (environment only — never read from the database):
 *   1. SECRETS_ENCRYPTION_KEY (32+ chars)               ← set this in production
 *   2. else derived from the SESSION_SECRET *environment* value as it was at
 *      boot (lib/session.ts later overwrites process.env.SESSION_SECRET with
 *      the stored copy; we read the boot snapshot SESSION_SECRET_BOOT).
 *   3. else no key → values stay plain text (a warning is logged once in prod).
 *
 * Note: Docker images run scripts/hydrate-runtime-secrets.mjs, which fills
 * SESSION_SECRET from the DB before `next start`. With that setup the fallback
 * (2) is only as safe as the DB, so production must set SECRETS_ENCRYPTION_KEY.
 *
 * Rotating the key: values encrypted with the old key fail to decrypt and are
 * treated as unset (env fallback applies) — re-enter them in Admin → Settings.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

export const ENC_PREFIX = 'enc:v1:'

/**
 * Fields that stay plain text: bootstrap values read before this module can
 * help (session secret, read by scripts/hydrate-runtime-secrets.*) and values
 * the Python backend reads straight from Mongo (backend/core/auth.py,
 * backend/core/dependencies.py).
 */
export const PLAINTEXT_SECRET_FIELDS: ReadonlySet<string> = new Set([
  'session_secret',
  'internal_backend_secret',
  'upstash_redis_rest_url',
  'upstash_redis_rest_token',
])

function bootSessionSecret(): string {
  const boot = process.env.SESSION_SECRET_BOOT
  return (boot !== undefined ? boot : process.env.SESSION_SECRET || '').trim()
}

/** 32-byte key from env, or null when none is configured. Pure given env. */
export function secretsEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const explicit = (env.SECRETS_ENCRYPTION_KEY || '').trim()
  if (explicit.length >= 32) return createHash('sha256').update(`cs-secrets:${explicit}`).digest()
  return legacySecretsKey(env)
}

/**
 * The session-derived key used before SECRETS_ENCRYPTION_KEY was set (SEC-018).
 * Kept for DECRYPTION only, so turning the env key on never loses data: values
 * sealed with it are read and re-sealed with the env key on the next save /
 * migration pass.
 */
export function legacySecretsKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const session = env === process.env ? bootSessionSecret() : (env.SESSION_SECRET_BOOT ?? env.SESSION_SECRET ?? '').trim()
  if (session.length >= 32 && !session.includes('•')) {
    return createHmac('sha256', session).update('codespectra:server-secrets-at-rest').digest()
  }
  return null
}

/**
 * SEC-018: in production the encryption keys must come from the deployment
 * secret store, not be derived from SESSION_SECRET (which is itself stored in
 * Mongo). Returns the problems; empty = OK. Pure given env.
 */
export function encryptionKeyProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  if ((env.SECRETS_ENCRYPTION_KEY || '').trim().length < 32) out.push('SECRETS_ENCRYPTION_KEY (32+ chars) is not set')
  const media = (env.IDENTITY_MEDIA_KEY || env.SECRETS_ENCRYPTION_KEY || '').trim()
  if (media.length < 32) out.push('IDENTITY_MEDIA_KEY (or SECRETS_ENCRYPTION_KEY) is not set')
  return out
}

export function isEncryptedSecret(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(ENC_PREFIX)
}

export function encryptSecretValue(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ENC_PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')
}

/**
 * Plain text, or null. Tries `key`, then the legacy session-derived key (so
 * values sealed before SECRETS_ENCRYPTION_KEY was set stay readable).
 */
export function decryptSecretValue(box: string, key: Buffer): string | null {
  const primary = decryptWithOneKey(box, key)
  if (primary !== null) return primary
  const legacy = legacySecretsKey()
  return legacy && !legacy.equals(key) ? decryptWithOneKey(box, legacy) : null
}

export function decryptWithOneKey(box: string, key: Buffer): string | null {
  if (!isEncryptedSecret(box)) return null
  try {
    const raw = Buffer.from(box.slice(ENC_PREFIX.length), 'base64url')
    if (raw.length < 29) return null
    const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

let warnedNoKey = false
let warnedBadKey = false

/**
 * Decrypt every enc:v1: value in a stored record. Undecryptable values are
 * dropped (treated as unset). Returns the plain record and whether any secret
 * field is still plain text and should be migrated.
 */
export function decryptSecretsRecord<T extends Record<string, unknown>>(
  stored: T,
  secretFields: readonly string[],
  key: Buffer | null = secretsEncryptionKey(),
): { plain: T; needsMigration: boolean } {
  const out: Record<string, unknown> = {}
  let needsMigration = false
  const secretSet = new Set(secretFields)
  for (const [k, v] of Object.entries(stored || {})) {
    if (isEncryptedSecret(v)) {
      let p = key ? decryptWithOneKey(v, key) : null
      if (p === null) {
        // Sealed with the legacy (session-derived) key → readable, re-seal it.
        const legacy = legacySecretsKey()
        if (legacy && (!key || !legacy.equals(key))) {
          p = decryptWithOneKey(v, legacy)
          if (p !== null && key) needsMigration = true
        }
      }
      if (p === null) {
        if (!warnedBadKey) {
          warnedBadKey = true
          console.error('[secrets] an encrypted server secret could not be decrypted — check SECRETS_ENCRYPTION_KEY (field treated as unset)')
        }
        continue
      }
      out[k] = p
    } else {
      out[k] = v
      if (key && typeof v === 'string' && v.trim() && secretSet.has(k) && !PLAINTEXT_SECRET_FIELDS.has(k)) {
        needsMigration = true
      }
    }
  }
  if (!key && process.env.NODE_ENV === 'production' && !warnedNoKey) {
    warnedNoKey = true
    console.warn('[secrets] SECRETS_ENCRYPTION_KEY is not set — server secrets are stored unencrypted')
  }
  return { plain: out as T, needsMigration }
}

/**
 * Encrypt the secret fields of a plain record for storage. Already-encrypted
 * values are kept; plain-text fields and non-secret fields pass through.
 */
export function encryptSecretsRecord<T extends Record<string, unknown>>(
  plain: T,
  secretFields: readonly string[],
  key: Buffer | null = secretsEncryptionKey(),
): T {
  if (!key) return { ...plain }
  const secretSet = new Set(secretFields)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(plain || {})) {
    if (typeof v === 'string' && v && secretSet.has(k) && !PLAINTEXT_SECRET_FIELDS.has(k) && !isEncryptedSecret(v)) {
      out[k] = encryptSecretValue(v, key)
    } else {
      out[k] = v
    }
  }
  return out as T
}
