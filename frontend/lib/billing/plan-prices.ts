/**
 * Learner plan prices per currency (pure, client-safe).
 *
 * A `plans` document may carry `prices_minor`, edited in Admin → Plans:
 *   { INR: { month: 49900, year: 499000 }, USD: { month: 900, year: 9000 } }
 * Integer minor units (paise / cents). A missing currency or interval means
 * "not sold in that currency / cycle" and checkout falls back to the plan's
 * legacy `price` / `yearlyPrice` (major units, platform currency).
 */
import { z } from 'zod'

export const BILLING_CURRENCIES = ['INR', 'USD'] as const
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number]
export type PriceInterval = 'month' | 'year'

export interface IntervalPrices { month?: number | null; year?: number | null }
export type PlanPrices = Partial<Record<BillingCurrency, IntervalPrices>>

/** ₹10 lakh / $100k per period is far above any learner plan: a typo guard, not a business rule. */
export const MAX_PLAN_PRICE_MINOR = 100_000_000

const minor = z.number().int().min(0).max(MAX_PLAN_PRICE_MINOR).nullable().optional()
const intervalPrices = z.object({ month: minor, year: minor }).strict()
export const planPricesSchema = z.object({ INR: intervalPrices.optional(), USD: intervalPrices.optional() }).strict()

export function isBillingCurrency(v: unknown): v is BillingCurrency {
  return v === 'INR' || v === 'USD'
}

/** Validate an admin `prices_minor` body. Zero / null entries are dropped (not sold). */
export function parsePlanPrices(raw: unknown): { ok: true; prices: PlanPrices } | { ok: false; error: string } {
  const r = planPricesSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: 'Prices must be whole numbers of paise / cents (0 – 100,000,000).' }
  const out: PlanPrices = {}
  for (const cur of BILLING_CURRENCIES) {
    const p = r.data[cur]
    if (!p) continue
    const row: IntervalPrices = {}
    if (p.month) row.month = p.month
    if (p.year) row.year = p.year
    if (row.month || row.year) out[cur] = row
  }
  return { ok: true, prices: out }
}

/** The price of one period in minor units, or null when the plan is not sold that way. */
export function priceFor(prices: PlanPrices | null | undefined, currency: string, interval: PriceInterval): number | null {
  if (!prices || !isBillingCurrency(currency)) return null
  const v = prices[currency]?.[interval]
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null
}

/** Currencies the plan has at least one price in. */
export function currenciesOf(prices: PlanPrices | null | undefined): BillingCurrency[] {
  return BILLING_CURRENCIES.filter((c) => priceFor(prices, c, 'month') !== null || priceFor(prices, c, 'year') !== null)
}

/** Whole-percent saving of the yearly price against 12 monthly payments (0 when not cheaper). */
export function yearlySavingsPct(prices: PlanPrices | null | undefined, currency: string): number {
  const m = priceFor(prices, currency, 'month')
  const y = priceFor(prices, currency, 'year')
  if (!m || !y) return 0
  const full = m * 12
  return y >= full ? 0 : Math.round(((full - y) / full) * 100)
}

/** Charge currency for a buyer: India → INR, everyone else → USD, unless they picked one. */
export function currencyForBuyer(input: { requested?: unknown; country?: string | null; fallback?: string | null }): BillingCurrency {
  if (isBillingCurrency(input.requested)) return input.requested
  const c = String(input.country || '').toUpperCase()
  if (c === 'IN') return 'INR'
  if (/^[A-Z]{2}$/.test(c)) return 'USD'
  return isBillingCurrency(input.fallback) ? input.fallback : 'USD'
}

/** Built-in learner prices used when the Pro plan has no admin prices yet (minor units). */
export const DEFAULT_PRO_PRICES: PlanPrices = {
  INR: { month: 49900, year: 499000 },
  USD: { month: 900, year: 9000 },
}
