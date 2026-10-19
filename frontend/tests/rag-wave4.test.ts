/**
 * Wave 4 knowledge layer: résumés only when shared with that employer and
 * purged on account deletion (RAG-004), paged sweeps (RAG-005), corpus-model
 * query embedding with a keyword-only marker (RAG-011), hiring sources
 * (RAG-001), plus the copilot's stale-action recovery (AGT-003).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({ db: null as unknown, embedOn: true, embedCalls: [] as Array<{ onlyModels?: string[] }> }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/upstash-rate-limit', () => ({ acquireRedisLock: async () => true, releaseRedisLock: async () => {} }))
vi.mock('@/lib/rag/embed', async (orig) => {
  const o = await orig<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return {
    ...o,
    availableEmbedModels: async () => (h.embedOn ? localEmbedder.availableEmbedModels() : []),
    embedTexts: async (texts: string[], opts: { onlyModels?: string[] } = {}) => {
      h.embedCalls.push({ onlyModels: opts.onlyModels })
      if (!h.embedOn) return null
      if (opts.onlyModels && !opts.onlyModels.includes('local-hash-v1')) return null
      return localEmbedder.embedTexts(texts)
    },
  }
})

import { loadResume, listResumeIds } from '@/lib/rag/sources/resumes'
import { iterateSourceIds } from '@/lib/rag/sources'
import { indexSource, purgeUserKnowledge, processKnowledgeQueue, sweepKnowledge } from '@/lib/rag/ingest'
import { searchKnowledge } from '@/lib/rag/search'
import { recoverStaleAction } from '@/lib/agent/actions'

const ACME = { userId: 'a', role: 'tenant_admin' as const, tenantId: 'acme' }

beforeEach(async () => {
  const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
  h.db = new MemoryDb()
  h.embedOn = true
  h.embedCalls.length = 0
  const db = h.db as MemoryDbT
  await db.collection('user').insertMany([{ id: 'u1', name: 'Priya Raman', email: 'p@x.test' }, { id: 'u2', name: 'Lena', email: 'l@x.test' }])
  await db.collection('exams').insertMany([{ id: 'e1', tenant_id: 'acme', title: 'Backend' }])
  await db.collection('exam_submissions').insertMany([{ exam_id: 'e1', user_id: 'u1', email: 'p@x.test' }, { exam_id: 'e1', user_id: 'u2', email: 'l@x.test' }])
  await db.collection('resume_drafts').insertMany([{ user_id: 'u2', data: { summary: 'Private Rust draft' } }])
  await db.collection('resumes').insertMany([{ id: 'r1', user_id: 'u1', text_content: 'Kafka and Go at Razorpay. p@x.test', uploaded_at: '2026-09-01' }, { id: 'r9', user_id: 'u1', text_content: 'An older private CV', uploaded_at: '2026-01-01' }])
  await db.collection('job_postings').insertMany([{ id: 'jp1', tenant_id: 'acme' }, { id: 'jp2', tenant_id: 'globex' }])
  await db.collection('job_applications').insertMany([{ job_id: 'jp1', user_id: 'u1', resume_id: 'r1' }, { job_id: 'jp1', user_id: 'u2', resume_id: null }])
})

describe('résumés (RAG-004)', () => {
  it('indexes only the résumé attached to that employer\'s job, never drafts or test-takers', async () => {
    const db = h.db as MemoryDbT
    const r = await loadResume(db as never, 'acme:u1')
    expect(r?.text).toMatch(/Kafka and Go/)
    expect(r?.text).not.toMatch(/older private CV|p@x\.test/)
    expect(await loadResume(db as never, 'acme:u2')).toBeNull() // took the test, applied without a résumé, has a private draft
    expect(await loadResume(db as never, 'globex:u1')).toBeNull() // never applied there
    expect(await listResumeIds(db as never, 100)).toEqual(['acme:u1'])
  })

  it('a deleted account drops out: the loader returns null and purge removes indexed rows', async () => {
    const db = h.db as MemoryDbT
    await indexSource('resume', 'acme:u1')
    await db.collection('rag_sources').insertOne({ id: 'attempt_summary:e1:u1', type: 'attempt_summary', source_id: 'e1:u1', tenant_id: 'acme', tenant_key: 'acme', status: 'ready' })
    expect(await db.collection('rag_chunks').countDocuments({ source_id: 'acme:u1' })).toBeGreaterThan(0)
    expect(await purgeUserKnowledge('u1')).toBe(2)
    expect(await db.collection('rag_chunks').countDocuments({ source_id: 'acme:u1' })).toBe(0)
    expect(await db.collection('rag_sources').countDocuments({ source_id: { $in: ['acme:u1', 'e1:u1'] } })).toBe(0)
    await db.collection('user').deleteOne({ id: 'u1' })
    expect(await loadResume(db as never, 'acme:u1')).toBeNull()
  })
})

describe('sweeps (RAG-005)', () => {
  it('pages through every id in order with no per-type ceiling', async () => {
    const db = h.db as MemoryDbT
    await db.collection('hackathons').insertMany(Array.from({ length: 23 }, (_, i) => ({ id: `h${String(i).padStart(3, '0')}`, tenant_id: i % 2 ? 'acme' : 'globex', name: `H${i}`, status: 'published' })))
    const pages: string[][] = []
    for await (const p of iterateSourceIds(db as never, 'hackathon', null, 5)) pages.push(p)
    expect(pages.map((p) => p.length)).toEqual([5, 5, 5, 5, 3])
    expect(pages.flat()).toHaveLength(23)
    const acme: string[] = []
    for await (const p of iterateSourceIds(db as never, 'hackathon', 'acme', 4)) acme.push(...p)
    expect(acme).toHaveLength(11)
    // Platform library types are not tenant-owned.
    const none: string[] = []
    for await (const p of iterateSourceIds(db as never, 'problem', 'acme')) none.push(...p)
    expect(none).toEqual([])
  })

  it('orphans are always queued for removal', async () => {
    const db = h.db as MemoryDbT
    await db.collection('rag_sources').insertOne({ id: 'hackathon:gone', type: 'hackathon', source_id: 'gone', tenant_id: null, tenant_key: '_platform', status: 'ready' })
    const r = await sweepKnowledge({ types: ['hackathon'] })
    expect(r.byType.hackathon).toBe(1)
    await processKnowledgeQueue({ budgetMs: 5000 })
    expect(await db.collection('rag_sources').countDocuments({ id: 'hackathon:gone' })).toBe(0)
  })
})

describe('hybrid search fallbacks (RAG-011)', () => {
  it('marks results keyword-only when the corpus model cannot embed the query', async () => {
    const db = h.db as MemoryDbT
    // The store builds indexes once per process; this test has a fresh in-memory DB.
    await db.collection('rag_chunks').createIndex({ title: 'text', text: 'text' }, { name: 'rag_chunks_text', weights: { title: 1, text: 1 } })
    await db.collection('ats_jobs').insertOne({ id: 'j1', tenant_id: 'acme', title: 'Site reliability engineer', status: 'open', skills: ['Terraform'], description: 'Run Kubernetes with Terraform.', pipeline: [] })
    await indexSource('ats_job', 'j1')
    const hybrid = await searchKnowledge({ caller: ACME, query: 'Terraform Kubernetes engineer' })
    expect(hybrid[0]).toMatchObject({ source_type: 'ats_job', retrieval: 'hybrid' })
    // Query embedding is restricted to the corpus model.
    expect(h.embedCalls.at(-1)!.onlyModels).toEqual(['local-hash-v1'])
    h.embedOn = false
    const kw = await searchKnowledge({ caller: ACME, query: 'Terraform Kubernetes engineer' })
    expect(kw[0]).toMatchObject({ source_type: 'ats_job', retrieval: 'keyword_only' })
    // Other organisations never see it.
    expect(await searchKnowledge({ caller: { ...ACME, tenantId: 'globex' }, query: 'Terraform Kubernetes engineer' })).toEqual([])
  })
})

describe('stale confirmed actions (AGT-003)', () => {
  const base = { id: 'act1', conversationId: 'c', tool: 't', risk: 'create' as const, title: 'T', preview: {}, args: {}, created_by: 'a', tenant_id: 'acme', created_at: '2026-10-19T00:00:00Z', expires_at: '2026-10-20T00:00:00Z' }
  it('finishes from the ledger, or goes back to pending so the admin can retry', async () => {
    const db = h.db as MemoryDbT
    const now = new Date('2026-10-19T01:00:00Z')
    await db.collection('agent_actions').insertOne({ ...base, status: 'executing', executing_at: '2026-10-19T00:30:00Z' })
    const fresh = await recoverStaleAction(ACME, { ...base, status: 'executing', executing_at: '2026-10-19T00:59:00Z' }, {}, now)
    expect(fresh).toBeNull()
    const done = await recoverStaleAction(ACME, { ...base, status: 'executing', executing_at: '2026-10-19T00:30:00Z' }, { ledgerFor: async () => ({ status: 'done', result: { ok: true, message: 'Created' } }) }, now)
    expect(done).toMatchObject({ status: 'done', result: { ok: true, message: 'Created' } })
    await db.collection('agent_actions').updateOne({ id: 'act1' }, { $set: { status: 'executing', executing_at: '2026-10-19T00:30:00Z' } })
    const back = await recoverStaleAction(ACME, { ...base, status: 'executing', executing_at: '2026-10-19T00:30:00Z' }, { ledgerFor: async () => ({ status: 'running' }) }, now)
    expect(back).toMatchObject({ status: 'pending' })
  })
})
