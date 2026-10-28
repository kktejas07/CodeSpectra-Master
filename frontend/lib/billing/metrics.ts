/**
 * Revenue metrics (pure): MRR, ARR, churn, per currency (never summed across
 * currencies). Inputs are subscription rows plus the amount + interval of the
 * order that funded each one.
 *
 *  - MRR: live paid subscriptions (not trialing) — monthly amount, or yearly / 12.
 *    Past-due subscriptions still count (they are in grace); cancelled-at-period-end
 *    ones count until they end.
 *  - ARR = MRR × 12.
 *  - Logo churn (period): subscriptions that ended in the window ÷ subscriptions live at its start.
 *  - Revenue churn: MRR of those ÷ MRR at the start.
 */

export interface MetricSub {
  id: string
  status: string
  started_at: string
  ends_at: string
  ended_at?: string | null
  amount_minor: number
  currency: string
  interval: 'month' | 'year'
  trial?: boolean
}

export interface CurrencyMetrics {
  currency: string
  mrr: number
  arr: number
  activeSubscriptions: number
  churnedSubscriptions: number
  startSubscriptions: number
  logoChurnPct: number
  revenueChurnPct: number
  arpu: number
}

export function monthlyValue(s: Pick<MetricSub, 'amount_minor' | 'interval'>): number {
  const a = Math.max(0, Math.round(s.amount_minor) || 0)
  return s.interval === 'year' ? Math.round(a / 12) : a
}

function liveAt(s: MetricSub, t: number): boolean {
  const start = Date.parse(s.started_at)
  const end = Date.parse(s.ended_at || s.ends_at)
  return Number.isFinite(start) && start <= t && Number.isFinite(end) && end > t
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10_000) / 100 : 0)

/** Metrics per currency at `now`, with churn over the `windowDays` before it. */
export function revenueMetrics(subs: MetricSub[], now: Date = new Date(), windowDays = 30): CurrencyMetrics[] {
  const t = now.getTime()
  const from = t - windowDays * 86_400_000
  const byCur = new Map<string, MetricSub[]>()
  for (const s of subs) {
    if (s.trial || s.amount_minor <= 0) continue
    const c = (s.currency || 'INR').toUpperCase()
    byCur.set(c, [...(byCur.get(c) ?? []), s])
  }
  const out: CurrencyMetrics[] = []
  for (const [currency, rows] of [...byCur.entries()].sort()) {
    const live = rows.filter((s) => liveAt(s, t))
    const atStart = rows.filter((s) => liveAt(s, from))
    const churned = atStart.filter((s) => !liveAt(s, t) && !rows.some((o) => o !== s && o.id === s.id && liveAt(o, t)))
    const mrr = live.reduce((a, s) => a + monthlyValue(s), 0)
    const startMrr = atStart.reduce((a, s) => a + monthlyValue(s), 0)
    const churnMrr = churned.reduce((a, s) => a + monthlyValue(s), 0)
    out.push({
      currency,
      mrr,
      arr: mrr * 12,
      activeSubscriptions: live.length,
      churnedSubscriptions: churned.length,
      startSubscriptions: atStart.length,
      logoChurnPct: pct(churned.length, atStart.length),
      revenueChurnPct: pct(churnMrr, startMrr),
      arpu: live.length ? Math.round(mrr / live.length) : 0,
    })
  }
  return out
}
