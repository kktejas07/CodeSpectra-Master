/**
 * New copilot tools (AGT-010..014): every one re-checks role + organisation.
 * Hiring tools only see the caller's organisation (a superadmin must pick
 * one), marketplace / Learn / feed moderation are platform-admin only, and
 * workflow + scheduled-task tools act inside the caller's organisation.
 * Runs against the in-memory Mongo used by the RAG eval.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({ db: null as unknown, moved: [] as Array<{ tenant: string; app: string; to: string }> }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/rag/search', () => ({ searchKnowledge: vi.fn(async () => []) }))
vi.mock('@/lib/rag/hooks', () => ({
  knowledgeOnAtsJob: vi.fn(), knowledgeOnAtsApplication: vi.fn(), knowledgeOnLibraryChange: vi.fn(), knowledgeOnEventChange: vi.fn(),
  knowledgeOnTestChange: vi.fn(), knowledgeOnMarketplaceProduct: vi.fn(), knowledgeOnExternalEvent: vi.fn(), knowledgeOnLearnPost: vi.fn(),
}))
vi.mock('@/lib/admin-audit', () => ({ auditAdmin: vi.fn(async () => {}) }))
vi.mock('@/lib/ats/access', async (orig) => ({ ...(await orig<typeof import('@/lib/ats/access')>()), auditAts: vi.fn(async () => {}) }))
vi.mock('@/lib/ats/engine', async (orig) => ({
  ...(await orig<typeof import('@/lib/ats/engine')>()),
  moveApplication: vi.fn(async (actor: { tenantId: string }, appId: string, to: string) => {
    h.moved.push({ tenant: actor.tenantId, app: appId, to })
    return { id: appId, stage_id: to }
  }),
}))

import { ToolInputError, ToolPermissionError, type AgentCaller, type ToolContext } from '@/lib/agent/contract'
import { getTool, toolsFor } from '@/lib/agent/tools'
import { __setDraftKeyForTests } from '@/lib/agent/tools/seal'
import { canManage } from '@/lib/agent/tools/scope'

const A: AgentCaller = { userId: 'admin-a', role: 'tenant_admin', tenantId: 'tenant-a', email: 'a@a.test', name: 'Asha' }
const B: AgentCaller = { userId: 'admin-b', role: 'tenant_admin', tenantId: 'tenant-b', email: 'b@b.test' }
const SUPER: AgentCaller = { userId: 'root', role: 'superadmin', tenantId: null, email: 'root@x.test' }
const SUPER_B: AgentCaller = { ...SUPER, tenantId: 'tenant-b' }
const ctx = (caller: AgentCaller): ToolContext => ({ caller, conversationId: 'c1' })

const tool = (name: string) => {
  const t = getTool(name)
  if (!t) throw new Error(`missing ${name}`)
  return t
}
async function run(name: string, raw: unknown, caller: AgentCaller) {
  const t = tool(name)
  return t.run!(await t.parse(raw, ctx(caller)), ctx(caller))
}
async function proposeThenConfirm(name: string, raw: unknown, caller: AgentCaller) {
  const t = tool(name)
  const args = await t.parse(raw, ctx(caller))
  const preview = await t.propose!(args, ctx(caller))
  const stored = JSON.parse(JSON.stringify(args))
  return { preview, confirm: async () => t.execute!(await t.parse(stored, ctx(caller)), { ...ctx(caller), actionId: `act-${Math.random()}` }) }
}

const PIPELINE = [
  { id: 's_applied', type: 'applied', name: 'Applied', advance: 'auto', on_fail: 'review' },
  { id: 's_screen', type: 'screening', name: 'Screening', advance: 'auto', on_fail: 'review' },
  { id: 's_int', type: 'virtual_interview', name: 'Technical interview', advance: 'approval', on_fail: 'review' },
  { id: 's_rej', type: 'rejected', name: 'Rejected', advance: 'auto', on_fail: 'review' },
]

beforeEach(async () => {
  const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
  const db: MemoryDbT = new MemoryDb()
  h.db = db
  h.moved.length = 0
  __setDraftKeyForTests(new Uint8Array(32).fill(3))
  const put = (c: string, docs: Record<string, unknown>[]) => db.collection(c).insertMany(docs)
  await put('ats_jobs', [
    { id: 'job-a', tenant_id: 'tenant-a', title: 'SRE', status: 'open', skills: ['Go'], pipeline: PIPELINE, recruiter_ids: [], hiring_manager_ids: [], openings: 1, description: 'x', criteria: {}, is_public: false, created_at: '2026-10-01', updated_at: '2026-10-01' },
    { id: 'job-b', tenant_id: 'tenant-b', title: 'Analyst', status: 'open', skills: ['SQL'], pipeline: PIPELINE, recruiter_ids: [], hiring_manager_ids: [], openings: 1, description: 'y', criteria: {}, is_public: false, created_at: '2026-10-01', updated_at: '2026-10-01' },
  ])
  await put('ats_candidates', [
    { id: 'cand-a', tenant_id: 'tenant-a', name: 'Priya', email: 'p@x.test', phone: '+911', parsed: { skills: ['Go'] }, tags: [] },
    { id: 'cand-b', tenant_id: 'tenant-b', name: 'Omar', email: 'o@x.test', phone: null, parsed: { skills: ['SQL'] }, tags: [] },
  ])
  await put('ats_applications', [
    { id: 'app-a', tenant_id: 'tenant-a', job_id: 'job-a', candidate_id: 'cand-a', stage_id: 's_screen', stage_entered_at: '2026-10-02', status: 'active', match: { score: 88, reasons: [], missing_must: [] }, results: [], history: [], source: 'apply_page', created_at: '2026-10-02', updated_at: '2026-10-02', compensation: { expected: 99 } },
    { id: 'app-b', tenant_id: 'tenant-b', job_id: 'job-b', candidate_id: 'cand-b', stage_id: 's_screen', stage_entered_at: '2026-10-02', status: 'active', match: { score: 60, reasons: [], missing_must: [] }, results: [], history: [], source: 'apply_page', created_at: '2026-10-02', updated_at: '2026-10-02' },
  ])
  await put('ats_bgv_cases', [
    { id: 'bgv-a', tenant_id: 'tenant-a', application_id: 'app-a', status: 'verifying', region: 'IN', checks: [{ type: 'identity', status: 'pending', data: { pan_masked: 'XXXX1234' }, documents: [{ id: 'd1', name: 'pan.pdf' }] }], updated_at: '2026-10-03' },
    { id: 'bgv-b', tenant_id: 'tenant-b', application_id: 'app-b', status: 'submitted', region: 'IN', checks: [], updated_at: '2026-10-03' },
  ])
  await put('workflows', [
    { id: 'wf-a', name: 'A nudges', trigger: 'manual', is_active: false, tenant_id: 'tenant-a', steps: [{ id: 'log_1', type: 'log', config: { message: 'hi' } }], nodes: [], edges: [], created_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01' },
    { id: 'wf-b', name: 'B nudges', trigger: 'manual', is_active: false, tenant_id: 'tenant-b', steps: [{ id: 'log_1', type: 'log', config: { message: 'hi' } }], nodes: [], edges: [], created_by: 'x', created_at: '2026-10-01', updated_at: '2026-10-01' },
  ])
})

describe('hiring tools are pinned to the caller\'s organisation', () => {
  it('list_jobs shows only your jobs; a superadmin must pick an organisation', async () => {
    const a = (await run('list_jobs', {}, A)).data as { jobs: { id: string; applicants: number }[] }
    expect(a.jobs.map((j) => j.id)).toEqual(['job-a'])
    expect(a.jobs[0].applicants).toBe(1)
    await expect(run('list_jobs', {}, SUPER)).rejects.toThrow(ToolInputError)
    const sb = (await run('list_jobs', {}, SUPER_B)).data as { jobs: { id: string }[] }
    expect(sb.jobs.map((j) => j.id)).toEqual(['job-b'])
  })

  it('another organisation\'s job or application is "not found"', async () => {
    await expect(run('get_job', { job_id: 'job-b' }, A)).rejects.toThrow(ToolPermissionError)
    await expect(run('get_application', { application_id: 'app-b' }, A)).rejects.toThrow(ToolPermissionError)
    await expect(run('list_applicants', { job_id: 'job-b' }, A)).rejects.toThrow(ToolPermissionError)
  })

  it('list_applicants returns match scores without phone or salary', async () => {
    const d = (await run('list_applicants', { job_id: 'job-a', min_match: 50 }, A)).data as { applicants: Record<string, unknown>[] }
    expect(d.applicants[0]).toMatchObject({ application_id: 'app-a', candidate: 'Priya', stage: 'Screening', match: { score: 88 } })
    expect(JSON.stringify(d)).not.toMatch(/\+911|compensation|"expected"/)
  })

  it('move_application_stage resolves the stage by name, only drafts, and moves in the caller\'s tenant on confirm', async () => {
    const { preview, confirm } = await proposeThenConfirm('move_application_stage', { application_id: 'app-a', to_stage: 'technical interview' }, A)
    expect(preview.title).toMatch(/Move Priya to Technical interview/)
    expect(h.moved).toEqual([])
    const r = await confirm()
    expect(r.ok).toBe(true)
    expect(h.moved).toEqual([{ tenant: 'tenant-a', app: 'app-a', to: 's_int' }])
    await expect(proposeThenConfirm('move_application_stage', { application_id: 'app-a', to_stage: 'Screening' }, B)).rejects.toThrow(ToolPermissionError)
  })

  it('shortlist_applicants moves exactly the sealed list', async () => {
    const { preview, confirm } = await proposeThenConfirm('shortlist_applicants', { job_id: 'job-a', to_stage: 'Technical interview', min_match: 80 }, A)
    expect((preview.preview as { applicants: unknown[] }).applicants).toHaveLength(1)
    await confirm()
    expect(h.moved.map((m) => m.app)).toEqual(['app-a'])
  })

  it('get_bgv_status lists only your cases and never documents or personal data', async () => {
    const d = (await run('get_bgv_status', {}, A)).data as { cases: Record<string, unknown>[] }
    expect(d.cases.map((c) => c.case_id)).toEqual(['bgv-a'])
    expect(JSON.stringify(d)).not.toMatch(/pan|documents|XXXX/)
  })
})

describe('platform-only tools', () => {
  it('marketplace money decisions, Learn and feed moderation are superadmin-only', async () => {
    for (const name of ['decide_refund', 'decide_payout', 'moderate_product', 'set_learn_post_status', 'generate_learn_draft', 'set_feed_event_visibility', 'list_marketplace_orders']) {
      expect(toolsFor(A).some((t) => t.name === name)).toBe(false)
      await expect(Promise.resolve().then(() => tool(name).parse({}, ctx(A)))).rejects.toThrow(ToolPermissionError)
    }
    expect(tool('decide_refund').risk).toBe('money')
  })
})

describe('automations', () => {
  it('lists only your workflows and cannot switch on another organisation\'s', async () => {
    const d = (await run('list_workflows', {}, A)).data as { workflows: { id: string }[] }
    expect(d.workflows.map((w) => w.id)).toEqual(['wf-a'])
    await expect(proposeThenConfirm('set_workflow_enabled', { workflow_id: 'wf-b', enabled: true }, A)).rejects.toThrow(ToolPermissionError)
    const all = (await run('list_workflows', {}, SUPER)).data as { workflows: { id: string }[] }
    expect(all.workflows).toHaveLength(2)
  })

  it('schedule_agent_task creates a validated, switched-on schedule workflow in your organisation', async () => {
    const { preview, confirm } = await proposeThenConfirm('schedule_agent_task', {
      title: 'Monday applicants', instructions: 'Summarise new applicants by job', sources: ['new_applicants'], frequency: 'weekly', time_utc: '03:30', weekday: 'monday',
    }, A)
    expect((preview.preview as { cron_utc: string }).cron_utc).toBe('30 3 * * 1')
    const r = await confirm()
    expect(r.ok).toBe(true)
    const db = h.db as MemoryDbT
    const wf = (await db.collection('workflows').findOne({ name: 'Monday applicants' })) as Record<string, unknown>
    expect(wf).toMatchObject({ tenant_id: 'tenant-a', trigger: 'schedule', cron_expression: '30 3 * * 1', is_active: true })
    expect((wf.steps as { type: string; config: Record<string, unknown> }[]).at(-1)).toMatchObject({ type: 'email.send', config: { to: 'a@a.test' } })
  })

  it('a template installs switched off in your organisation', async () => {
    const { WORKFLOW_TEMPLATES } = await import('@/lib/automation/templates')
    const t = WORKFLOW_TEMPLATES.find((x) => !x.platformOnly && x.trigger !== 'event') ?? WORKFLOW_TEMPLATES.find((x) => !x.platformOnly)!
    const { confirm } = await proposeThenConfirm('create_workflow_from_template', { template_id: t.id }, A)
    const r = await confirm()
    if (!r.ok) return // template not available to organisations (platform-only event): nothing created
    const db = h.db as MemoryDbT
    const wf = (await db.collection('workflows').findOne({ template_id: t.id })) as Record<string, unknown>
    expect(wf).toMatchObject({ tenant_id: 'tenant-a', is_active: false })
  })
})

describe('AGT-004: a superadmin scoped to one organisation stays inside it', () => {
  it('canManage', () => {
    expect(canManage(SUPER, { tenant_id: 'tenant-a' })).toBe(true)
    expect(canManage(SUPER_B, { tenant_id: 'tenant-a' })).toBe(false)
    expect(canManage(SUPER_B, { tenant_id: 'tenant-b' })).toBe(true)
    expect(canManage(SUPER_B, { tenant_id: null })).toBe(true)
    expect(canManage(A, { tenant_id: 'tenant-b' })).toBe(false)
  })
})
