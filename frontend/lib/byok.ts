/**
 * BYOK — Bring Your Own Key
 *
 * Free-tier users may supply their own LLM API key so they can use AI
 * features without purchasing a Pro plan. The key is stored AES-256-GCM
 * encrypted in the `user_byok` MongoDB collection; it is never logged or
 * returned in plaintext after save.
 *
 * Pro / Enterprise users always use the platform key pool — their BYOK key
 * (if any) is ignored so they never accidentally burn their own quota.
 *
 * Encryption key: BYOK_ENCRYPTION_KEY env var (32-byte hex, auto-generated
 * fallback for dev; MUST be set in production).
 */
import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { getMongoDb } from '@/lib/mongodb'
import { getUserEntitlements } from '@/lib/entitlements'

// ── Encryption helpers ──────────────────────────────────────────────────────

function getEncKey(): Buffer {
  const hex = process.env.BYOK_ENCRYPTION_KEY
  if (hex && hex.length === 64) return Buffer.from(hex, 'hex')
  // Dev fallback — deterministic but not secret; warn loudly
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BYOK_ENCRYPTION_KEY must be set in production (32-byte hex)')
  }
  return Buffer.alloc(32, 0x42) // 'BBBB…' for local dev only
}

function encrypt(plaintext: string): string {
  const key = getEncKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv(12) + tag(16) + ciphertext — all hex-joined with ':'
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

function decrypt(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid BYOK ciphertext format')
  const [ivHex, tagHex, ctHex] = parts
  const key = getEncKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

// ── Validation ──────────────────────────────────────────────────────────────

const VALID_PREFIXES = ['sk-', 'sk-or-v1-', 'AIza', 'gsk_']

export function validateApiKey(key: string, skipPrefixCheck = false): { ok: true } | { ok: false; error: string } {
  const k = key.trim()
  if (!k) return { ok: false, error: 'API key cannot be empty.' }
  if (k.length < 10) return { ok: false, error: 'API key looks too short.' }
  if (k.includes('•') || k.includes('*')) return { ok: false, error: 'Paste your full unmasked API key.' }
  // Custom gateway (e.g. brocode.live) may use arbitrary key formats — skip prefix check.
  if (!skipPrefixCheck && !VALID_PREFIXES.some((p) => k.startsWith(p))) {
    return { ok: false, error: 'Key must start with sk-, sk-or-v1-, AIza, or gsk_. For a custom gateway key, use Settings → AI Tools → Custom gateway.' }
  }
  return { ok: true }
}

// ── Detect provider from key prefix ────────────────────────────────────────

export function providerFromKey(key: string): string {
  if (key.startsWith('sk-or-v1-')) return 'openrouter'
  if (key.startsWith('AIza')) return 'gemini'
  if (key.startsWith('gsk_')) return 'groq'
  return 'openai' // sk- → OpenAI-compatible (brocode.live, openai, etc.)
}

// ── Persistence ─────────────────────────────────────────────────────────────

interface ByokDoc {
  user_id: string
  encrypted_key: string
  provider: string
  label?: string
  updated_at: Date
}

async function byokCol() {
  const db = await getMongoDb()
  return db.collection<ByokDoc>('user_byok')
}

/** Save (upsert) the user's BYOK key. Returns the detected provider. */
export async function saveByokKey(
  userId: string,
  rawKey: string,
): Promise<{ ok: true; provider: string } | { ok: false; error: string }> {
  const validation = validateApiKey(rawKey)
  if (!validation.ok) return validation

  const provider = providerFromKey(rawKey.trim())
  const encrypted_key = encrypt(rawKey.trim())
  const col = await byokCol()
  await col.updateOne(
    { user_id: userId },
    { $set: { user_id: userId, encrypted_key, provider, updated_at: new Date() } },
    { upsert: true },
  )
  return { ok: true, provider }
}

/** Delete the stored BYOK key for a user. */
export async function deleteByokKey(userId: string): Promise<void> {
  const col = await byokCol()
  await col.deleteOne({ user_id: userId })
}

/** Return the decrypted key + provider, or null if not set. */
async function getByokDoc(userId: string): Promise<{ key: string; provider: string } | null> {
  try {
    const col = await byokCol()
    const doc = await col.findOne({ user_id: userId })
    if (!doc) return null
    const key = decrypt(doc.encrypted_key)
    return { key, provider: doc.provider }
  } catch {
    return null
  }
}

/** Whether the user has a BYOK key saved. */
export async function hasByokKey(userId: string): Promise<boolean> {
  const col = await byokCol()
  return !!(await col.findOne({ user_id: userId }, { projection: { _id: 1 } }))
}

// ── Plan-gated resolution ───────────────────────────────────────────────────

export type KeySource = 'platform' | 'byok' | 'none'

export interface ResolvedKey {
  source: KeySource
  /** The API key to use. Empty string → caller should reject with 402/403. */
  key: string
  provider: string
  /** Human-readable reason when source === 'none'. */
  reason?: string
}

/**
 * Resolve which API key to use for a given user.
 *
 * - Pro / Enterprise → platform key (CUSTOM_API_KEY from env)
 * - Free with BYOK   → their stored key
 * - Free without     → none (UI should prompt them to add a key or upgrade)
 */
export async function resolveAiKey(userId: string): Promise<ResolvedKey> {
  const ent = await getUserEntitlements(userId)
  const plan = ent.planKey // 'free' | 'pro' | 'enterprise' | custom

  // Platform operators are never gated (same rule as hasEntitlement): a
  // superadmin on a free plan used to fall through to the BYOK branch and get
  // "Free plan requires your own API key" — a 402 on the copilot (2026-11-02).
  const { getMongoDb } = await import('@/lib/mongodb')
  const caller = (await getMongoDb()
    .then((db) => db.collection('user').findOne({ id: userId, role: 'superadmin' }, { projection: { role: 1 } }))
    .catch(() => null)) as { role?: string } | null
  const operator = caller?.role === 'superadmin'

  // Paid plans (and operators) use the platform pool. The gateway key lives in
  // platform_settings (`custom_api_key`), not an env var — reading only
  // process.env.CUSTOM_API_KEY handed paid users an EMPTY key.
  if (operator || plan !== 'free') {
    const fromSettings = await import('@/lib/ai/get-api-key')
      .then(({ getApiKey }) => getApiKey('custom' as never))
      .then((k) => k?.key ?? '')
      .catch(() => '')
    const platformKey = fromSettings || process.env.CUSTOM_API_KEY || ''
    if (platformKey) {
      return { source: 'platform', key: platformKey, provider: 'custom' }
    }
    if (operator) {
      return { source: 'none', key: '', provider: '', reason: 'No platform AI gateway is configured. Add one in Settings → AI.' }
    }
  }

  // Free tier — check for BYOK
  const byok = await getByokDoc(userId)
  if (byok?.key) {
    return {
      source: 'byok',
      key: byok.key,
      provider: byok.provider,
    }
  }

  return {
    source: 'none',
    key: '',
    provider: '',
    reason: 'Free plan requires your own API key. Add one in Settings → AI, or upgrade to Pro.',
  }
}
