/**
 * The language to write to someone in: their saved interface language
 * (profile `ui_locale`, set from the language switcher) → English.
 * No cookie or Accept-Language here — the recipient is usually not the
 * person whose request triggered the message (an admin inviting a
 * candidate, a cron job, a webhook).
 *
 * Never throws: a lookup failure means English.
 */
import 'server-only'
import { DEFAULT_LOCALE, toLocale, type Locale } from './config'

/** Pure: profile value → locale (unset / unknown → English). */
export function recipientLocaleFrom(profile: { ui_locale?: unknown } | null | undefined): Locale {
  return toLocale(profile?.ui_locale) ?? DEFAULT_LOCALE
}

export async function localeForUser(userId: string | null | undefined): Promise<Locale> {
  if (!userId || userId.startsWith('candidate_')) return DEFAULT_LOCALE
  try {
    const { loadAuthProfile } = await import('@/lib/session')
    return recipientLocaleFrom((await loadAuthProfile(userId)) as { ui_locale?: unknown } | null)
  } catch {
    return DEFAULT_LOCALE
  }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/

/** For an email address that may or may not belong to an account (invites, candidates). */
export async function localeForEmail(email: string | null | undefined): Promise<Locale> {
  const e = String(email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(e)) return DEFAULT_LOCALE
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const u = await (await getMongoDb()).collection('user').findOne({ email: e }, { projection: { ui_locale: 1 } })
    return recipientLocaleFrom(u as { ui_locale?: unknown } | null)
  } catch {
    return DEFAULT_LOCALE
  }
}

/** Prefer the account id; fall back to the email address. */
export async function localeForRecipient(r: { userId?: string | null; email?: string | null }): Promise<Locale> {
  if (r.userId && !r.userId.startsWith('candidate_')) {
    const l = await localeForUser(r.userId)
    if (l !== DEFAULT_LOCALE || !r.email) return l
  }
  return localeForEmail(r.email)
}

/**
 * Auth emails sent while the person is on the page (sign-up, forgot password,
 * resend verification): their saved setting when the email has an account
 * with one, else the language they are using right now (cookie →
 * Accept-Language). Only call from a request handler.
 */
export async function localeForRequester(email: string | null | undefined): Promise<Locale> {
  const saved = await localeForEmail(email)
  if (saved !== DEFAULT_LOCALE) return saved
  try {
    const [{ cookies, headers }, { resolveLocale }, { LOCALE_COOKIE }] = await Promise.all([import('next/headers'), import('./negotiate'), import('./config')])
    const [c, h] = await Promise.all([cookies(), headers()])
    return resolveLocale({ cookie: c.get(LOCALE_COOKIE)?.value, acceptLanguage: h.get('accept-language') })
  } catch {
    return DEFAULT_LOCALE
  }
}
