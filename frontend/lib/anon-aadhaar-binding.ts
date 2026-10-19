/**
 * Binding an Anon Aadhaar proof to the account that submits it (SEC-026).
 *
 *  - nullifierSeed: the proof MUST carry the platform's seed (normalised the
 *    same way the client component does), so a proof generated for another
 *    app can't be replayed here.
 *  - signal: the client proves with signal = anonAadhaarSignal(user.id); the
 *    circuit commits to hash(signal) as `signalHash`, so a proof made for one
 *    account is useless for another.
 *  - test mode (test Aadhaar QR codes) is refused in production.
 */
import { createHash } from 'node:crypto'

export const DEFAULT_NULLIFIER_SEED = '314159265358979'

/** Same normalisation as components/kyc/AnonAadhaarVerify (Number() of ≤15 digits). */
export function normalizeNullifierSeed(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 15) || DEFAULT_NULLIFIER_SEED
  return String(Number(digits))
}

/** Decimal signal (120 bits) derived from the user id. */
export function anonAadhaarSignal(userId: string): string {
  return BigInt('0x' + createHash('sha256').update(`anon-aadhaar:${userId}`).digest('hex').slice(0, 30)).toString()
}

/** keccak256-based hash used by @anon-aadhaar/core (src/hash.ts), as a decimal string. */
export async function anonAadhaarSignalHash(signal: string): Promise<string> {
  const [{ BigNumber }, { zeroPad }, { keccak256 }] = await Promise.all([
    import('@ethersproject/bignumber'),
    import('@ethersproject/bytes'),
    import('@ethersproject/keccak256'),
  ])
  const hex = BigNumber.from(signal).toTwos(256).toHexString()
  return (BigInt(keccak256(zeroPad(hex, 32))) >> BigInt(3)).toString()
}

export type AnonAadhaarBindingError = 'test_mode_in_production' | 'seed_mismatch' | 'signal_mismatch'

/** Pure part of the check (signal hash computed by the caller). */
export function checkAnonAadhaarBinding(input: {
  proofSeed: unknown
  cfgSeed: unknown
  proofSignalHash: unknown
  expectedSignalHash: string
  testMode: boolean
  production: boolean
}): AnonAadhaarBindingError | null {
  if (input.testMode && input.production) return 'test_mode_in_production'
  if (input.proofSeed == null || String(input.proofSeed).replace(/\D/g, '') === '') return 'seed_mismatch'
  if (normalizeNullifierSeed(input.proofSeed) !== normalizeNullifierSeed(input.cfgSeed)) return 'seed_mismatch'
  if (String(input.proofSignalHash ?? '') !== input.expectedSignalHash) return 'signal_mismatch'
  return null
}
