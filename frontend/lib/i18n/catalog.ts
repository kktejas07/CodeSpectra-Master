/**
 * Message catalogs and the translator (pure, client-safe).
 *
 * Catalogs are flat JSON per namespace in lib/i18n/messages/<locale>/<ns>.json.
 * A key is `<namespace>.<key>`; plural forms are separate keys with an Intl
 * plural suffix (`items_one`, `items_other`) and are picked from `{ count }`.
 * Placeholders are `{name}`. English ships in the bundle (it is the fallback);
 * Hindi / Telugu are loaded on the server (lib/i18n/load.ts) and handed to the
 * client provider, so a page never downloads a language it does not show.
 *
 * Missing key → English → the key itself, with a dev-only console warning.
 */
import { formatNumber, pluralCategory } from './format'
import type { Locale } from './config'
import common from './messages/en/common.json'
import nav from './messages/en/nav.json'
import auth from './messages/en/auth.json'
import dashboard from './messages/en/dashboard.json'
import assessment from './messages/en/assessment.json'
import learn from './messages/en/learn.json'
import events from './messages/en/events.json'
import errors from './messages/en/errors.json'
import publicMessages from './messages/en/public.json'
import publicPages from './messages/en/publicPages.json'
import apiErrors from './messages/en/apiErrors.json'
import exam from './messages/en/exam.json'
import type { AreaEnMessages, AreaNamespace } from './areas'

export const EN_MESSAGES = { common, nav, auth, dashboard, assessment, learn, events, errors, apiErrors, public: publicMessages, publicPages, exam }
export type Namespace = keyof typeof EN_MESSAGES
export const NAMESPACES = Object.keys(EN_MESSAGES) as Namespace[]

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type StripPlural<K extends string> = K extends `${infer B}_${PluralSuffix}` ? B : K
/** Every translatable key, e.g. `nav.signOut` or `assessment.questionsLeft` (plural base). */
// Area catalogs (lib/i18n/areas.ts) are typed here but loaded by the server, not bundled.
type AllEnMessages = typeof EN_MESSAGES & AreaEnMessages
export type MessageKey = { [N in keyof AllEnMessages & string]: `${N}.${StripPlural<keyof AllEnMessages[N] & string>}` }[keyof AllEnMessages & string]

/** One locale's catalogs (any subset of namespaces). */
export type Messages = Partial<Record<Namespace | AreaNamespace, Record<string, string>>>
export type MessageParams = Record<string, string | number | null | undefined>

const warned = new Set<string>()
function devWarn(msg: string) {
  if (process.env.NODE_ENV === 'production' || warned.has(msg)) return
  warned.add(msg)
  console.warn(`[i18n] ${msg}`)
}

function lookup(messages: Messages | undefined, ns: string, key: string, count: number | undefined, locale: Locale): string | undefined {
  const table = messages?.[ns as Namespace]
  if (!table) return undefined
  if (count !== undefined) {
    const cat = pluralCategory(locale, count)
    return table[`${key}_${cat}`] ?? table[`${key}_other`] ?? table[key]
  }
  return table[key]
}

/** Raw template for a key in `locale` (falls back to English), or undefined. */
export function resolveTemplate(locale: Locale, messages: Messages | undefined, fullKey: string, count?: number): string | undefined {
  const dot = fullKey.indexOf('.')
  if (dot < 1) return undefined
  const ns = fullKey.slice(0, dot)
  const key = fullKey.slice(dot + 1)
  if (locale !== 'en') {
    const hit = lookup(messages, ns, key, count, locale)
    if (hit !== undefined) return hit
    devWarn(`missing "${fullKey}" in ${locale}; using English`)
  }
  // Area namespaces have no bundled English: the provider's tables carry it.
  return lookup(EN_MESSAGES as Messages, ns, key, count, 'en') ?? (locale === 'en' ? lookup(messages, ns, key, count, 'en') : undefined)
}

export function interpolate(locale: Locale, template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name]
    if (v === undefined || v === null) return m
    return typeof v === 'number' ? formatNumber(locale, v) : String(v)
  })
}

export type Translator = (key: MessageKey, params?: MessageParams) => string

export function createTranslator(locale: Locale, messages?: Messages): Translator {
  return (key, params) => {
    const count = typeof params?.count === 'number' ? params.count : undefined
    const tpl = resolveTemplate(locale, messages, key, count)
    if (tpl === undefined) {
      devWarn(`unknown key "${key}"`)
      return key
    }
    return interpolate(locale, tpl, params)
  }
}

/** Untyped lookup for data-driven keys (route labels): the English fallback is the caller's. */
export function translateDynamic(locale: Locale, messages: Messages | undefined, fullKey: string, fallback: string, params?: MessageParams): string {
  const dot = fullKey.indexOf('.')
  const ns = fullKey.slice(0, dot)
  const key = fullKey.slice(dot + 1)
  const tpl = lookup(messages, ns, key, undefined, locale) ?? lookup(EN_MESSAGES as Messages, ns, key, undefined, 'en')
  return interpolate(locale, tpl ?? fallback, params)
}

/** Split a template around `{name}` slots so callers can drop React nodes in (word order differs per language). */
export function splitTemplate(template: string): { text?: string; slot?: string }[] {
  const out: { text?: string; slot?: string }[] = []
  let last = 0
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > last) out.push({ text: template.slice(last, m.index) })
    out.push({ slot: m[1] })
    last = m.index! + m[0].length
  }
  if (last < template.length) out.push({ text: template.slice(last) })
  return out
}
