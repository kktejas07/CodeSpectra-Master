/**
 * Phase-3 AI cost/usage tracking — lightweight, best-effort, dependency-free.
 *
 * - `logAiUsage` is fire-and-forget: it never throws, never awaits, and
 *   silently skips when Mongo is unavailable. Safe to call on every AI call.
 * - Token counts are recorded only when the provider response carries them
 *   (most backend responses don't include usage — many nulls are expected).
 *   Latency / ok / feature / provider / model are ALWAYS recorded.
 * - Cost-$ attribution needs per-model price tables (not built — usage only).
 *
 * Collection: `ai_usage` (one doc per backendComplete call).
 */

export interface AiUsageInput {
  userId?: string
  feature: string
  provider: string
  model: string
  promptTokens?: number | null
  completionTokens?: number | null
  latencyMs: number
  ok: boolean
  /** Reasons from scanPrompt() — log-only, never blocks. */
  injectionFlags?: string[]
}

export interface AiUsageDoc extends AiUsageInput {
  injectionFlags: string[]
  createdAt: Date
}

function toFiniteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
}

/**
 * Fire-and-forget usage insert. Returns void — never throws, never rejects.
 */
export function logAiUsage(input: AiUsageInput): void {
  try {
    const doc: AiUsageDoc = {
      userId: input.userId,
      feature: input.feature || 'unknown',
      provider: input.provider || 'unknown',
      model: input.model || 'unknown',
      promptTokens: toFiniteNum(input.promptTokens),
      completionTokens: toFiniteNum(input.completionTokens),
      latencyMs: toFiniteNum(input.latencyMs) ?? 0,
      ok: input.ok === true,
      injectionFlags: Array.isArray(input.injectionFlags) ? input.injectionFlags : [],
      createdAt: new Date(),
    }
    // Dynamic import avoids module cycles (backend.ts ↔ provider-fallback ↔ db).
    // ponytail: no await, no .catch-logging — a failed insert is silently
    // dropped; usage telemetry must never break or slow an AI request.
    // Ceiling: unbounded collection growth → add a TTL index on createdAt
    // (e.g. 90d) in scripts/create-indexes.ts when this proves useful.
    void import('@/lib/mongodb')
      .then(({ getMongoDb }) => getMongoDb())
      .then((db) => db.collection<AiUsageDoc>('ai_usage').insertOne(doc))
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    // Silently skip — logging must never fail the request.
  }
}

export interface AiUsageSummary {
  days: number
  totals: {
    requests: number
    ok: number
    failed: number
    flagged: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    avgLatencyMs: number
  }
  /** Sorted by requests desc. */
  byFeature: { feature: string; requests: number; totalTokens: number; avgLatencyMs: number }[]
  /** Top 20 by tokens desc. userId '<anonymous>' when absent. */
  byUser: { userId: string; requests: number; totalTokens: number }[]
}

/** Raw $facet result shape from the ai_usage aggregation. */
interface AiUsageFacetResult {
  totals: {
    requests: number
    ok: number
    flagged: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    avgLatencyMs: number
  }[]
  byFeature: AiUsageSummary['byFeature']
  byUser: AiUsageSummary['byUser']
}

const EMPTY_SUMMARY = (days: number): AiUsageSummary => ({
  days,
  totals: {
    requests: 0,
    ok: 0,
    failed: 0,
    flagged: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    avgLatencyMs: 0,
  },
  byFeature: [],
  byUser: [],
})

/**
 * Aggregation helper for the admin usage dashboard. Never throws — returns
 * an empty summary when Mongo is unavailable.
 */
export async function getAiUsageSummary(opts?: { days?: number }): Promise<AiUsageSummary> {
  const days = opts?.days && opts.days > 0 ? Math.min(Math.floor(opts.days), 365) : 30
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const col = (await getMongoDb()).collection<AiUsageDoc>('ai_usage')
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const rows = await col
      .aggregate<AiUsageFacetResult>([
        { $match: { createdAt: { $gte: cutoff } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  requests: { $sum: 1 },
                  ok: { $sum: { $cond: ['$ok', 1, 0] } },
                  flagged: {
                    $sum: {
                      $cond: [{ $gt: [{ $size: { $ifNull: ['$injectionFlags', []] } }, 0] }, 1, 0],
                    },
                  },
                  promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
                  completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
                  totalTokens: {
                    $sum: { $add: [{ $ifNull: ['$promptTokens', 0] }, { $ifNull: ['$completionTokens', 0] }] },
                  },
                  avgLatencyMs: { $avg: { $ifNull: ['$latencyMs', 0] } },
                },
              },
            ],
            byFeature: [
              {
                $group: {
                  _id: { $ifNull: ['$feature', 'unknown'] },
                  requests: { $sum: 1 },
                  totalTokens: {
                    $sum: { $add: [{ $ifNull: ['$promptTokens', 0] }, { $ifNull: ['$completionTokens', 0] }] },
                  },
                  avgLatencyMs: { $avg: { $ifNull: ['$latencyMs', 0] } },
                },
              },
              { $sort: { requests: -1 } },
              {
                $project: {
                  _id: 0,
                  feature: '$_id',
                  requests: 1,
                  totalTokens: 1,
                  avgLatencyMs: { $round: ['$avgLatencyMs', 0] },
                },
              },
            ],
            byUser: [
              {
                $group: {
                  _id: { $ifNull: ['$userId', '<anonymous>'] },
                  requests: { $sum: 1 },
                  totalTokens: {
                    $sum: { $add: [{ $ifNull: ['$promptTokens', 0] }, { $ifNull: ['$completionTokens', 0] }] },
                  },
                },
              },
              { $sort: { totalTokens: -1 } },
              { $limit: 20 },
              { $project: { _id: 0, userId: '$_id', requests: 1, totalTokens: 1 } },
            ],
          },
        },
        ])
      .toArray()
    const res = rows[0]
    if (!res) return EMPTY_SUMMARY(days)
    const t = res.totals[0]
    return {
      days,
      totals: t
        ? {
            requests: t.requests,
            ok: t.ok,
            failed: t.requests - t.ok,
            flagged: t.flagged,
            promptTokens: t.promptTokens,
            completionTokens: t.completionTokens,
            totalTokens: t.totalTokens,
            avgLatencyMs: Math.round(t.avgLatencyMs ?? 0),
          }
        : EMPTY_SUMMARY(days).totals,
      byFeature: res.byFeature ?? [],
      byUser: res.byUser ?? [],
    }
  } catch {
    return EMPTY_SUMMARY(days)
  }
}
