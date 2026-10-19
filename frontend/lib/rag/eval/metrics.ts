/**
 * Retrieval metrics for the golden set (pure): per-question scoring, the
 * aggregate report, an ACL oracle, and plain-language summaries for the UI.
 */
import type { AgentCaller, KnowledgeSourceType } from '@/lib/agent/contract'
import type { EvalKind, GoldenQuestion } from './golden'

export const KS = [1, 3, 5, 10] as const
export type K = (typeof KS)[number]

export interface ReturnedHit { key: string; type: string; title: string; score: number }

export interface QuestionResult {
  id: string
  query: string
  as: string
  kind: EvalKind
  type: KnowledgeSourceType
  expect: string[]
  all: boolean
  /** 1-based rank of each expected source in the returned list, 0 = not returned. */
  ranks: number[]
  success: Record<K, boolean>
  recall: Record<K, number>
  rr: number
  ndcg10: number
  latency_ms: number
  returned: ReturnedHit[]
  leaks: { key: string; reason: string }[]
  duplicates: number
}

export interface AggregateMetrics {
  questions: number
  positives: number
  acl_queries: number
  success: Record<K, number>
  recall: Record<K, number>
  mrr: number
  ndcg10: number
  by_type: { type: string; questions: number; success_at_5: number; recall_at_5: number; mrr: number }[]
  by_kind: { kind: string; questions: number; success_at_3: number; mrr: number }[]
  acl_leaks: number
  acl_leak_questions: string[]
  latency_ms: { p50: number; p95: number; max: number }
  duplicate_hit_rate: number
  failed: { id: string; query: string; expect: string[]; returned: ReturnedHit[] }[]
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[i]
}

/** Score one question from the ranked source keys returned (best first). */
export function scoreQuestion(
  q: GoldenQuestion,
  returned: ReturnedHit[],
  latencyMs: number,
  leaks: { key: string; reason: string }[],
): QuestionResult {
  const keys = returned.map((r) => r.key)
  const ranks = q.expect.map((e) => keys.indexOf(e) + 1)
  const need = q.all ? q.expect.length : 1
  const success = {} as Record<K, boolean>
  const recall = {} as Record<K, number>
  for (const k of KS) {
    const found = ranks.filter((r) => r > 0 && r <= k).length
    success[k] = q.expect.length > 0 && found >= need
    recall[k] = q.expect.length ? found / q.expect.length : 0
  }
  const firstRank = Math.min(...ranks.filter((r) => r > 0), Infinity)
  const rr = Number.isFinite(firstRank) ? 1 / firstRank : 0
  // Binary-gain nDCG@10.
  let dcg = 0
  ranks.forEach((r) => { if (r > 0 && r <= 10) dcg += 1 / Math.log2(r + 1) })
  let idcg = 0
  for (let i = 1; i <= Math.min(10, q.expect.length); i++) idcg += 1 / Math.log2(i + 1)
  const seen = new Set<string>()
  let duplicates = 0
  for (const k of keys) { if (seen.has(k)) duplicates++; seen.add(k) }
  return {
    id: q.id, query: q.query, as: q.as, kind: q.kind, type: q.type, expect: q.expect, all: !!q.all,
    ranks, success, recall, rr, ndcg10: idcg ? dcg / idcg : 0, latency_ms: latencyMs,
    returned: returned.slice(0, 10), leaks, duplicates,
  }
}

