/**
 * AI cost tracking: price book maths (integer micro-dollars, cached tokens,
 * speech minutes), spend aggregation, budget thresholds, hard stop and the
 * feature caps' switch to recorded cost.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanPrice, costMicros, DEFAULT_PRICE_BOOK, mergePriceBook, modelMatches, priceCall, resolvePrice, setActivePriceBook, toMicroRate,
} from '@/lib/ai/pricing'
import {
  baseFeature, bookFor, budgetCrossings, budgetLevel, capSpendUsd, denseSpend, featureMatches, hardStopApplies, mergeAiCostSettings,
  microsIn, moneyDigits, spendCsv, summarizeSpend, trendPct, type SpendGroupRow,
} from '@/lib/ai/spend'
import { meteredUsd } from '@/lib/ai/usage-meter'
import { buildUsageRow } from '@/lib/ai/usage-record'
import { priceFor } from '@/lib/agent/metering'
import { estimateAiCost } from '@/lib/db/analytics'

afterEach(() => setActivePriceBook(null))

describe('price book maths', () => {
  const mini = resolvePrice(DEFAULT_PRICE_BOOK, 'openai', 'gpt-4o-mini').price // 0.15 in / 0.60 out / 0.075 cached

  it('turns USD per 1M into integer µ$ per 1M', () => {
    expect(toMicroRate(0.15)).toBe(150_000)
    expect(toMicroRate(0.075)).toBe(75_000)
    expect(toMicroRate(undefined)).toBe(0)
  })

  it('computes integer micro-dollars and rounds once per call', () => {
    expect(costMicros(mini, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(750_000) // $0.75
    expect(costMicros(mini, { inputTokens: 1 })).toBe(0) // 0.15 µ$ → 0
    expect(costMicros(mini, { inputTokens: 7 })).toBe(1) // 1.05 µ$
    expect(costMicros(mini, { inputTokens: 10 })).toBe(2) // 1.5 µ$ rounds half up
    expect(Number.isInteger(costMicros(mini, { inputTokens: 12_345, outputTokens: 678 }))).toBe(true)
  })

  it('does not drift when many calls are summed', () => {
    const p = { match: 'x', kind: 'chat' as const, inputPer1M: 0.1, outputPer1M: 0.2 }
    let micros = 0
    for (let i = 0; i < 10_000; i++) micros += costMicros(p, { inputTokens: 1000, outputTokens: 1000 })
    expect(micros).toBe(3_000_000) // exactly $3.00; float USD sums would be 2.9999999…
  })

  it('bills cached input tokens at the cached price and never more than the input', () => {
    // 1M prompt tokens of which 800k cached: 200k × 0.15 + 800k × 0.075 = 0.03 + 0.06 = $0.09
    expect(costMicros(mini, { inputTokens: 1_000_000, cachedTokens: 800_000 })).toBe(90_000)
    expect(costMicros(mini, { inputTokens: 100, cachedTokens: 5_000 })).toBe(costMicros(mini, { inputTokens: 100, cachedTokens: 100 }))
    // No cached price → cached tokens cost like input.
    const noCache = { match: 'y', kind: 'chat' as const, inputPer1M: 1, outputPer1M: 2 }
    expect(costMicros(noCache, { inputTokens: 1000, cachedTokens: 600 })).toBe(1000)
  })

  it('prices speech by the minute, counted to the millisecond', () => {
    const r = priceCall(DEFAULT_PRICE_BOOK, 'deepgram', 'nova-2', { audioSeconds: 60 }, 'speech')
    expect(r.costMicros).toBe(4300) // $0.0043 per minute
    expect(priceCall(DEFAULT_PRICE_BOOK, 'deepgram', 'nova-2', { audioSeconds: 90.5 }, 'speech').costMicros).toBe(6486) // 6485.83
    expect(priceCall(DEFAULT_PRICE_BOOK, 'deepgram', 'nova-2', { audioSeconds: 0 }, 'speech').costMicros).toBe(0)
    expect(r.rates.perMinute).toBe(0.0043)
  })

  it('prices embeddings by input tokens only', () => {
    const r = priceCall(DEFAULT_PRICE_BOOK, 'openai', 'text-embedding-3-small', { inputTokens: 1_000_000, outputTokens: 999 }, 'embedding')
    expect(r.costMicros).toBe(20_000)
  })

  it('matches model ids on word boundaries, longest key first', () => {
    expect(modelMatches('openai/gpt-4o-mini-2024-07-18', 'gpt-4o-mini')).toBe(true)
    expect(modelMatches('claude-3-5-haiku-20241022', 'claude-3-5-haiku')).toBe(true)
    expect(modelMatches('deepseek-ai/deepseek-v4-flash-0731', 'deepseek-v4-flash')).toBe(true)
    expect(modelMatches('gpt-4o-mini', 'o3')).toBe(false)
    expect(resolvePrice(DEFAULT_PRICE_BOOK, '', 'gpt-4o-mini').price.match).toBe('gpt-4o-mini')
    expect(resolvePrice(DEFAULT_PRICE_BOOK, '', 'claude-sonnet-4-5-20250929').price.match).toBe('claude-sonnet-4-5')
  })

  it('charges free-tier ids nothing and unknown models the fallback, flagged', () => {
    expect(priceCall(DEFAULT_PRICE_BOOK, 'opencode', 'minimax-m3-free', { inputTokens: 1e6, outputTokens: 1e6 })).toMatchObject({ costMicros: 0, free: true, unpriced: false })
    const u = priceCall(DEFAULT_PRICE_BOOK, 'openrouter', 'openrouter/auto', { inputTokens: 1e6, outputTokens: 1e6 })
    expect(u.unpriced).toBe(true)
    expect(u.costMicros).toBe(5_000_000) // $1 + $4 fallback
  })

  it('lets admin overrides replace seeds, add models and change the fallback', () => {
    const book = mergePriceBook({
      prices: [{ match: 'gpt-4o-mini', kind: 'chat', inputPer1M: 1, outputPer1M: 1 }, { match: 'brand-new', provider: 'acme', kind: 'chat', inputPer1M: 2, outputPer1M: 2 }],
      unknown: { inputPer1M: 0, outputPer1M: 0 },
    })
    expect(resolvePrice(book, '', 'gpt-4o-mini').price).toMatchObject({ inputPer1M: 1, source: 'admin' })
    expect(resolvePrice(book, 'acme', 'brand-new').unpriced).toBe(false)
    expect(resolvePrice(book, 'other', 'brand-new').unpriced).toBe(true) // provider-specific
    expect(priceCall(book, '', 'mystery', { inputTokens: 1e6 }).costMicros).toBe(0)
  })

  it('validates admin price rows', () => {
    expect(cleanPrice({ match: 'Model-X', kind: 'chat', inputPer1M: '0.5', outputPer1M: 1 })).toEqual({ match: 'model-x', kind: 'chat', inputPer1M: 0.5, outputPer1M: 1 })
    expect(cleanPrice({ match: 'bad model!', kind: 'chat', inputPer1M: 1, outputPer1M: 1 })).toBeNull()
    expect(cleanPrice({ match: 'm', kind: 'chat', inputPer1M: -1, outputPer1M: 1 })).toBeNull()
    expect(cleanPrice({ match: 'm', kind: 'speech' })).toBeNull()
  })

  it('feeds the older estimators from the same (active) book', () => {
    expect(priceFor('gpt-4o-mini')).toEqual({ input: 0.15, output: 0.6 })
    expect(estimateAiCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 10)
    setActivePriceBook(mergePriceBook({ prices: [{ match: 'gpt-4o-mini', kind: 'chat', inputPer1M: 3, outputPer1M: 3 }] }))
    expect(priceFor('gpt-4o-mini')).toEqual({ input: 3, output: 3 })
    expect(estimateAiCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(3, 10)
  })
})

describe('usage rows', () => {
  it('stores counts and money only, never prompts', () => {
    const row = buildUsageRow({ feature: 'question-bot', provider: 'openai', model: 'gpt-4o-mini', inputTokens: 2000, outputTokens: 500, cachedTokens: 1000, tokensEstimated: true, userId: 'u1', tenantId: 't1', now: new Date('2026-10-01T00:00:00Z') }, DEFAULT_PRICE_BOOK)
    expect(row).toMatchObject({ feature: 'question-bot', costMicros: 525, unpriced: false, tokensEstimated: true, tenantId: 't1', cachedTokens: 1000 })
    expect(Object.keys(row)).not.toContain('prompt')
    expect(buildUsageRow({ feature: 'x', provider: 'openai', model: 'gpt-4o', inputTokens: 1e6, ok: false }, DEFAULT_PRICE_BOOK).costMicros).toBe(0)
  })
})

const row = (p: Partial<SpendGroupRow>): SpendGroupRow => ({
  day: '2026-10-01', feature: 'chat', provider: 'openai', model: 'gpt-4o-mini', tenantId: null, calls: 1, costMicros: 0, costedCalls: 0,
  unpricedCalls: 0, estimatedTokenCalls: 0, legacyInput: 0, legacyOutput: 0, inputTokens: 0, outputTokens: 0, ...p,
})

describe('spend aggregation', () => {
  const rows = [
    row({ feature: 'question-bot', calls: 3, costMicros: 900_000, costedCalls: 3, inputTokens: 10, outputTokens: 10 }),
    row({ feature: 'question-bot:cache-hit', calls: 2, costMicros: 0, costedCalls: 2 }),
    // Older rows without a recorded cost: estimated now with current prices (1M in = $0.15).
    row({ day: '2026-10-02', feature: 'chat', calls: 4, legacyInput: 1_000_000, inputTokens: 1_000_000, tenantId: 't9' }),
    row({ day: '2026-10-02', feature: 'hints', provider: 'openrouter', model: 'openrouter/auto', calls: 1, costMicros: 5_000, costedCalls: 1, unpricedCalls: 1 }),
  ]
  const s = summarizeSpend(rows, DEFAULT_PRICE_BOOK)

  it('sums recorded and estimated micro-dollars and flags the estimated part', () => {
    expect(s.totals.micros).toBe(900_000 + 150_000 + 5_000)
    expect(s.totals.estimatedMicros).toBe(150_000)
    expect(s.totals.calls).toBe(10)
    expect(s.totals.unpricedCalls).toBe(1)
  })

  it('breaks down by feature (cache hits folded in), day, tenant and model', () => {
    expect(s.byFeature.map((f) => [f.key, f.micros, f.calls])).toEqual([['question-bot', 900_000, 5], ['chat', 150_000, 4], ['hints', 5_000, 1]])
    expect(s.byDay.map((d) => d.key)).toEqual(['2026-10-01', '2026-10-02'])
    expect(s.byTenant.map((t) => t.key)).toEqual(['platform', 't9'])
    expect(s.byModel.find((m) => m.model === 'openrouter/auto')?.unpriced).toBe(true)
    expect(denseSpend(s.byDay, ['2026-09-30', '2026-10-01', '2026-10-02'])).toEqual([0, 900_000, 155_000])
  })

  it('exports CSV without formula injection', () => {
    const csv = spendCsv([row({ feature: '=HYPERLINK("x")', calls: 1, costMicros: 1234, costedCalls: 1 })], DEFAULT_PRICE_BOOK)
    expect(csv.split('\n')[0]).toBe('day,feature,provider,model,tenant,calls,input_tokens,output_tokens,cost_usd,estimated_usd,unpriced_calls')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('0.001234')
  })

  it('computes trend and display amounts', () => {
    expect(trendPct(150, 100)).toBe(50)
    expect(trendPct(50, 0)).toBeNull()
    expect(microsIn(2_000_000, 'INR', 83.5)).toBeCloseTo(167, 6)
    expect(moneyDigits(0.0042)).toBe(4)
    expect(moneyDigits(3.2)).toBe(2)
    expect(baseFeature('')).toBe('unknown')
  })
})

describe('budget alerts and hard stop', () => {
  const budget = 10_000_000 // $10

  it('fires each threshold once, in order, when crossed', () => {
    expect(budgetCrossings(4_000_000, 8_500_000, budget)).toEqual([50, 80])
    expect(budgetCrossings(4_000_000, 8_500_000, budget, [50])).toEqual([80])
    expect(budgetCrossings(9_999_999, 10_000_000, budget, [50, 80])).toEqual([100])
    expect(budgetCrossings(5_000_000, 5_000_000, budget)).toEqual([])
    expect(budgetCrossings(0, 99_000_000, 0)).toEqual([])
  })

  it('reports the level reached', () => {
    expect(budgetLevel(4_999_999, budget)).toBe(0)
    expect(budgetLevel(5_000_000, budget)).toBe(50)
    expect(budgetLevel(12_000_000, budget)).toBe(100)
    expect(budgetLevel(12_000_000, 0)).toBe(0)
  })

  it('stops only non-critical features, only with hard stop on and the budget used up', () => {
    const s = { hard_stop: true, monthly_budget_usd: 10, non_critical_features: ['question-bot', 'blog-*'] }
    expect(hardStopApplies('question-bot', s, 10_000_000)).toBe(true)
    expect(hardStopApplies('blog-draft:cache-hit', s, 10_000_000)).toBe(true)
    expect(hardStopApplies('exam-answer', s, 99_000_000)).toBe(false)
    expect(hardStopApplies('question-bot', s, 9_999_999)).toBe(false)
    expect(hardStopApplies('question-bot', { ...s, hard_stop: false }, 99_000_000)).toBe(false)
    expect(featureMatches('signals-draft', ['signals-*'])).toBe(true)
  })

  it('reads stored settings safely', () => {
    const s = mergeAiCostSettings({ monthly_budget_usd: 'lots', usd_inr_rate: 83, hard_stop: true, prices: [{ match: 'ok-model', kind: 'chat', inputPer1M: 1, outputPer1M: 2 }, { match: '' }] })
    expect(s.monthly_budget_usd).toBe(0)
    expect(s.usd_inr_rate).toBe(84) // one bad field → whole doc falls back to defaults
    const good = mergeAiCostSettings({ monthly_budget_usd: 25, usd_inr_rate: 83, hard_stop: true, prices: [{ match: 'ok-model', kind: 'chat', inputPer1M: 1, outputPer1M: 2 }, { match: '' }] })
    expect(good).toMatchObject({ monthly_budget_usd: 25, usd_inr_rate: 83, hard_stop: true })
    expect(good.prices).toHaveLength(1)
    expect(resolvePrice(bookFor(good), '', 'ok-model').unpriced).toBe(false)
  })
})

describe('feature caps use recorded cost', () => {
  it('compares against the recorded spend when it is higher than the feature ledger', () => {
    expect(capSpendUsd(1.2, 3_500_000)).toEqual({ usd: 3.5, source: 'recorded' })
    expect(capSpendUsd(4, 3_500_000)).toEqual({ usd: 4, source: 'estimated' })
    expect(capSpendUsd(0.5, null)).toEqual({ usd: 0.5, source: 'estimated' })
    expect(capSpendUsd(0, 0)).toEqual({ usd: 0, source: 'estimated' })
  })

  it('charges a metered call at its recorded cost, the estimate only when none was recorded', () => {
    expect(meteredUsd({ costMicros: 1234 }, () => 99)).toBeCloseTo(0.001234, 9)
    expect(meteredUsd({ costMicros: 0 }, () => 99)).toBe(0)
    expect(meteredUsd({}, () => 0.5)).toBe(0.5)
  })
})
