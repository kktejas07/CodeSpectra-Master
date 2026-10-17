import { verifySync } from 'otplib'

/**
 * True only when `token` is a valid current TOTP code for `secret`
 * (±30s clock drift). otplib v13's `TOTP#verify` is async and returns a
 * Promise (always truthy), so never use it in an `if` — use this.
 */
export function checkTotp(token: unknown, secret: unknown): boolean {
  if (typeof token !== 'string' || typeof secret !== 'string' || !secret) return false
  const code = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return false
  try {
    return verifySync({ token: code, secret, epochTolerance: 30 } as Parameters<typeof verifySync>[0]).valid === true
  } catch {
    return false
  }
}
