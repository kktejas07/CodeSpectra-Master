'use client'

import { useEffect, useState } from 'react'
import {
  getCurrencySymbol,
  formatCurrencyAmount,
  formatPrice,
  replaceCurrencyInString,
  CURRENCY_SYMBOLS,
  type CURRENCY_SYMBOLS as CS,
} from '@/lib/currency'

/**
 * React hook that fetches the platform currency from settings and
 * returns helper functions for display.
 *
 * Usage:
 *   const { currency, symbol, formatAmount, formatP } = useCurrency()
 *   <span>{formatAmount(2900)}</span>  // "₹2,900" or "$29"
 */
export function useCurrency() {
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    fetch('/api/platform/settings')
      .then(r => r.json())
      .then(d => {
        if (d?.settings?.platform_currency) setCurrency(d.settings.platform_currency)
      })
      .catch(() => { /* use default USD */ })
  }, [])

  const symbol = getCurrencySymbol(currency)

  return {
    currency,
    symbol,
    /** Format minor-unit amount (paise/cents) -> "₹2,900" */
    formatAmount: (minor: number) => formatCurrencyAmount(minor, currency),
    /** Format major-unit number -> "₹29" */
    formatP: (major: number) => formatPrice(major, currency),
    /** Replace $ in a string with the current symbol */
    replaceIn: (str: string) => replaceCurrencyInString(str, currency),
    /** Raw symbol map */
    symbols: CURRENCY_SYMBOLS,
  }
}
