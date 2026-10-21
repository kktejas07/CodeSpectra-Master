/**
 * pgvector store against a REAL Postgres + pgvector (≥ 0.8). Opt-in: set
 * PGVECTOR_TEST_URL (e.g. a CI service container `pgvector/pgvector:pg17` →
 * postgres://postgres:postgres@localhost:5432/postgres); skipped otherwise.
 * Uses a throw-away model name → its own table, dropped afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AgentCaller } from '@/lib/agent/contract'
import { andFilters, knowledgeAclFilter, MATCH_NOTHING } from '@/lib/rag/acl'
import type { PgPoolLike } from '@/lib/rag/vector-store/pg-pool'
import type { PgVectorStore as Store } from '@/lib/rag/vector-store/pgvector'
import type { VectorRow } from '@/lib/rag/vector-store/types'

const URL = process.env.PGVECTOR_TEST_URL
const MODEL = `it-${Date.now().toString(36)}`
const DIMS = 8

function vec(seed: number): number[] {
  const v = Array.from({ length: DIMS }, (_, i) => Math.sin(seed * 7.1 + i * 1.3))
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map((x) => x / n)
}

const row = (id: string, tenant_key: string, visibility: string, source_type: string, seed: number): VectorRow => ({
  id, source_type, source_id: id, tenant_key, tenant_id: tenant_key === '_platform' ? null : tenant_key, visibility,
  chunk_index: 0, text_hash: 'h', embedding_model: MODEL, embedding: vec(seed), metadata: { n: seed }, updated_at: new Date().toISOString(),
})

describe.skipIf(!URL)('pgvector store on a real Postgres', () => {
  let pool: PgPoolLike & { end: () => Promise<void> }
  let store: Store

  beforeAll(async () => {
    const { getPgPool } = await import('@/lib/rag/vector-store/pg-pool')
    const { PgVectorStore } = await import('@/lib/rag/vector-store/pgvector')
    pool = (await getPgPool(URL!)) as typeof pool
    store = new PgVectorStore(pool)
    await store.ensureSchema(MODEL, DIMS)
    await store.ensureSchema(MODEL, DIMS) // idempotent
    const rows: VectorRow[] = []
    for (let i = 0; i < 400; i++) rows.push(row(`globex-${i}`, 'globex', 'tenant', 'upload', 1)) // all near the query
    for (let i = 0; i < 5; i++) rows.push(row(`acme-${i}`, 'acme', 'tenant', 'upload', 2 + i))
    rows.push(row('plat-public', '_platform', 'public', 'doc', 1), row('plat-staff', '_platform', 'public', 'resume', 1), row('plat-admin', '_platform', 'platform_admin', 'doc', 1))
    await store.upsert(rows)
  }, 60_000)

  afterAll(async () => {
    const { tableNameFor } = await import('@/lib/rag/vector-store/pgvector')
    await pool?.query(`DROP TABLE IF EXISTS "${tableNameFor(MODEL)}"`).catch(() => {})
    await pool?.query('DELETE FROM rag_vector_tables WHERE model = $1', [MODEL]).catch(() => {})
    await pool?.end().catch(() => {})
  })

  const search = (caller: AgentCaller, k = 40) =>
    store.search({ filter: andFilters(knowledgeAclFilter(caller), { embedding_model: MODEL }), vector: vec(1), model: MODEL, k, minScore: -1 })

  it('a small tenant gets all its rows even when another tenant dominates the neighbourhood', async () => {
    const hits = await search({ userId: 'a', role: 'tenant_admin', tenantId: 'acme' })
    const ids = hits.map((h) => h.id)
    expect(ids.filter((id) => id.startsWith('acme-')).sort()).toEqual(['acme-0', 'acme-1', 'acme-2', 'acme-3', 'acme-4'])
    expect(ids).toContain('plat-public')
    expect(ids.some((id) => id.startsWith('globex-') || id === 'plat-staff' || id === 'plat-admin')).toBe(false)
  })

  it('superadmin sees everything; MATCH_NOTHING sees nothing', async () => {
    expect((await search({ userId: 's', role: 'superadmin', tenantId: null }, 10)).length).toBe(10)
    expect(await store.search({ filter: MATCH_NOTHING, vector: vec(1), model: MODEL, k: 10, minScore: -1 })).toEqual([])
  })

  it('replace / delete by source and upsert by id', async () => {
    await store.replaceSource('upload', 'acme-0', [{ ...row('acme-0', 'acme', 'tenant', 'upload', 9), source_id: 'acme-0' }])
    await store.deleteSource('upload', 'acme-1')
    const ids = (await search({ userId: 'a', role: 'tenant_admin', tenantId: 'acme' })).map((h) => h.id)
    expect(ids).toContain('acme-0')
    expect(ids).not.toContain('acme-1')
    expect(await store.count(MODEL)).toBe(407)
  })
})
