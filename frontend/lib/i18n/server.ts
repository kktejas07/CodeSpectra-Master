/**
 * Request locale for server components and route handlers.
 * Profile setting (signed in) → `cs_locale` cookie → Accept-Language → en.
 *
 * Reading cookies makes a segment dynamic, so this is only called from
 * segments that already render per request (dashboard, auth, assessment —
 * they need the CSP nonce anyway). Public cached pages never call it and stay
 * English; a Learn post in Hindi / Telugu renders its chrome from the post's
 * own language instead (see app/learn/[slug]).
 */
import 'server-only'
import { cookies, headers } from 'next/headers'
import { LOCALE_COOKIE, type Locale } from './config'
import { resolveLocale } from './negotiate'
import { createTranslator, type Messages, type Translator } from './catalog'
import { loadMessages } from './load'

const SESSION_COOKIE = 'codespectra_session'

/** Saved interface language of a user id (null when unset or the DB is down). */
export async function profileLocale(uid: string): Promise<string | null> {
  try {
    const { loadAuthProfile } = await import('@/lib/session')
    const p = await loadAuthProfile(uid)
    return typeof p?.ui_locale === 'string' ? p.ui_locale : null
  } catch {
    return null
  }
}

async function sessionLocale(token: string): Promise<string | null> {
  try {
    const { verifySessionToken } = await import('@/lib/session')
    const s = await verifySessionToken(token)
    return s?.uid ? profileLocale(s.uid) : null
  } catch {
    return null
  }
}

export async function getRequestLocale(opts: { userId?: string | null } = {}): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()])
  let profile: string | null = null
  if (opts.userId) profile = await profileLocale(opts.userId)
  else {
    const token = c.get(SESSION_COOKIE)?.value
    if (token) profile = await sessionLocale(token)
  }
  return resolveLocale({ profile, cookie: c.get(LOCALE_COOKIE)?.value, acceptLanguage: h.get('accept-language') })
}

export async function getServerI18n(locale?: Locale): Promise<{ locale: Locale; messages: Messages; t: Translator }> {
  const l = locale ?? (await getRequestLocale())
  const messages = await loadMessages(l)
  return { locale: l, messages, t: createTranslator(l, messages) }
}
