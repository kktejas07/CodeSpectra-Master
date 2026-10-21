/**
 * Helpers for the Hindi / Telugu public routes (app/[lang]/…): read the
 * locale segment, and translate shared copy such as the FAQ lists in
 * lib/seo/faq-content.ts (keys are the English question text).
 */
import 'server-only'
import { notFound } from 'next/navigation'
import type { Locale } from './config'
import { isPrefixedLocale, type PrefixedLocale } from './public-paths'
import { publicT, type PublicTranslator } from './public-server'
import type { QA } from '@/lib/seo/jsonld'
import { buildMetadata, type PageMetaInput } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

export type LangParams = Promise<{ lang: string }>

/** The [lang] segment as a locale; anything else is a 404 (the layout also checks). */
export async function langOf(params: LangParams): Promise<PrefixedLocale> {
  const { lang } = await params
  if (!isPrefixedLocale(lang)) notFound()
  return lang
}

/** FAQ items in the page language; English text is the key and the fallback. */
export function localizeFaqs(items: QA[], t: PublicTranslator, params?: Record<string, string | number>): QA[] {
  if (t.locale === 'en') return items
  return items.map((x) => ({ q: t.dyn(`faq.q:${x.q}`, x.q), a: t.dyn(`faq.a:${x.q}`, x.a, params) }))
}

export function localizeFaqCategory(category: string, t: PublicTranslator): string {
  return t.locale === 'en' ? category : t.dyn(`faq.cat:${category}`, category)
}

/** BCP-47 tag for JSON-LD inLanguage. */
export const inLanguage = (locale: Locale) => locale

/** Registry title / description of a public page in `locale` (lib/seo/public-routes.ts is the English source). */
export function seoCopy(path: string, locale: Locale): { title: string; description: string } {
  const route = publicRoute(path)
  if (!route) return { title: '', description: '' }
  if (locale === 'en') return { title: route.title, description: route.description }
  const t = publicT(locale)
  return { title: t.dyn(`seo.title:${path}`, route.title), description: t.dyn(`seo.description:${path}`, route.description) }
}

/** buildMetadata() for a registry page in `locale`: localized title/description, canonical and hreflang. */
export function publicPageMetadata(path: string, locale: Locale, opts: Omit<PageMetaInput, 'title' | 'description' | 'path' | 'locale'> & { title?: string; description?: string } = {}) {
  const copy = seoCopy(path, locale)
  return buildMetadata({ ...opts, title: opts.title ?? copy.title, description: opts.description ?? copy.description, path, locale })
}
