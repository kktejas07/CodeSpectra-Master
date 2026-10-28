/**
 * CTF flags and dynamic scoring (pure, server-side: uses node:crypto).
 *
 * Flags are stored only as HMAC-SHA256(per-contest salt, flag) and checked
 * with a constant-time compare, so a database read never reveals a flag and
 * response timing never hints at a prefix.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function newSalt(): string {
  return randomBytes(16).toString('hex')
}

/** Flags compare exactly after trimming surrounding whitespace. */
export function hashFlag(salt: string, flag: string): string {
  return createHmac('sha256', salt).update(String(flag ?? '').trim(), 'utf8').digest('hex')
}

export function verifyFlag(salt: string, attempt: string, storedHash: string): boolean {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false
  const a = Buffer.from(hashFlag(salt, attempt), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export { ctfValue } from './ctf-value'
