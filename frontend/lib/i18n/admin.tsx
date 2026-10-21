'use client'

/**
 * Admin console strings (app/dashboard/admin/**). Their own catalog
 * (lib/i18n/messages/<locale>/admin.json), loaded by the server in
 * app/dashboard/admin/layout.tsx and handed to this provider — English
 * included — so no other page ships admin text.
 *
 *   const { t } = useAdminT()
 *   <h1>{t('users.title')}</h1>
 *
 * Admins who chose English see exactly the previous English text.
 * Missing key in hi / te → English (merged on the server) → the key.
 */
import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react'
import type adminEn from './messages/en/admin.json'
import { interpolate, splitTemplate, type MessageParams } from './catalog'
import { DEFAULT_LOCALE, type Locale } from './config'
import { formatDate, formatDateTime, formatNumber, formatRelative, pluralCategory } from './format'

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type StripPlural<K extends string> = K extends `${infer B}_${PluralSuffix}` ? B : K
export type AdminKey = StripPlural<keyof typeof adminEn & string>

interface AdminI18nValue { locale: Locale; messages: Record<string, string> }
const Ctx = createContext<AdminI18nValue>({ locale: DEFAULT_LOCALE, messages: {} })

export function AdminI18nProvider({ locale, messages, children }: AdminI18nValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function adminTranslate(locale: Locale, messages: Record<string, string>, key: string, params?: MessageParams): string {
  const count = typeof params?.count === 'number' ? params.count : undefined
  const tpl = count !== undefined
    ? messages[`${key}_${pluralCategory(locale, count)}`] ?? messages[`${key}_other`] ?? messages[key]
    : messages[key]
  return tpl === undefined ? key : interpolate(locale, tpl, params)
}

export interface AdminT {
  locale: Locale
  t: (key: AdminKey, params?: MessageParams) => string
  /** Data-driven key (enum labels) with the caller's English fallback. */
  td: (key: string, fallback: string, params?: MessageParams) => string
  /** Template with React nodes in `{slots}` (bold names, links). */
  rich: (key: AdminKey, slots: Record<string, ReactNode>, params?: MessageParams) => ReactNode
  fmt: {
    number: (n: number, o?: Intl.NumberFormatOptions) => string
    date: (d: Date | string | number, o?: Intl.DateTimeFormatOptions) => string
    dateTime: (d: Date | string | number) => string
    relative: (d: Date | string | number) => string
  }
}

export function useAdminT(): AdminT {
  const { locale, messages } = useContext(Ctx)
  return useMemo(() => ({
    locale,
    t: (key, params) => adminTranslate(locale, messages, key, params),
    td: (key, fallback, params) => (key in messages ? adminTranslate(locale, messages, key, params) : interpolate(locale, fallback, params)),
    rich: (key, slots, params) => {
      const tpl = messages[key] ?? key
      return splitTemplate(tpl).map((part, i) =>
        part.slot !== undefined && part.slot in slots
          ? <Fragment key={i}>{slots[part.slot]}</Fragment>
          : <Fragment key={i}>{interpolate(locale, part.text ?? `{${part.slot}}`, params)}</Fragment>,
      )
    },
    fmt: {
      number: (n, o) => formatNumber(locale, n, o),
      date: (d, o) => formatDate(locale, d, o),
      dateTime: (d) => formatDateTime(locale, d),
      relative: (d) => formatRelative(locale, d),
    },
  }), [locale, messages])
}
