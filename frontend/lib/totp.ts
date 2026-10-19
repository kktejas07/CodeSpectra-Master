import { verifySync } from 'otplib'
import { decryptSecretValue, encryptSecretValue, isEncryptedSecret, secretsEncryptionKey } from '@/lib/secrets-crypto'

const PERIOD_S = 30

/**
 * Authenticator secrets are stored sealed (AES-GCM, same env key as the
 * server-secrets store — lib/secrets-crypto.ts) when a key is configured
 * (audit A-054). Older plain-text secrets keep working.
 */
export function sealTotpSecret(secret: string): string {
  const key = secretsEncryptionKey()
  return key && !isEncryptedSecret(secret) ? encryptSecretValue(secret, key) : secret
}

export function openTotpSecret(stored: unknown): string | null {
  if (typeof stored !== 'string' || !stored) return null
  if (!isEncryptedSecret(stored)) return stored
  const key = secretsEncryptionKey()
  return key ? decryptSecretValue(stored, key) : null
}

/**
 * The 30-second time step the code matched (±1 step drift), or null.
 * Pure apart from the clock (`nowMs` for tests).
 */
export function totpMatchStep(token: unknown, storedSecret: unknown, nowMs = Date.now()): number | null {
  const secret = openTotpSecret(storedSecret)
  if (typeof token !== 'string' || !secret) return null
  const code = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return null
  try {
    const r = verifySync({ token: code, secret, epochTolerance: PERIOD_S, epoch: Math.floor(nowMs / 1000) } as Parameters<typeof verifySync>[0]) as {
      valid: boolean; delta?: number; epoch?: number
    }
    if (r.valid !== true) return null
    if (typeof r.epoch === 'number') return Math.floor(r.epoch / PERIOD_S)
    return Math.floor(nowMs / 1000 / PERIOD_S) + (r.delta ?? 0)
  } catch {
    return null
  }
}

/**
 * True only when `token` is a valid current TOTP code for `secret`
 * (±30s clock drift). otplib v13's `TOTP#verify` is async and returns a
 * Promise (always truthy), so never use it in an `if` — use this.
 * Does NOT stop replays — sign-in paths use consumeTotp.
 */
export function checkTotp(token: unknown, secret: unknown): boolean {
  return totpMatchStep(token, secret) !== null
}

/** Pure: may a code for `step` be accepted given the last accepted step? */
export function isFreshTotpStep(step: number, lastStep: unknown): boolean {
  return typeof lastStep !== 'number' || step > lastStep
}

/**
 * Verify AND burn a code (audit A-053): records the matched time step on the
 * user (`totp_last_step`) with a compare-and-set, so the same code — or any
 * older one — can't be used again, even by two requests racing.
 */
export async function consumeTotp(
  user: { _id?: unknown; id?: unknown; totp_secret?: unknown },
  token: unknown,
  secret: unknown = user.totp_secret,
): Promise<boolean> {
  const step = totpMatchStep(token, secret)
  if (step === null) return false
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const idFilter = user._id !== undefined ? { _id: user._id } : { id: user.id }
  const res = await db.collection('user').updateOne(
    { ...idFilter, $or: [{ totp_last_step: { $exists: false } }, { totp_last_step: { $lt: step } }] } as never,
    { $set: { totp_last_step: step } },
  )
  return res.matchedCount === 1
}
