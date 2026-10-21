/**
 * Translations for the public pages (server components under app/ and
 * app/[lang]/). Long page copy (landing, features, about, FAQ answers, hub
 * chrome, legal notes, SEO titles) lives in server-only namespaces that never
 * reach the client bundle; the client components on those pages use the
 * bundled `public` / `publicPages` namespaces through useT().
 *
 * English is the source and the fallback for every key; Hindi and Telugu are
 * checked for completeness in tests/i18n-public.test.ts.
 */
import 'server-only'
import type { Locale } from './config'
import { interpolate, type MessageParams, type Messages } from './catalog'
import { pluralCategory } from './format'

import enSeo from './messages/en/seo.json'
import enLanding from './messages/en/landing.json'
import enMarketing from './messages/en/marketing.json'
import enFaq from './messages/en/faq.json'
import enLegal from './messages/en/legal.json'
import enHubs from './messages/en/hubs.json'
import enPublic from './messages/en/public.json'
import enPublicPages from './messages/en/publicPages.json'
import enLearn from './messages/en/learn.json'
import enCommon from './messages/en/common.json'

import hiSeo from './messages/hi/seo.json'
import hiLanding from './messages/hi/landing.json'
import hiMarketing from './messages/hi/marketing.json'
import hiFaq from './messages/hi/faq.json'
import hiLegal from './messages/hi/legal.json'
import hiHubs from './messages/hi/hubs.json'
import hiPublic from './messages/hi/public.json'
import hiPublicPages from './messages/hi/publicPages.json'
import hiLearn from './messages/hi/learn.json'
import hiCommon from './messages/hi/common.json'

import teSeo from './messages/te/seo.json'
import teLanding from './messages/te/landing.json'
import teMarketing from './messages/te/marketing.json'
import teFaq from './messages/te/faq.json'
import teLegal from './messages/te/legal.json'
import teHubs from './messages/te/hubs.json'
import tePublic from './messages/te/public.json'
import tePublicPages from './messages/te/publicPages.json'
import teLearn from './messages/te/learn.json'
import teCommon from './messages/te/common.json'

const EN = { seo: enSeo, landing: enLanding, marketing: enMarketing, faq: enFaq, legal: enLegal, hubs: enHubs, public: enPublic, publicPages: enPublicPages, learn: enLearn, common: enCommon }
type Tables = Record<keyof typeof EN, Record<string, string>>
const BY_LOCALE: Record<Locale, Tables> = {
  en: EN,
  hi: { seo: hiSeo, landing: hiLanding, marketing: hiMarketing, faq: hiFaq, legal: hiLegal, hubs: hiHubs, public: hiPublic, publicPages: hiPublicPages, learn: hiLearn, common: hiCommon },
  te: { seo: teSeo, landing: teLanding, marketing: teMarketing, faq: teFaq, legal: teLegal, hubs: teHubs, public: tePublic, publicPages: tePublicPages, learn: teLearn, common: teCommon },
}

/** Server-only namespaces (not in the client catalog). */
export const PUBLIC_SERVER_NAMESPACES = ['seo', 'landing', 'marketing', 'faq', 'legal', 'hubs'] as const
/** Client namespaces owned by the public pages (registered in lib/i18n/catalog.ts). */
export const PUBLIC_CLIENT_NAMESPACES = ['public', 'publicPages'] as const

type PublicNs = keyof typeof EN
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type StripPlural<K extends string> = K extends `${infer B}_${PluralSuffix}` ? B : K
export type PublicKey = { [N in PublicNs]: `${N}.${StripPlural<keyof (typeof EN)[N] & string>}` }[PublicNs]

export type PublicTranslator = {
  (key: PublicKey, params?: MessageParams): string
  /** Data-driven key (`faq.q:<question>`, `hubs.sort:rating`) with an English fallback. */
  dyn: (key: string, fallback: string, params?: MessageParams) => string
  locale: Locale
}

function lookup(t: Tables, ns: string, key: string, count: number | undefined, locale: Locale): string | undefined {
  const table = t[ns as PublicNs]
  if (!table) return undefined
  if (count !== undefined) {
    const cat = pluralCategory(locale, count)
    return table[`${key}_${cat}`] ?? table[`${key}_other`] ?? table[key]
  }
  return table[key]
}

function resolve(locale: Locale, fullKey: string, count?: number): string | undefined {
  const dot = fullKey.indexOf('.')
  if (dot < 1) return undefined
  const ns = fullKey.slice(0, dot)
  const key = fullKey.slice(dot + 1)
  return (locale !== 'en' ? lookup(BY_LOCALE[locale], ns, key, count, locale) : undefined) ?? lookup(EN, ns, key, count, 'en')
}

/** Translator for a public page in `locale` (sync: the catalogs are bundled on the server). */
export function publicT(locale: Locale): PublicTranslator {
  const t = ((key: PublicKey, params?: MessageParams) => {
    const count = typeof params?.count === 'number' ? params.count : undefined
    const tpl = resolve(locale, key, count)
    return tpl === undefined ? key : interpolate(locale, tpl, params)
  }) as PublicTranslator
  t.dyn = (key, fallback, params) => interpolate(locale, resolve(locale, key) ?? fallback, params)
  t.locale = locale
  return t
}

/**
 * Catalogs handed to the client provider on /hi/… and /te/… pages: only what
 * public client components read (not the signed-in app's namespaces).
 */
export function publicClientMessages(locale: Locale): Messages {
  if (locale === 'en') return {}
  const t = BY_LOCALE[locale]
  return { common: t.common, public: t.public, publicPages: t.publicPages, learn: t.learn } as Messages
}
