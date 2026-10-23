/**
 * Linking a Google/GitHub identity to an existing account with the same email
 * (SEC-006 — pre-registration account takeover).
 *
 * Attack: someone signs up victim@gmail.com with their own password (no
 * verification needed), then the real owner clicks "Sign in with Google". If
 * we simply attach the Google uid, the attacker keeps a working password /
 * authenticator / face login / sessions on the victim's account.
 *
 * Rule:
 *  - provider did not verify the email               → refuse (conflict)
 *  - existing account's email was verified by us     → link as before
 *  - existing account never verified its email       → the provider just proved
 *    ownership, so every credential someone else may have planted is removed
 *    (password, TOTP, face template, trusted devices, other OAuth links, all
 *    sessions) before linking, and the email is marked verified.
 */

export type LinkDecision = 'link' | 'link_after_reset' | 'conflict'

export function oauthLinkDecision(
  existing: { emailVerified?: unknown } | null | undefined,
  providerEmailVerified: boolean,
): LinkDecision {
  if (!providerEmailVerified) return 'conflict'
  if (existing && existing.emailVerified === true) return 'link'
  return 'link_after_reset'
}

/** $set / $unset for a takeover-safe link. Pure (unit tested). */
export function credentialResetUpdate(firebaseUid: string, now: Date = new Date()): {
  $set: Record<string, unknown>
  $unset: Record<string, ''>
} {
  return {
    $set: {
      firebase_uid: firebaseUid,
      emailVerified: true,
      email_verified_at: now,
      email_verified_via: 'oauth_link',
      updatedAt: now,
    },
    $unset: {
      passwordHash: '',
      totp_enabled: '',
      totp_secret: '',
      totp_pending_secret: '',
      facial_biometric_template: '',
      reset_token_hash: '',
      reset_token_expires: '',
      verification_token_hash: '',
      verification_token_expires: '',
    },
  }
}

/** Tell the owner what happened (best effort, never throws). */
export async function notifyCredentialReset(email: string, via: 'Google/GitHub' | 'single sign-on'): Promise<void> {
  if (!email) return
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const { emailTemplatesFor } = await import('@/lib/email-templates')
    const { localeForEmail } = await import('@/lib/i18n/recipient')
    const { outboundT } = await import('@/lib/i18n/outbound')
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
    // SEO-033: in the account owner's language.
    const locale = await localeForEmail(email)
    const viaText = outboundT('email', locale)(via === 'single sign-on' ? 'signinSecured.viaSso' : 'signinSecured.viaOauth')
    await sendEmail(email, emailTemplatesFor(locale).notice({ key: 'signinSecured', params: { via: viaText, url: `${origin}/auth/forgot-password` } }), undefined, { category: 'transactional' })
  } catch {
    /* best effort */
  }
}
