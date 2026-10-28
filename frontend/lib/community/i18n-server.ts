/**
 * Server-side text from the `community` catalog in a recipient's language
 * (notifications and emails for cohorts, the forum and study groups).
 */
import 'server-only'
import { createTranslator, type MessageParams } from '@/lib/i18n/catalog'
import { loadAreaMessages } from '@/lib/i18n/area-load'
import type { Locale } from '@/lib/i18n/config'

export type LooseT = (key: string, params?: MessageParams) => string

export async function communityT(locale: Locale): Promise<LooseT> {
  const messages = await loadAreaMessages(locale, ['community'])
  const t = createTranslator(locale, messages) as unknown as LooseT
  return (key, params) => t(`community.${key}`, params)
}

/** Translator in the user's saved interface language (English when unknown). */
export async function communityTFor(userId: string): Promise<{ locale: Locale; t: LooseT }> {
  const { localeForUser } = await import('@/lib/i18n/recipient')
  const locale = await localeForUser(userId).catch(() => 'en' as Locale)
  return { locale, t: await communityT(locale) }
}

/** In-app notification with title / message rendered in the recipient's language. */
export async function notifyLocalized(userId: string, p: { type: string; titleKey: string; messageKey: string; params?: MessageParams; link: string; icon?: string; email?: boolean; metadata?: Record<string, unknown> }): Promise<void> {
  try {
    const { locale, t } = await communityTFor(userId)
    const { notify } = await import('@/lib/notifications')
    await notify({ user_id: userId, type: p.type, locale, title: t(p.titleKey, p.params), message: t(p.messageKey, p.params), link: p.link, icon: p.icon, send_email: p.email, metadata: p.metadata })
  } catch (e) {
    console.error('[community] notify failed', (e as Error)?.message)
  }
}
