/**
 * Text for messages we send (pure): emails (lib/email-templates.ts), in-app
 * notifications, web push and WhatsApp (lib/notifications.ts). These go to
 * the RECIPIENT in their saved interface language (lib/i18n/recipient.ts),
 * not the language of whoever triggered them.
 *
 * Catalogs: lib/i18n/messages/<locale>/{email,notify}.json — flat keys,
 * `{name}` placeholders, plural `_one` / `_other` picked from `{ count }`.
 * Missing in hi / te → English → the key. They are not part of the UI
 * catalogs (lib/i18n/catalog.ts), so no page ships them.
 */
import { DEFAULT_LOCALE, toLocale, type Locale } from './config'
import { pluralCategory } from './format'
import enEmail from './messages/en/email.json'
import hiEmail from './messages/hi/email.json'
import teEmail from './messages/te/email.json'
import enNotify from './messages/en/notify.json'
import hiNotify from './messages/hi/notify.json'
import teNotify from './messages/te/notify.json'

export type OutboundNamespace = 'email' | 'notify'
export type OutboundParams = Record<string, string | number | null | undefined>
type Table = Record<string, string>

export const OUTBOUND_CATALOGS: Record<OutboundNamespace, Record<Locale, Table>> = {
  email: { en: enEmail, hi: hiEmail, te: teEmail },
  notify: { en: enNotify, hi: hiNotify, te: teNotify },
}

/**
 * A translatable message: catalog key + values. A value `{ t: key }` is itself
 * translated (e.g. an enum label); `{ t: key, params }` too, e.g. a plural
 * duration `{ t: 'event.left.hours', params: { count: 3 } }` (SEO-054).
 */
export interface OutboundText {
  key: string
  params?: Record<string, string | number | null | undefined | { t: string; params?: OutboundParams }>
}

function pick(table: Table | undefined, key: string, count: number | undefined, locale: Locale): string | undefined {
  if (!table) return undefined
  if (count !== undefined) return table[`${key}_${pluralCategory(locale, count)}`] ?? table[`${key}_other`] ?? table[key]
  return table[key]
}

export function hasOutboundKey(ns: OutboundNamespace, key: string): boolean {
  const t = OUTBOUND_CATALOGS[ns].en
  return key in t || `${key}_other` in t
}

/** Template for a key in `locale` (English fallback), or undefined. */
export function outboundTemplate(ns: OutboundNamespace, locale: Locale, key: string, count?: number): string | undefined {
  const l = toLocale(locale) ?? DEFAULT_LOCALE
  return (l !== 'en' ? pick(OUTBOUND_CATALOGS[ns][l], key, count, l) : undefined) ?? pick(OUTBOUND_CATALOGS[ns].en, key, count, 'en')
}

/** Fill `{name}` slots. Values are inserted as given (callers escape for HTML where needed). */
export function fillOutbound(template: string, params?: OutboundParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k]
    return v === undefined || v === null ? m : String(v)
  })
}

export type OutboundTranslator = (key: string, params?: OutboundParams) => string

export function outboundT(ns: OutboundNamespace, locale: Locale): OutboundTranslator {
  return (key, params) => {
    const count = typeof params?.count === 'number' ? params.count : undefined
    const tpl = outboundTemplate(ns, locale, key, count)
    return tpl === undefined ? key : fillOutbound(tpl, params)
  }
}

/** Render one or more messages (joined with a space), e.g. a ranking line + "certificate ready". */
export function renderOutbound(ns: OutboundNamespace, locale: Locale, text: OutboundText | OutboundText[]): string {
  const t = outboundT(ns, locale)
  const resolve = (params: OutboundText['params']): OutboundParams | undefined =>
    params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v && typeof v === 'object' ? t(v.t, v.params) : v]))
  return (Array.isArray(text) ? text : [text]).map((p) => t(p.key, resolve(p.params))).filter(Boolean).join(' ')
}
