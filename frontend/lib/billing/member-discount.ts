/**
 * Plan member discounts in the marketplace (pure): mentor / mock-interview
 * sessions and certification items get the plan's percentage off, paid by the
 * platform (the mentor / seller is paid on the full price). Applied only when
 * the buyer used no coupon — the two never stack.
 */

export const MENTOR_CATEGORIES = new Set(['mentoring', 'mock-interviews'])

export interface MemberLine { category?: string | null; tags?: string[] | null; gross: number }

export function isCertificationLine(l: MemberLine): boolean {
  return (l.tags || []).some((t) => /^certifications?$/i.test(String(t).trim()))
}

/** Split for computeQuote (lib/marketplace/pricing.ts), or null when nothing is discounted. */
export function memberDiscountSplit(lines: MemberLine[], pct: { mentor: number; cert: number }): { amount: number; eligible: boolean[]; platformFunded: boolean[] } | null {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 0)
  const m = clamp(pct.mentor)
  const c = clamp(pct.cert)
  let amount = 0
  const eligible = lines.map((l) => {
    const p = isCertificationLine(l) ? c : MENTOR_CATEGORIES.has(String(l.category || '')) ? m : 0
    if (p <= 0 || l.gross <= 0) return false
    amount += Math.floor((l.gross * p) / 100)
    return true
  })
  if (amount <= 0) return null
  return { amount, eligible, platformFunded: eligible.map((e) => e) }
}
