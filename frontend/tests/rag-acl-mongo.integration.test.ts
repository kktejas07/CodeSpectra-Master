/**
 * RAG-021: the knowledge ACL against a REAL MongoDB ($text + the tenant-admin
 * $or filter, and the batched in-process vector scan), not the in-memory
 * stand-in. Opt-in: set RAG_IT_MONGO_URL (e.g. a CI service container
 * `mongo:7` → mongodb://localhost:27017) to run it; skipped otherwise.
 * Uses a throw-away database that is dropped afterwards.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Db, MongoClient } from 'mongodb'

const URL = process.env.RAG_IT_MONGO_URL
const h = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/upstash-rate-limit', () => ({ acquireRedisLock: async () => true, releaseRedisLock: async () => {} }))
vi.mock('@/lib/rag/embed', async (orig) => {
  const o = await orig<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return { ...o, availableEmbedModels: () => localEmbedder.availableEmbedModels(), embedTexts: (t: string[]) => localEmbedder.embedTexts(t) }
})

describe.skipIf(!URL)('knowledge ACL on a real MongoDB', () => {
  let client: MongoClient
  let db: Db

  beforeAll(async () => {
    const { MongoClient } = await import('mongodb')
    client = new MongoClient(URL!)
    await client.connect()
    db = client.db(`rag_it_${Date.now().toString(36)}`)
    h.db = db
    await db.collection('rag_uploads').insertMany([
      { id: 'up-a', tenant_id: 'acme', title: 'Acme retention policy', kind: 'policy', tags: [], file_name: 'a.md', mime: 'md', size: 1, text: 'Acme keeps candidate data for 90 days after the decision.', scan_status: 'clean', prompt_flags: [], uploaded_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01' },
      { id: 'up-b', tenant_id: 'globex', title: 'Globex retention policy', kind: 'policy', tags: [], file_name: 'b.md', mime: 'md', size: 1, text: 'Globex keeps candidate data for 180 days after the decision.', scan_status: 'clean', prompt_flags: [], uploaded_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01' },
      { id: 'up-p', tenant_id: null, title: 'Platform interviewer handbook', kind: 'policy', tags: [], file_name: 'p.md', mime: 'md', size: 1, text: 'Platform staff keep candidate interview notes for 30 days.', scan_status: 'clean', prompt_flags: [], uploaded_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01' },
    ])
    await db.collection('ats_applications').insertOne({ id: 'app-g', tenant_id: 'globex', job_id: 'j-g', candidate_id: 'c-g', stage_id: 's1', status: 'active', created_at: '2026-10-01' })
    await db.collection('ats_jobs').insertOne({ id: 'j-g', tenant_id: 'globex', title: 'Retention analyst', pipeline: [{ id: 's1', name: 'Screening' }] })
    await db.collection('ats_candidates').insertOne({ id: 'c-g', tenant_id: 'globex', name: 'Gina', parsed: { skills: ['candidate data retention'] }, resume: { text: 'Gina works on candidate data retention.' } })
    const { indexSource } = await import('@/lib/rag/ingest')
    for (const [t, id] of [['upload', 'up-a'], ['upload', 'up-b'], ['upload', 'up-p'], ['ats_job', 'j-g'], ['ats_application', 'app-g']] as const) await indexSource(t, id)
  }, 60_000)

  afterAll(async () => {
    await db?.dropDatabase().catch(() => {})
    await client?.close().catch(() => {})
  })

  it('a tenant admin never gets another tenant\'s rows or platform staff-only rows ($text + $or)', async () => {
    const { searchKnowledge } = await import('@/lib/rag/search')
    const hits = await searchKnowledge({ caller: { userId: 'x', role: 'tenant_admin', tenantId: 'acme' }, query: 'how long do we keep candidate data retention' })
    const ids = hits.map((h) => `${h.source_type}:${h.source_id}`)
    expect(ids).toContain('upload:up-a')
    expect(ids.some((i) => /up-b|up-p|app-g|j-g/.test(i))).toBe(false)
  })

  it('a superadmin scoped to one tenant sees that tenant plus platform rows only', async () => {
    const { searchKnowledge } = await import('@/lib/rag/search')
    const hits = await searchKnowledge({ caller: { userId: 'r', role: 'superadmin', tenantId: null }, query: 'candidate data retention', tenantId: 'globex', limit: 20 })
    const ids = hits.map((h) => `${h.source_type}:${h.source_id}`)
    expect(ids).toEqual(expect.arrayContaining(['upload:up-b', 'upload:up-p']))
    expect(ids).not.toContain('upload:up-a')
  })
})
