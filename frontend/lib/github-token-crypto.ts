import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

/** 32-byte key, base64-encoded (generate with `openssl rand -base64 32`). */
export function getGitHubTokenEncryptionKey(): Buffer | null {
  const b64 = process.env.GITHUB_TOKEN_ENCRYPTION_KEY
  if (!b64?.trim()) return null
  const buf = Buffer.from(b64.trim(), 'base64')
  if (buf.length !== 32) {
    console.warn('[CodeSpectra] GITHUB_TOKEN_ENCRYPTION_KEY must be base64 decoding to exactly 32 bytes (AES-256).')
    return null
  }
  return buf
}

/** Store plaintext when no key is configured (dev); otherwise AES-256-GCM with `enc:v1:` prefix. */
export function encryptGitHubTokenForStorage(plain: string): string {
  const key = getGitHubTokenEncryptionKey()
  if (!key) return plain

  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${Buffer.concat([iv, ciphertext, tag]).toString('base64url')}`
}

export function decryptGitHubTokenIfNeeded(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored
  }
  const key = getGitHubTokenEncryptionKey()
  if (!key) {
    console.error('[CodeSpectra] Encrypted GitHub token in DB but GITHUB_TOKEN_ENCRYPTION_KEY is missing.')
    return ''
  }

  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
    if (raw.length < 12 + 16) {
      return ''
    }
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(raw.length - 16)
    const ciphertext = raw.subarray(12, raw.length - 16)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('[CodeSpectra] GitHub token decrypt failed:', e)
    return ''
  }
}
