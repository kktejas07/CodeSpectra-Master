/**
 * Shared currency utilities.
 *
 * Single source of truth for currency symbols, formatting, and the
 * platform-wide currency map. Both client and server code import from here.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  JPY: '¥',
}

export const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  INR: 'Indian Rupee',
  EUR: 'Euro',
  GBP: 'British Pound',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  SGD: 'Singapore Dollar',
  JPY: 'Japanese Yen',
}

export const ALL_CURRENCIES = Object.keys(CURRENCY_SYMBOLS)

/** Get the symbol for a currency code (e.g. 'INR' -> '₹'). Falls back to the code itself. */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || currency
}

/**
 * Format a minor-unit amount (paise / cents) into a display string.
 * `amount` is in minor units (e.g. 2900 = $29.00).
 */
export function formatCurrencyAmount(amountMinor: number, currency: string): string {
  const code = currency.toUpperCase()
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100)
  } catch {
    // Fallback for unsupported currency codes
    const sym = getCurrencySymbol(code)
    return `${sym}${(amountMinor / 100).toFixed(2)}`
  }
}

/**
 * Format a major-unit number (e.g. 29 = $29.00).
 */
export function formatPrice(amount: number, currency: string): string {
  const code = currency.toUpperCase()
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    const sym = getCurrencySymbol(code)
    return `${sym}${amount.toFixed(2)}`
  }
}

/**
 * Replace a dollar sign in a price string with the correct currency symbol.
 * E.g. "$29/month" with INR -> "₹29/month".
 */
export function replaceCurrencyInString(priceStr: string, currency: string): string {
  const sym = getCurrencySymbol(currency)
  return priceStr.replace(/\$/g, sym)
}
