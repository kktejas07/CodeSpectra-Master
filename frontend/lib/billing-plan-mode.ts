/**
 * Client-safe plan classification shared by the pricing pages and the
 * server-side plan resolver (lib/billing-plans.ts), so the UI and checkout
 * always agree on what a plan's button does:
 *   - 'free'          → never goes to checkout (switch via PUT /api/billing/subscription)
 *   - 'contact_sales' → links to /contact?topic=sales (enterprise / custom pricing)
 *   - 'checkout'      → paid checkout for exactly that plan
 */
export type PlanCheckoutMode = 'free' | 'contact_sales' | 'checkout'
export type PlanInterval = 'month' | 'year'

export const CONTACT_SALES_HREF = '/contact?topic=sales'

/** Plan ids are short slugs (admin plan keys or static catalog keys). */
export function isValidPlanId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw)
}

export function parseInterval(raw: unknown): PlanInterval {
  return raw === 'year' || raw === 'yearly' || raw === 'annual' ? 'year' : 'month'
}

/** Price as a number in major units, or null when it isn't a number ("Contact us", "Custom"). */
export function parsePlanPrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (!s || s === 'free') return 0
    const m = s.replace(/,/g, '').match(/\d+(\.\d+)?/)
    return m ? parseFloat(m[0]) : null
  }
  return null
}

export function planCheckoutMode(p: {
  id: string
  price?: unknown
  yearlyPrice?: unknown
  contactSales?: unknown
}): PlanCheckoutMode {
  const id = String(p.id || '').toLowerCase()
  if (p.contactSales === true || id === 'enterprise') return 'contact_sales'
  if (typeof p.price === 'string' && /contact|custom/i.test(p.price)) return 'contact_sales'
  if (id === 'free') return 'free'
  const monthly = parsePlanPrice(p.price)
  const yearly = parsePlanPrice(p.yearlyPrice)
  if (monthly === null && yearly === null) return p.price === undefined ? 'free' : 'contact_sales'
  if ((monthly ?? 0) <= 0 && (yearly ?? 0) <= 0) return 'free'
  return 'checkout'
}

/** In-app pricing page with a plan preselected (used after signup). */
export function inAppPricingHref(planId: string, interval: PlanInterval = 'month'): string {
  const q = new URLSearchParams({ plan: planId })
  if (interval === 'year') q.set('interval', 'year')
  return `/dashboard/pricing?${q.toString()}`
}
