/**
 * Pluggable vector store: the ACL filter → SQL translation, TLS rules, the
 * pgvector store against the in-memory pg stand-in (lib/rag/eval/memory-pg.ts,
 * which evaluates the emitted WHERE text), the migration file, the write
 * mirror + outbox, and the resumable backfill + read switch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentCaller } from '@/lib/agent/contract'

const h = vi.hoisted(() => ({ db: null as unknown, pg: null as unknown }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/upstash-rate-limit', () => ({ acquireRedisLock: async () => true, releaseRedisLock: async () => {} }))
vi.mock('@/lib/rag/vector-store/pg-pool', () => ({ getPgPool: async () => h.pg }))
vi.mock('@/lib/rag/embed', async (orig) => {
  const o = await orig<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return { ...o, availableEmbedModels: () => localEmbedder.availableEmbedModels(), embedTexts: (t: string[]) => localEmbedder.embedTexts(t) }
})

import { aclFilterToSql, UnsupportedFilterError } from '@/lib/rag/vector-store/sql-filter'
import { isLocalHost, parseStoreKind, pgConnectionOptions, resetVectorStoreConfigCache } from '@/lib/rag/vector-store/config'
import { PgVectorStore, schemaStatements, tableNameFor, versionAtLeast, vectorLiteral } from '@/lib/rag/vector-store/pgvector'
import { compileWhere, MemoryPg } from '@/lib/rag/eval/memory-pg'
import { MemoryDb } from '@/lib/rag/eval/memory-mongo'
import { andFilters, knowledgeAclFilter, MATCH_NOTHING } from '@/lib/rag/acl'
import { readsMayUsePgvector, resetVectorStoreCaches, type VectorRow } from '@/lib/rag/vector-store'
import { estimateMb } from '@/lib/rag/vector-store/backfill'

const CALLERS: { name: string; caller: AgentCaller; types?: string[]; tenantId?: string | null }[] = [
  { name: 'superadmin', caller: { userId: 's', role: 'superadmin', tenantId: null } },
  { name: 'superadmin scoped', caller: { userId: 's', role: 'superadmin', tenantId: null }, tenantId: 'acme' },
  { name: 'superadmin uploads', caller: { userId: 's', role: 'superadmin', tenantId: null }, types: ['upload'] },
  { name: 'tenant acme', caller: { userId: 'a', role: 'tenant_admin', tenantId: 'acme' } },
  { name: 'tenant acme resumes', caller: { userId: 'a', role: 'tenant_admin', tenantId: 'acme' }, types: ['resume', 'doc'] },
  { name: 'tenant globex', caller: { userId: 'g', role: 'tenant_admin', tenantId: 'globex' } },
  { name: 'tenant without tenant', caller: { userId: 'x', role: 'tenant_admin', tenantId: null } },
  { name: 'candidate', caller: { userId: 'c', role: 'candidate' as AgentCaller['role'], tenantId: null } },
]

function aclRows() {
  const rows: Record<string, unknown>[] = []
  let n = 0
  for (const tenant_key of ['_platform', 'acme', 'globex'])
    for (const visibility of ['public', 'tenant', 'platform_admin'])
      for (const source_type of ['doc', 'upload', 'resume', 'question', 'ats_job'])
        rows.push({ id: `r${String(n++).padStart(3, '0')}`, tenant_key, tenant_id: tenant_key === '_platform' ? null : tenant_key, visibility, source_type, embedding_model: 'm' })
  return rows
}

describe('aclFilterToSql', () => {
  it('binds every value and never interpolates', () => {
    const evil = "acme'; DROP TABLE x; --"
    const w = aclFilterToSql({ tenant_key: evil, source_type: { $in: ['doc', 'upload'] } }, 3)
    expect(w.sql).toBe('(("tenant_key" = $3) AND ("source_type" = ANY($4::text[])))')
    expect(w.params).toEqual([evil, ['doc', 'upload']])
    expect(w.sql).not.toContain('DROP')
  })

  it('MATCH_NOTHING is FALSE and {} is TRUE', () => {
    expect(aclFilterToSql(MATCH_NOTHING).sql).toBe('FALSE')
    expect(aclFilterToSql({}).sql).toBe('TRUE')
  })

  it('fails closed on anything acl.ts does not produce', () => {
    for (const bad of [
      { password: 'x' }, { tenant_key: { $ne: 'acme' } }, { tenant_key: { $in: [1] } }, { $or: [] },
      { $where: 'true' }, { tenant_key: 5 }, { tenant_key: { $in: ['a'], $nin: ['b'] } }, { tenant_key: null },
    ]) expect(() => aclFilterToSql(bad as never)).toThrow(UnsupportedFilterError)
  })

  it('matches exactly the rows the Mongo filter matches, for every caller shape', async () => {
    const db = new MemoryDb()
    const rows = aclRows()
    const col = db.collection('acl')
    await col.insertMany(rows.map((r) => ({ ...r })))
    for (const c of CALLERS) {
      const filter = andFilters(knowledgeAclFilter(c.caller, { types: c.types as never, tenantId: c.tenantId }), { embedding_model: 'm' })
      const mongo = ((await col.find(filter).toArray()) as { id: string }[]).map((r) => r.id).sort()
      const w = aclFilterToSql(filter, 3)
      const pred = compileWhere(w.sql, ['vec', 10, ...w.params])
      const sql = rows.filter(pred).map((r) => r.id as string).sort()
      expect(sql, c.name).toEqual(mongo)
    }
  })
})

describe('pgvector config', () => {
  it('requires verified TLS for non-local hosts', () => {
    const o = pgConnectionOptions('postgres://u:p@db.example.com:5432/rag?sslmode=require')
    expect(o.ssl).toEqual({ rejectUnauthorized: true, servername: 'db.example.com' })
    expect(o.connectionString).not.toContain('sslmode')
    expect(pgConnectionOptions('postgresql://u:p@db.example.com/rag').ssl).toMatchObject({ rejectUnauthorized: true })
    for (const m of ['disable', 'allow', 'prefer', 'no-verify']) {
      expect(() => pgConnectionOptions(`postgres://u:p@db.example.com/rag?sslmode=${m}`)).toThrow(/TLS is required/)
    }
    expect(() => pgConnectionOptions('postgres://u:p@10.0.0.5/rag?ssl=false')).toThrow(/TLS is required/)
  })

  it('allows plain connections to local hosts only', () => {
    expect(pgConnectionOptions('postgres://u:p@localhost:5432/rag').ssl).toBe(false)
    expect(pgConnectionOptions('postgres://u:p@127.0.0.1/rag?sslmode=disable').ssl).toBe(false)
    expect(pgConnectionOptions('postgres://u:p@localhost/rag?sslmode=require').ssl).toMatchObject({ rejectUnauthorized: true })
    expect(isLocalHost('pg.internal')).toBe(false)
    expect(isLocalHost('/var/run/postgresql')).toBe(true)
  })

  it('rejects non-postgres URLs, and the fingerprint never contains credentials', () => {
    expect(() => pgConnectionOptions('mysql://u:p@h/db')).toThrow()
    expect(() => pgConnectionOptions('not a url')).toThrow()
    const a = pgConnectionOptions('postgres://alice:secret1@db.example.com/rag')
    const b = pgConnectionOptions('postgres://bob:secret2@db.example.com/rag')
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(a.fingerprint).not.toMatch(/secret|alice/)
  })

  it('parses the store switch', () => {
    expect(parseStoreKind('pgvector')).toBe('pgvector')
    expect(parseStoreKind(' PGVECTOR ')).toBe('pgvector')
    expect(parseStoreKind('pinecone')).toBe('mongo')
    expect(parseStoreKind(undefined)).toBe('mongo')
  })
})

describe('pgvector schema', () => {
  it('derives N from the embed model config and validates names', () => {
    expect(tableNameFor('text-embedding-3-small')).toBe('rag_vectors_text_embedding_3_small')
    expect(schemaStatements('text-embedding-3-small', 1).join('\n')).toContain('vector(1536)')
    expect(schemaStatements('text-embedding-004', 1).join('\n')).toContain('vector(768)')
    expect(() => tableNameFor('***')).toThrow()
    expect(() => schemaStatements('big-model', 3072)).toThrow(/at most 2000/)
    expect(versionAtLeast('0.8.0', '0.8.0')).toBe(true)
    expect(versionAtLeast('0.10.1', '0.8.0')).toBe(true)
    expect(versionAtLeast('0.7.4', '0.8.0')).toBe(false)
    expect(() => vectorLiteral([1, Number.NaN], 2)).toThrow()
    expect(() => vectorLiteral([1], 2)).toThrow()
  })

  it('the migration file is the same DDL ensureSchema runs', () => {
    const file = fs.readFileSync(path.join(__dirname, '../lib/rag/vector-store/migrations/001_rag_vectors.sql'), 'utf8')
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    for (const stmt of schemaStatements('text-embedding-3-small', 1536)) expect(norm(file)).toContain(norm(stmt))
    expect(file).toContain('CREATE EXTENSION IF NOT EXISTS vector')
  })

  it('ensureSchema is idempotent and refuses pgvector < 0.8', async () => {
    const pg = new MemoryPg()
    const store = new PgVectorStore(pg)
    await store.ensureSchema('m4', 4)
    await new PgVectorStore(pg).ensureSchema('m4', 4)
    expect(pg.registry).toEqual([{ model: 'm4', table_name: 'rag_vectors_m4', dims: 4 }])
    expect([...pg.indexes].sort()).toEqual(['rag_vectors_m4_acl', 'rag_vectors_m4_hnsw', 'rag_vectors_m4_source'])
    await expect(new PgVectorStore(new MemoryPg({ extensionVersion: '0.7.4' })).ensureSchema('m4', 4)).rejects.toThrow(/0\.8\.0\+ is required/)
    const fresh = new MemoryPg({ extensionInstalled: false })
    await new PgVectorStore(fresh).ensureSchema('m4', 4)
    expect(fresh.extension).toBe('0.8.0')
  })
})

const row = (id: string, tenant_key: string, visibility: string, source_type: string, v: number[], source_id = id): VectorRow => ({
  id, source_type, source_id, tenant_key, tenant_id: tenant_key === '_platform' ? null : tenant_key, visibility,
  chunk_index: 0, text_hash: 'h', embedding_model: 'm2', embedding: v, metadata: {}, updated_at: '2026-10-01T00:00:00.000Z',
})

describe('PgVectorStore', () => {
  it('filters ACL in SQL before LIMIT: a small tenant still gets its own rows when others dominate', async () => {
    const pg = new MemoryPg()
    const store = new PgVectorStore(pg)
    // 300 globex rows exactly on the query direction, 3 acme rows further away.
    const rows = [
      ...Array.from({ length: 300 }, (_, i) => row(`g${String(i).padStart(3, '0')}`, 'globex', 'tenant', 'upload', [1, 0])),
      ...[0.9, 0.8, 0.7].map((x, i) => row(`a${i}`, 'acme', 'tenant', 'upload', [x, Math.sqrt(1 - x * x)])),
    ]
    await store.upsert(rows)
    const acme = knowledgeAclFilter({ userId: 'a', role: 'tenant_admin', tenantId: 'acme' })
    const hits = await store.search({ filter: andFilters(acme, { embedding_model: 'm2' }), vector: [1, 0], model: 'm2', k: 40, minScore: 0.2 })
    expect(hits.map((x) => x.id)).toEqual(['a0', 'a1', 'a2'])
    const search = pg.log.filter((l) => l.tag === 'search').at(-1)!
    expect(search.sql).toMatch(/WHERE [\s\S]*tenant_key[\s\S]* ORDER BY embedding <=> \$1::vector LIMIT \$2$/)
    expect(search.params[1]).toBe(40) // LIMIT is k — no over-fetch
    expect(pg.lastSearchSettings).toContain('100')
    expect(String(pg.lastSearchSettings.at(-1))).toContain("'hnsw.iterative_scan', 'strict_order'")
    expect(await store.search({ filter: MATCH_NOTHING, vector: [1, 0], model: 'm2', k: 40, minScore: 0 })).toEqual([])
  })

  it('upserts by chunk id, replaces and deletes by source, prunes by id', async () => {
    const pg = new MemoryPg()
    const store = new PgVectorStore(pg)
    await store.upsert([row('s:1:0', '_platform', 'public', 'doc', [1, 0], '1'), row('s:1:1', '_platform', 'public', 'doc', [0, 1], '1')])
    await store.upsert([{ ...row('s:1:0', '_platform', 'public', 'doc', [0, 1], '1'), visibility: 'platform_admin' }])
    expect(await store.count('m2')).toBe(2)
    expect(pg.tables.get('rag_vectors_m2')!.rows.get('s:1:0')!.visibility).toBe('platform_admin')
    await store.replaceSource('doc', '1', [row('s:1:0', '_platform', 'public', 'doc', [1, 1], '1')])
    expect(await store.count('m2')).toBe(1)
    await store.deleteSource('doc', '1')
    expect(await store.count('m2')).toBe(0)
    await store.upsert([row('x1', 'acme', 'tenant', 'doc', [1, 0]), row('x2', 'acme', 'tenant', 'doc', [1, 0])])
    expect(await store.listIds('m2', 'x1', 10)).toEqual(['x2'])
    expect(await store.deleteIds('m2', ['x1', 'nope'])).toBe(1)
    await expect(store.upsert([row('bad', 'acme', 'tenant', 'doc', [1, 0, 0])])).rejects.toThrow(/dimensions/)
  })

  it('moves a source between model tables when its embedding model changes', async () => {
    const pg = new MemoryPg()
    const store = new PgVectorStore(pg)
    await store.replaceSource('doc', 'd', [row('doc:d:0', '_platform', 'public', 'doc', [1, 0], 'd')])
    await store.replaceSource('doc', 'd', [{ ...row('doc:d:0', '_platform', 'public', 'doc', [1, 0, 0], 'd'), embedding_model: 'm3' }])
    expect(await store.count('m2')).toBe(0)
    expect(await store.count('m3')).toBe(1)
  })
})

describe('read switch', () => {
  const state = { model: 'm', target: 'fp', status: 'complete' } as never
  it('flips reads only after a completed backfill against the same database', () => {
    expect(readsMayUsePgvector('pgvector', state, 'fp')).toBe(true)
    expect(readsMayUsePgvector('mongo', state, 'fp')).toBe(false)
    expect(readsMayUsePgvector('pgvector', state, 'other-db')).toBe(false)
    expect(readsMayUsePgvector('pgvector', { ...(state as object), status: 'running' } as never, 'fp')).toBe(false)
    expect(readsMayUsePgvector('pgvector', null, 'fp')).toBe(false)
    expect(estimateMb(100_000, 1536)).toBeGreaterThan(1000)
  })
})

describe('mirror, outbox and backfill (in-memory Mongo + pg)', () => {
  beforeEach(() => {
    process.env.PGVECTOR_URL = 'postgres://rag:pw@localhost:5432/rag'
    process.env.RAG_VECTOR_STORE = 'pgvector'
    resetVectorStoreConfigCache()
    resetVectorStoreCaches()
    h.db = new MemoryDb()
    h.pg = new MemoryPg()
  })

  async function seedUploads(n: number) {
    const db = h.db as MemoryDb
    await db.collection('rag_uploads').insertMany(Array.from({ length: n }, (_, i) => ({
      id: `u${i}`, tenant_id: i % 2 ? 'acme' : 'globex', title: `Policy ${i}`, kind: 'policy', tags: [], file_name: 'a.md', mime: 'md', size: 1,
      text: `Retention policy number ${i}: candidate data is kept for ${30 + i} days after the decision.`, scan_status: 'clean', prompt_flags: [],
      uploaded_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01',
    })))
  }

  it('mirrors index writes and deletes; a failed mirror goes to the outbox and is re-synced', async () => {
    const { indexSource, removeSource } = await import('@/lib/rag/ingest')
    const { drainVectorOutbox } = await import('@/lib/rag/vector-store')
    const { LOCAL_EMBED_MODEL } = await import('@/lib/rag/eval/local-embedder')
    await seedUploads(2)
    await indexSource('upload', 'u0')
    const pg = h.pg as MemoryPg
    const table = () => pg.tables.get(tableNameFor(LOCAL_EMBED_MODEL))!.rows
    expect(table().size).toBe(1)
    const r = [...table().values()][0]
    expect(r).toMatchObject({ tenant_key: 'globex', visibility: 'tenant', source_type: 'upload', embedding_model: LOCAL_EMBED_MODEL })
    expect(r.embedding).toHaveLength(512)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    pg.failNext = { tag: 'upsert', n: 1 }
    await indexSource('upload', 'u1') // Mongo write succeeds, mirror fails → never throws
    warn.mockRestore()
    expect(table().size).toBe(1)
    expect(await (h.db as MemoryDb).collection('rag_vector_outbox').countDocuments({})).toBe(1)
    expect(await drainVectorOutbox()).toMatchObject({ synced: 1, remaining: 0 })
    expect(table().size).toBe(2)

    await removeSource('upload', 'u0')
    expect([...table().keys()]).toEqual(['upload:u1:0'])
  })

  it('backfill: dry run writes nothing; real run resumes across budgets, prunes, completes, then reads switch', async () => {
    const { indexSource } = await import('@/lib/rag/ingest')
    const { runBackfill, vectorStoreStatus } = await import('@/lib/rag/vector-store/backfill')
    const { vectorReadStore } = await import('@/lib/rag/vector-store')
    const { LOCAL_EMBED_MODEL } = await import('@/lib/rag/eval/local-embedder')
    // Index with pgvector NOT configured (an existing Mongo deployment).
    delete process.env.PGVECTOR_URL
    resetVectorStoreConfigCache(); resetVectorStoreCaches()
    await seedUploads(120)
    for (let i = 0; i < 120; i++) await indexSource('upload', `u${i}`)
    process.env.PGVECTOR_URL = 'postgres://rag:pw@localhost:5432/rag'
    resetVectorStoreConfigCache(); resetVectorStoreCaches()
    const pg = h.pg as MemoryPg
    // A stale pgvector row (its chunk is gone from Mongo) must be pruned.
    const store = new PgVectorStore(pg)
    await store.upsert([{ ...row('upload:gone:0', 'acme', 'tenant', 'upload', new Array(512).fill(0.1)), embedding_model: LOCAL_EMBED_MODEL }])

    const plan = await runBackfill({ dryRun: true })
    expect(plan).toMatchObject({ dry_run: true, model: LOCAL_EMBED_MODEL, mongo_vectors: 120, pg_vectors: 1, version_ok: true })
    expect(await store.count(LOCAL_EMBED_MODEL)).toBe(1)
    expect(await vectorReadStore(LOCAL_EMBED_MODEL)).toBeNull()

    // Tiny budget + batch: several calls, each resuming from the saved cursor.
    let calls = 0
    let res: Awaited<ReturnType<typeof runBackfill>>
    do {
      res = await runBackfill({ budgetMs: 1, batchSize: 50 })
      calls++
    } while (!res.dry_run && !res.done && calls < 20)
    expect(calls).toBeGreaterThan(1)
    if (res.dry_run) throw new Error('unexpected dry run')
    expect(res.state).toMatchObject({ status: 'complete', phase: 'done', copied: 120, pruned: 1 })
    expect(await store.count(LOCAL_EMBED_MODEL)).toBe(120)

    resetVectorStoreCaches()
    expect((await vectorReadStore(LOCAL_EMBED_MODEL))?.kind).toBe('pgvector')
    expect(await vectorStoreStatus()).toMatchObject({ reads: 'pgvector', configured: true, want: 'pgvector', host: 'localhost' })
    // Operator flips back: reads return to Mongo without touching the backfill.
    process.env.RAG_VECTOR_STORE = 'mongo'
    resetVectorStoreConfigCache(); resetVectorStoreCaches()
    expect(await vectorReadStore(LOCAL_EMBED_MODEL)).toBeNull()
  })

  it('search falls back to the Mongo vector path when pgvector errors', async () => {
    const { indexSource } = await import('@/lib/rag/ingest')
    const { runBackfill } = await import('@/lib/rag/vector-store/backfill')
    const { searchKnowledge } = await import('@/lib/rag/search')
    await seedUploads(4)
    for (let i = 0; i < 4; i++) await indexSource('upload', `u${i}`)
    await runBackfill({})
    resetVectorStoreCaches()
    const caller: AgentCaller = { userId: 'a', role: 'tenant_admin', tenantId: 'acme' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = await searchKnowledge({ caller, query: 'retention policy candidate data' })
    ;(h.pg as MemoryPg).failNext = { tag: 'search', n: 1 }
    const fallback = await searchKnowledge({ caller, query: 'retention policy candidate data' })
    warn.mockRestore()
    expect(ok.length).toBeGreaterThan(0)
    expect(ok.every((x) => x.retrieval === 'hybrid')).toBe(true)
    expect(fallback.map((x) => x.chunk_id)).toEqual(ok.map((x) => x.chunk_id))
    expect(ok.every((x) => ['u1', 'u3'].includes(x.source_id))).toBe(true)
  })
})
