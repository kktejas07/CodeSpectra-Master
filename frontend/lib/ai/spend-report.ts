/**
 * AI spend reports over `ai_usage` (server only) — the admin home bento card,
 * /dashboard/admin/ai-usage and its CSV export. Rows recorded before cost
 * tracking are priced now from their tokens and reported as "estimated".
 */
import 'server-only'
import { getAiCostSettings } from './usage-record'
import { bookFor, budgetLevel, summarizeSpend, trendPct, type SpendGroupRow, type SpendSummary } from './spend'

/** Group ai_usage rows in [from, to) by UTC day × feature × provider × model × tenant. */
export async function spendRows(from: Date, to: Date): Promise<SpendGroupRow[]> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const col = (await getMongoDb()).collection('ai_usage')
  const noCost = { $eq: [{ $type: '$costMicros' }, 'missing'] }
  const rows = await col.aggregate<{ _id: { day: string; feature: string; provider: string; model: string; tenantId: string | null } } & Omit<SpendGroupRow, 'day' | 'feature' | 'provider' | 'model' | 'tenantId'>>([
    { $match: { createdAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          feature: { $ifNull: ['$feature', 'unknown'] },
          provider: { $ifNull: ['$provider', 'unknown'] },
          model: { $ifNull: ['$model', 'unknown'] },
          tenantId: { $ifNull: ['$tenantId', null] },
        },
        calls: { $sum: 1 },
        costMicros: { $sum: { $ifNull: ['$costMicros', 0] } },
        costedCalls: { $sum: { $cond: [noCost, 0, 1] } },
        unpricedCalls: { $sum: { $cond: ['$unpriced', 1, 0] } },
        estimatedTokenCalls: { $sum: { $cond: ['$tokensEstimated', 1, 0] } },
        legacyInput: { $sum: { $cond: [noCost, { $ifNull: ['$promptTokens', 0] }, 0] } },
        legacyOutput: { $sum: { $cond: [noCost, { $ifNull: ['$completionTokens', 0] }, 0] } },
        inputTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
        outputTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
      },
    },
    { $limit: 20_000 },
  ], { allowDiskUse: true }).toArray()
  return rows.map(({ _id, ...r }) => ({ ..._id, ...r }))
}

const monthStart = (d: Date, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1))

export interface MonthSpend {
  month: string
  /** µ$ month to date (recorded + estimated for old rows). */
  micros: number
  estimatedMicros: number
  /** µ$ over the same days of last month (for the trend). */
  lastMonthToDateMicros: number
  lastMonthMicros: number
  trendPct: number | null
  top: { feature: string; micros: number }[]
  unpricedCalls: number
  usdInrRate: number
  /** When a superadmin last set the rate (ISO); null = default rate. */
  usdInrRateUpdatedAt: string | null
  budget: { usd: number; level: 0 | 50 | 80 | 100; hardStop: boolean }
  summary: SpendSummary
}

/** This month vs. last month, top features, budget level. */
export async function monthSpend(now = new Date()): Promise<MonthSpend> {
  const settings = await getAiCostSettings()
  const book = bookFor(settings)
  const thisStart = monthStart(now)
  const lastStart = monthStart(now, -1)
  // Same elapsed time into last month (clamped to its end).
  const elapsed = now.getTime() - thisStart.getTime()
  const lastCut = new Date(Math.min(lastStart.getTime() + elapsed, thisStart.getTime()))
  // Old days come from the daily rollups (raw rows expire after 90 days).
  const { spendRowsWithHistory } = await import('./usage-rollup')
  const [cur, prevToDate, prevRest] = await Promise.all([
    spendRowsWithHistory(thisStart, new Date(now.getTime() + 1), now),
    spendRowsWithHistory(lastStart, lastCut, now),
    spendRowsWithHistory(lastCut, thisStart, now),
  ])
  const summary = summarizeSpend(cur, book)
  const prevTd = summarizeSpend(prevToDate, book).totals.micros
  const prevAll = prevTd + summarizeSpend(prevRest, book).totals.micros
  const budgetMicros = Math.round(settings.monthly_budget_usd * 1_000_000)
  return {
    month: thisStart.toISOString().slice(0, 7),
    micros: summary.totals.micros,
    estimatedMicros: summary.totals.estimatedMicros,
    lastMonthToDateMicros: prevTd,
    lastMonthMicros: prevAll,
    trendPct: trendPct(summary.totals.micros, prevTd),
    top: summary.byFeature.filter((f) => f.micros > 0).slice(0, 3).map((f) => ({ feature: f.key, micros: f.micros })),
    unpricedCalls: summary.totals.unpricedCalls,
    usdInrRate: settings.usd_inr_rate,
    usdInrRateUpdatedAt: settings.usd_inr_rate_updated_at,
    budget: { usd: settings.monthly_budget_usd, level: budgetLevel(summary.totals.micros, budgetMicros), hardStop: settings.hard_stop },
    summary,
  }
}
