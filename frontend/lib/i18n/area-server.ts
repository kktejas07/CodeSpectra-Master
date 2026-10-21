/**
 * Translator for server components inside the signed-in app areas: base
 * catalogs + every area catalog (the server has no bundle to keep small).
 */
import 'server-only'
import { createTranslator, type Translator } from './catalog'
import { AREA_NAMESPACES } from './areas'
import { loadAreaMessages } from './area-load'
import { getServerI18n } from './server'
import type { Locale } from './config'

export async function getAreaI18n(): Promise<{ locale: Locale; t: Translator }> {
  const { locale, messages } = await getServerI18n()
  const area = await loadAreaMessages(locale, AREA_NAMESPACES)
  return { locale, t: createTranslator(locale, { ...messages, ...area }) }
}