export function aggregate(results: readonly QuestionResult[]): AggregateMetrics {
  const pos = results.filter((r) => r.expect.length > 0)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const success = {} as Record<K, number>
  const recall = {} as Record<K, number>
  for (const k of KS) {
    success[k] = round(mean(pos.map((r) => (r.success[k] ? 1 : 0))))
    recall[k] = round(mean(pos.map((r) => r.recall[k])))
  }
  const types = [...new Set(pos.map((r) => r.type))]
  const kinds = [...new Set(results.map((r) => r.kind))]
  const lat = results.map((r) => r.latency_ms)
  const hits = results.reduce((n, r) => n + r.returned.length, 0)
  const dups = results.reduce((n, r) => n + r.duplicates, 0)
  return {
    questions: results.length,
    positives: pos.length,
    acl_queries: results.filter((r) => r.kind === 'acl_negative').length,
    success,
    recall,
    mrr: round(mean(pos.map((r) => r.rr))),
    ndcg10: round(mean(pos.map((r) => r.ndcg10))),
    by_type: types.map((t) => {
      const rs = pos.filter((r) => r.type === t)
      return { type: t, questions: rs.length, success_at_5: round(mean(rs.map((r) => (r.success[5] ? 1 : 0)))), recall_at_5: round(mean(rs.map((r) => r.recall[5]))), mrr: round(mean(rs.map((r) => r.rr))) }
    }),
    by_kind: kinds.map((k) => {
      const rs = results.filter((r) => r.kind === k)
      const p = rs.filter((r) => r.expect.length)
      return { kind: k, questions: rs.length, success_at_3: round(mean(p.map((r) => (r.success[3] ? 1 : 0)))), mrr: round(mean(p.map((r) => r.rr))) }
    }),
    acl_leaks: results.reduce((n, r) => n + r.leaks.length, 0),
    acl_leak_questions: results.filter((r) => r.leaks.length).map((r) => r.id),
    latency_ms: { p50: round(percentile(lat, 50), 1), p95: round(percentile(lat, 95), 1), max: round(Math.max(0, ...lat), 1) },
    duplicate_hit_rate: hits ? round(dups / hits) : 0,
    failed: pos.filter((r) => !r.success[5]).map((r) => ({ id: r.id, query: r.query, expect: r.expect, returned: r.returned.slice(0, 5) })),
  }
}

// ─── ACL oracle ──────────────────────────────────────────────────────────────

const STAFF_ONLY = new Set(['resume', 'attempt_summary', 'question'])

/**
 * Independent restatement of the access rule (not lib/rag/acl.ts, so a bug
 * there can't hide itself): may `caller` see a stored chunk row?
 */
export function oracleCanSee(
  caller: AgentCaller,
  row: { tenant_id?: string | null; visibility?: string; source_type?: string },
  tenantId?: string | null,
): boolean {
  const owner = row.tenant_id ?? null
  if (caller.role === 'superadmin') return !tenantId || owner === null || owner === tenantId
  if (caller.role !== 'tenant_admin' || !caller.tenantId) return false
  if (owner === caller.tenantId) return row.visibility === 'tenant' || row.visibility === 'public'
  return owner === null && row.visibility === 'public' && !STAFF_ONLY.has(String(row.source_type))
}

/** Ground-truth check for fixtures whose owner we know regardless of what was stored. */
export function ownerAllows(caller: AgentCaller, owner: { tenant: string | null; adminOnly: boolean }, type: string): boolean {
  if (caller.role === 'superadmin') return true
  if (owner.tenant) return owner.tenant === caller.tenantId
  return !owner.adminOnly && !STAFF_ONLY.has(type)
}

// ─── Plain language ──────────────────────────────────────────────────────────

export function plainSummary(m: AggregateMetrics): string[] {
  const n = m.positives
  const c = (rate: number) => Math.round(rate * n)
  const lines = [
    `${c(m.success[3])} of ${n} questions found the right source in the top 3 results.`,
    `${c(m.success[1])} of ${n} had it as the very first result; ${c(m.success[10])} of ${n} somewhere in the top 10.`,
    `On average the first right answer sits at position ${m.mrr > 0 ? (1 / m.mrr).toFixed(1) : '—'} (MRR ${m.mrr.toFixed(2)}).`,
  ]
  lines.push(m.acl_leaks === 0
    ? `Access check passed: across ${m.questions} searches nothing from another organisation or a staff-only source came back.`
    : `Access check FAILED: ${m.acl_leaks} result(s) came back that the asker must not see (${m.acl_leak_questions.join(', ')}).`)
  return lines
}
