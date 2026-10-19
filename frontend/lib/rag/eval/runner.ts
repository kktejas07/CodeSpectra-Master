/**
 * Runs golden questions through a search function and scores them. Shared by
 * the offline harness (in-memory index) and the live admin evaluation.
 */
import type { AgentCaller, KnowledgeHit, KnowledgeSearchArgs } from '@/lib/agent/contract'
import type { EvalAs, GoldenQuestion } from './golden'
import { oracleCanSee, ownerAllows, scoreQuestion, type QuestionResult, type ReturnedHit } from './metrics'

export type ChunkAclRow = { tenant_id?: string | null; visibility?: string; source_type?: string }

export interface RunDeps {
  search: (args: KnowledgeSearchArgs) => Promise<KnowledgeHit[]>
  callerFor: (as: EvalAs) => AgentCaller
  /** Stored chunk rows (unscoped) for the ACL oracle, by chunk id. */
  rowsById: (ids: string[]) => Promise<Map<string, ChunkAclRow>>
  /** Known owners of fixture sources (offline). */
  owners?: Record<string, { tenant: string | null; adminOnly: boolean }>
  limit?: number
}

export const hitKey = (h: Pick<KnowledgeHit, 'source_type' | 'source_id'>) => `${h.source_type}:${h.source_id}`

export async function runQuestion(q: GoldenQuestion, deps: RunDeps): Promise<QuestionResult> {
  const caller = deps.callerFor(q.as)
  const started = performance.now()
  const hits = await deps.search({ caller, query: q.query, limit: deps.limit ?? 10 })
  const latency = performance.now() - started
  const rows = await deps.rowsById(hits.map((h) => h.chunk_id))
  const leaks: { key: string; reason: string }[] = []
  const forbid = new Set(q.forbid ?? [])
  for (const h of hits) {
    const key = hitKey(h)
    const row = rows.get(h.chunk_id)
    const owner = deps.owners?.[key]
    let reason = ''
    if (forbid.has(key)) reason = 'forbidden source for this asker'
    else if (!row) reason = 'returned chunk not found in the index'
    else if (!oracleCanSee(caller, row)) reason = `stored row not visible (${row.tenant_id ?? 'platform'}, ${row.visibility})`
    else if (owner && !ownerAllows(caller, owner, h.source_type)) reason = 'source belongs to someone else'
    if (reason) leaks.push({ key, reason })
  }
  const returned: ReturnedHit[] = hits.map((h) => ({ key: hitKey(h), type: h.source_type, title: h.title, score: h.score }))
  return scoreQuestion(q, returned, latency, leaks)
}

export async function runQuestions(questions: readonly GoldenQuestion[], deps: RunDeps): Promise<QuestionResult[]> {
  const out: QuestionResult[] = []
  for (const q of questions) out.push(await runQuestion(q, deps)) // sequential: honest latency numbers
  return out
}
