'use client'

/**
 * lib/format-datetime helpers bound to the interface language: same output as
 * before in English (en-GB, platform timezone), month / weekday names in
 * Hindi / Telugu otherwise. Components call it as
 * `const { formatDate, formatDateTime } = useLocaleDates()` and keep their
 * existing call sites.
 */
import { useMemo } from 'react'
import { formatDate as fd, formatDateTime as fdt, formatTime as ft } from '@/lib/format-datetime'
import { LOCALE_META } from './config'
import { useLocale } from './client'

type V = string | number | Date | null | undefined

export function useLocaleDates() {
  const locale = useLocale()
  return useMemo(() => {
    const intl = locale === 'en' ? undefined : LOCALE_META[locale].intl
    return {
      formatDate: (v: V, tz?: string | null, o?: Intl.DateTimeFormatOptions) => fd(v, tz, o, intl),
      formatDateTime: (v: V, tz?: string | null, o?: Intl.DateTimeFormatOptions) => fdt(v, tz, o, intl),
      formatTime: (v: V, tz?: string | null, o?: Intl.DateTimeFormatOptions) => ft(v, tz, o, intl),
    }
  }, [locale])
}
