/**
 * AGT-033 copilot tools for the newer operations modules: news review, social studio,
 * community moderation, mentors, cohorts, coupons / licences, paid certifications and
 * live drives. Platform tools are superadmin-only, organisation tools stay in scope,
 * writes only propose until confirmed. Runs against the in-memory Mongo used by the RAG eval.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/admin-audit', () => ({ auditAdmin: vi.fn(async () => {}) }))
vi.mock('@/lib/signals/publish', () => ({ publishDraft: vi.fn(async (d: { id: string }) => ({ slug: `news-${d.id}` })) }))

import { ToolInputError, ToolPermissionError, type AgentCaller, type ToolContext } from '@/lib/agent/contract'
import { getTool, toolsFor, ALL_TOOLS } from '@/lib/agent/tools'
import { SPECIALISTS, routeIntent } from '@/lib/agent/specialists'
import { inCallerOrg } from '@/lib/agent/tools/read/operations'
import { couponBody } from '@/lib/agent/tools/write/operations'

const A: AgentCaller = { userId: 'admin-a', role: 'tenant_admin', tenantId: 'tenant-a', email: 'a@a.test' }
const SUPER: AgentCaller = { userId: 'root', role: 'superadmin', tenantId: null, email: 'root@x.test' }
const SUPER_B: AgentCaller = { ...SUPER, tenantId: 'tenant-b' }
const ctx = (caller: AgentCaller): ToolContext => ({ caller, conversationId: 'c1' })
const tool = (n: string) => { const t = getTool(n); if (!t) throw new Error(`missing ${n}`); return t }
async function run(name: string, raw: unknown, caller: AgentCaller) {
  const t = tool(name)
  return t.run!(await t.parse(raw, ctx(caller)), ctx(caller))
}

const NEW_READ = ['list_pending_news', 'list_social_queue', 'list_forum_reports', 'list_mentors', 'list_cohorts', 'list_coupons', 'list_org_licences', 'list_cert_reviews', 'list_live_drives']
const NEW_WRITE = ['review_news_draft', 'create_coupon', 'moderate_forum_post', 'decide_mentor', 'decide_cert_review']

beforeEach(async () => {
  const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
  const db: MemoryDbT = new MemoryDb()
  h.db = db
  await db.collection('signal_drafts').insertMany([
    { id: 'n1', title: 'Go 1.25 is out', excerpt: 'x', body: '<p>x</p>', status: 'pending', source_feed: 'go-blog', source_url: 'https://go.dev/blog', trusted: true, ai_rewritten: true, flags: [], fact_check: { ok: false, numbers: ['40'], names: ['Microsoft'], claims: [], checked_at: '2026-10-22T00:00:00Z' }, created_at: '2026-10-22T00:00:00Z', updated_at: '2026-10-22T00:00:00Z' },
    { id: 'n2', title: 'Old', excerpt: 'y', body: '<p>y</p>', status: 'published', blog_slug: 'old', source_feed: 'go-blog', source_url: 'https://go.dev/old', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
  ])
  await db.collection('cohorts').insertMany([
    { id: 'co-a', title: 'DSA batch A', tenant_id: 'tenant-a', status: 'open', starts_at: '2026-11-01', ends_at: '2026-12-01', timezone: 'Asia/Kolkata', capacity: 30, enrolled_count: 3, access: { free: true, entitlement: false, licence_org_ids: [], marketplace_product_id: null, price_minor: null, currency: 'INR' } },
    { id: 'co-b', title: 'DSA batch B', tenant_id: 'tenant-b', status: 'open', starts_at: '2026-11-01', ends_at: '2026-12-01', timezone: 'Asia/Kolkata', capacity: 30, enrolled_count: 3, access: { free: true, entitlement: false, licence_org_ids: [], marketplace_product_id: null, price_minor: null, currency: 'INR' } },
  ])
})

describe('registry + routing', () => {
  it('every new tool is registered and reachable through a specialist', () => {
    const names = new Set(ALL_TOOLS.map((t) => t.name))
    const routed = new Set(SPECIALISTS.flatMap((s) => s.tools))
    for (const n of [...NEW_READ, ...NEW_WRITE]) {
      expect(names.has(n), n).toBe(true)
      expect(routed.has(n), n).toBe(true)
    }
    for (const n of NEW_WRITE) expect(tool(n).kind).toBe('write')
  })
  it('platform-wide tools are superadmin only; organisation tools are offered to tenant admins', () => {
    const tenant = new Set(toolsFor(A).map((t) => t.name))
    for (const n of ['list_pending_news', 'review_news_draft', 'list_social_queue', 'list_mentors', 'decide_mentor', 'list_coupons', 'create_coupon', 'list_cert_reviews', 'decide_cert_review']) expect(tenant.has(n), n).toBe(false)
    for (const n of ['list_cohorts', 'list_live_drives', 'list_org_licences', 'list_forum_reports', 'moderate_forum_post']) expect(tenant.has(n), n).toBe(true)
  })
  it('routes the audit examples to the right specialists', () => {
    expect(routeIntent("approve today's pending news")[0]).toBe('content')
    expect(routeIntent('make a 20% coupon for SNIST')[0]).toBe('marketplace')
    expect(routeIntent('which mentors are waiting for verification')[0]).toBe('marketplace')
  })
})

describe('scope', () => {
  it('inCallerOrg keeps scoped callers in their organisation', () => {
    expect(inCallerOrg(SUPER, 'tenant-x')).toBe(true)
    expect(inCallerOrg(SUPER_B, 'tenant-a')).toBe(false)
    expect(inCallerOrg(A, 'tenant-a')).toBe(true)
    expect(inCallerOrg(A, null)).toBe(false)
  })
  it('a tenant admin is refused superadmin tools even when called directly', async () => {
    await expect(run('list_pending_news', {}, A)).rejects.toBeInstanceOf(ToolPermissionError)
  })
  it('list_cohorts shows only the caller organisation', async () => {
    const a = (await run('list_cohorts', {}, A)).data as { cohorts: { id: string }[] }
    expect(a.cohorts.map((c) => c.id)).toEqual(['co-a'])
    const b = (await run('list_cohorts', {}, SUPER_B)).data as { cohorts: { id: string }[] }
    expect(b.cohorts.map((c) => c.id)).toEqual(['co-b'])
  })
  it('list_org_licences refuses another organisation', async () => {
    await expect(run('list_org_licences', { org_id: 'tenant-b' }, A)).rejects.toBeInstanceOf(ToolInputError)
  })
})

describe('news review', () => {
  it('lists pending drafts with the fact-check result', async () => {
    const d = (await run('list_pending_news', {}, SUPER)).data as { total: number; drafts: { id: string; fact_check: { ok: boolean; unsupported_names: string[] } }[] }
    expect(d.total).toBe(1)
    expect(d.drafts[0]).toMatchObject({ id: 'n1', fact_check: { ok: false, unsupported_names: ['Microsoft'] } })
  })
  it('approve only proposes, warns about the fact check, then publishes on confirm', async () => {
    const t = tool('review_news_draft')
    const args = await t.parse({ draft_id: 'n1', decision: 'approve' }, ctx(SUPER))
    const p = await t.propose!(args, ctx(SUPER))
    expect(JSON.stringify(p.preview)).toMatch(/Fact verifier/)
    const db = h.db as MemoryDbT
    expect((db.collection('signal_drafts').docs as { id: string; status: string }[]).find((x) => x.id === 'n1')?.status).toBe('pending')
    const r = await t.execute!(await t.parse(JSON.parse(JSON.stringify(args)), ctx(SUPER)), { ...ctx(SUPER), actionId: 'act-1' })
    expect(r).toMatchObject({ ok: true, link: '/news/news-n1' })
  })
  it('refuses to reject a live article', async () => {
    const t = tool('review_news_draft')
    await expect(t.propose!(await t.parse({ draft_id: 'n2', decision: 'reject' }, ctx(SUPER)), ctx(SUPER))).rejects.toBeInstanceOf(ToolInputError)
  })
})

describe('coupons', () => {
  it('maps args to the admin coupon body and validates before proposing', async () => {
    expect(couponBody({ code: 'SNIST20', discount_type: 'percentage', discount_value: 20, max_uses: 100 })).toEqual({ code: 'SNIST20', discount_type: 'percentage', discount_value: 20, max_uses: 100 })
    const t = tool('create_coupon')
    const ok = await t.propose!(await t.parse({ code: 'snist20', discount_type: 'percentage', discount_value: 20 }, ctx(SUPER)), ctx(SUPER))
    expect(ok.title).toMatch(/SNIST20/)
    await expect(t.propose!(await t.parse({ code: 'BAD', discount_type: 'percentage', discount_value: 150 }, ctx(SUPER)), ctx(SUPER))).rejects.toBeInstanceOf(ToolInputError)
    await expect(t.propose!(await t.parse({ code: 'FLAT', discount_type: 'flat', discount_value: 100 }, ctx(SUPER)), ctx(SUPER))).rejects.toBeInstanceOf(ToolInputError)
  })
})

describe('forum moderation', () => {
  it('lock is only for threads and a ban needs the author', async () => {
    const t = tool('moderate_forum_post')
    await expect(t.parse({ target_type: 'reply', target_id: 'r0123456789abcdef', action: 'lock' }, ctx(A))).rejects.toBeInstanceOf(ToolInputError)
    await expect(t.parse({ target_type: 'reply', target_id: 'r0123456789abcdef', action: 'hide', ban_days: 7 }, ctx(A))).rejects.toBeInstanceOf(ToolInputError)
  })
  it('a tenant admin who is not a forum moderator cannot propose', async () => {
    const t = tool('moderate_forum_post')
    await expect(t.propose!(await t.parse({ target_type: 'thread', target_id: 't0123456789abcdef', action: 'hide' }, ctx(A)), ctx(A))).rejects.toBeInstanceOf(ToolInputError)
  })
})
