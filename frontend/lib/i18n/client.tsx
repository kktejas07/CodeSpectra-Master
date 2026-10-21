'use client'

/**
 * Client side of the interface language: provider, hooks and the switcher
 * action. The server layout (dashboard / auth / assessment) resolves the
 * locale and passes only that locale's catalogs; English is bundled.
 * Components rendered outside a provider (public pages) get English.
 */
import { createContext, Fragment, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_META, type Locale } from './config'
import { createTranslator, interpolate, resolveTemplate, splitTemplate, translateDynamic, type MessageKey, type MessageParams, type Messages, type Translator } from './catalog'
import * as fmt from './format'

interface I18nValue {
  locale: Locale
  messages: Messages
}

const ENGLISH: I18nValue = { locale: DEFAULT_LOCALE, messages: {} }
const I18nContext = createContext<I18nValue | null>(null)

// ponytail: app-wide providers (toasts, confirm dialog) mount above the
// per-segment I18nProvider, so the provider also publishes its value here and
// components outside any provider read it. One active provider at a time
// (segments don't nest); unmounting resets to English.
let published: I18nValue = ENGLISH
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const publish = (v: I18nValue) => { published = v; listeners.forEach((fn) => fn()) }

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  useEffect(() => {
    publish(value)
    return () => { if (published === value) publish(ENGLISH) }
  }, [value])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Nested provider for one signed-in area's catalogs (components/i18n/area-i18n.tsx):
 * merges them into the parent's tables. It doesn't publish — toasts get
 * already-translated text from the caller.
 */
export function I18nAreaProvider({ messages, children }: { messages: Messages; children: ReactNode }) {
  const parent = useI18nValue()
  const value = useMemo(() => ({ locale: parent.locale, messages: { ...parent.messages, ...messages } }), [parent, messages])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

function useI18nValue(): I18nValue {
  const ctx = useContext(I18nContext)
  const global = useSyncExternalStore(subscribe, () => published, () => ENGLISH)
  return ctx ?? global
}

export function useLocale(): Locale {
  return useI18nValue().locale
}

/** The active locale's raw catalogs (for pure helpers such as lib/i18n/api-error.ts). */
export function useMessages(): Messages {
  return useI18nValue().messages
}

export interface ClientI18n {
  locale: Locale
  t: Translator
  /** Data-driven key with an English fallback (route labels, enum labels). */
  td: (key: string, fallback: string, params?: MessageParams) => string
  /** Template with React nodes in `{slots}` (links, bold text). */
  rich: (key: MessageKey, slots: Record<string, ReactNode>, params?: MessageParams) => ReactNode
  fmt: {
    number: (n: number, o?: Intl.NumberFormatOptions) => string
    percent: (ratio: number, digits?: number) => string
    currency: (amount: number, currency?: string) => string
    date: (d: Date | string | number, o?: Intl.DateTimeFormatOptions) => string
    dateTime: (d: Date | string | number, timeZone?: string) => string
    relative: (d: Date | string | number) => string
    list: (items: string[]) => string
    clock: (seconds: number) => string
  }
}

export function useT(): ClientI18n {
  const { locale, messages } = useI18nValue()
  return useMemo(() => {
    const t = createTranslator(locale, messages)
    return {
      locale,
      t,
      td: (key, fallback, params) => translateDynamic(locale, messages, key, fallback, params),
      rich: (key, slots, params) => {
        const count = typeof params?.count === 'number' ? params.count : undefined
        const tpl = resolveTemplate(locale, messages, key, count) ?? key
        return splitTemplate(tpl).map((part, i) =>
          part.slot !== undefined && part.slot in slots
            ? <Fragment key={i}>{slots[part.slot]}</Fragment>
            : <Fragment key={i}>{part.text !== undefined ? interpolate(locale, part.text, params) : interpolate(locale, `{${part.slot}}`, params)}</Fragment>,
        )
      },
      fmt: {
        number: (n, o) => fmt.formatNumber(locale, n, o),
        percent: (r, d) => fmt.formatPercent(locale, r, d),
        currency: (a, c) => fmt.formatCurrency(locale, a, c),
        date: (d, o) => fmt.formatDate(locale, d, o),
        dateTime: (d, tz) => fmt.formatDateTime(locale, d, tz),
        relative: (d) => fmt.formatRelative(locale, d),
        list: (items) => fmt.formatList(locale, items),
        clock: (s) => fmt.formatClock(s),
      },
    } satisfies ClientI18n
  }, [locale, messages])
}

/**
 * Keep <html lang> in step on per-request segments. The root layout is cached
 * for public pages and always says `en`; signed-in segments also wrap their
 * content in an element with the right `lang` on the server, so assistive tech
 * and font fallback are right before this runs. Restores `en` on unmount
 * (client navigation back to a public page).
 */
export function HtmlLangSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    const el = document.documentElement
    const prev = el.lang
    el.lang = locale
    return () => { el.lang = prev || 'en' }
  }, [locale])
  return null
}

/** Remember the choice (cookie for everyone, profile when signed in), then re-render server layouts. */
export async function persistLocale(locale: Locale): Promise<boolean> {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  } catch { /* cookies blocked — the API call below still sets it */ }
  try {
    const res = await csrfFetch('/api/user/locale', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ locale }),
    })
    return res.ok
  } catch {
    return false
  }
}

export { LOCALE_META }
