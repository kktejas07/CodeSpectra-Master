/**
 * ProposedAction lifecycle against an in-memory Mongo: confirm is idempotent
 * and runs execute() once, expired / cancelled / foreign / demoted callers are
 * refused, edits re-run propose(); conversations are owner + tenant scoped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'
import { ToolInputError, type AgentCaller, type AgentTool, type ProposedAction } from '@/lib/agent/contract'

import { confirmAction, cancelAction, editAction } from '@/lib/agent/actions'
import * as store from '@/lib/agent/store'

const db = vi.hoisted(() => ({ current: null as unknown as FakeDb }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))

const ADMIN: AgentCaller = { userId: 'u1', role: 'tenant_admin', tenantId: 't1' }
const OTHER_TENANT: AgentCaller = { userId: 'u1', role: 'tenant_admin', tenantId: 't2' }
const OTHER_USER: AgentCaller = { userId: 'u2', role: 'tenant_admin', tenantId: 't1' }

function makeTool(over: Partial<AgentTool> = {}) {
  const execute = vi.fn(async (args: Record<string, unknown>) => {
    await new Promise((r) => setTimeout(r, 5))
    return { ok: true, message: `Created ${String(args.title)}`, link: '/dashboard/admin/assessments/x1' }
  })
  const propose = vi.fn(async (args: Record<string, unknown>) => ({ title: `Create test “${String(args.title)}”`, preview: { title: args.title } }))
  const tool: AgentTool = {
    name: 'create_test',
    description: 'Create',
    kind: 'write',
    risk: 'create',
    roles: ['superadmin', 'tenant_admin'],
    parameters: { type: 'object', properties: { title: { type: 'string' } } },
    parse: (raw) => {
      const t = (raw as { title?: unknown }).title
      if (typeof t !== 'string' || !t.trim()) throw new ToolInputError('title is required')
      return { title: t.trim() }
    },
    propose,
    execute,
    ...over,
  }
  return { tool, execute, propose }
}

function action(over: Partial<ProposedAction> = {}): ProposedAction {
  const now = Date.now()
  return {
    id: 'a1',
    conversationId: 'conv1',
    tool: 'create_test',
    risk: 'create',
    title: 'Create test “Java”',
    preview: { title: 'Java' },
    args: { title: 'Java' },
    status: 'pending',
    created_by: 'u1',
    tenant_id: 't1',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 3_600_000).toISOString(),
    ...over,
  }
}

beforeEach(() => {
  db.current = new FakeDb()
})

describe('confirm', () => {
  it('runs execute once, stores the result + link, audits and notes the conversation', async () => {
    const { tool, execute } = makeTool()
    const audit = vi.fn(async () => undefined)
    await store.saveAction(action())
    const r = await confirmAction(ADMIN, 'a1', { getTool: () => tool, audit })
    expect(r).toMatchObject({ ok: true, status: 200, action: { status: 'done', result: { ok: true, message: 'Created Java', link: '/dashboard/admin/assessments/x1' } } })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({ title: 'Java' }, expect.objectContaining({ caller: ADMIN, conversationId: 'conv1' }))
    expect(audit).toHaveBeenCalledWith({ id: 'u1' }, 'agent.action.done', 'a1', expect.stringContaining('create_test'), 'info')
    const notes = db.current.collection('agent_messages').docs
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ kind: 'action_update', hidden: true, role: 'user', action_id: 'a1' })
  })

  it('is idempotent: a second confirm replays the stored result without executing again', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action())
    await confirmAction(ADMIN, 'a1', { getTool: () => tool })
    const again = await confirmAction(ADMIN, 'a1', { getTool: () => tool })
    expect(again).toMatchObject({ ok: true, replayed: true, action: { status: 'done' } })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('a double click (concurrent confirms) executes once', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action())
    const [a, b] = await Promise.all([confirmAction(ADMIN, 'a1', { getTool: () => tool }), confirmAction(ADMIN, 'a1', { getTool: () => tool })])
    expect(execute).toHaveBeenCalledTimes(1)
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })

  it('refuses an expired proposal and marks it expired', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action({ expires_at: new Date(Date.now() - 1000).toISOString() }))
    const r = await confirmAction(ADMIN, 'a1', { getTool: () => tool })
    expect(r).toMatchObject({ ok: false, status: 410 })
    expect(execute).not.toHaveBeenCalled()
    expect((await store.getAction(ADMIN, 'a1'))?.status).toBe('expired')
  })

  it('re-auth: another user or tenant cannot see it; a demoted role is refused and it stays pending', async () => {
    const { tool, execute } = makeTool({ roles: ['superadmin'] })
    await store.saveAction(action())
    expect(await confirmAction(OTHER_USER, 'a1', { getTool: () => tool })).toMatchObject({ ok: false, status: 404 })
    expect(await confirmAction(OTHER_TENANT, 'a1', { getTool: () => tool })).toMatchObject({ ok: false, status: 404 })
    expect(await confirmAction(ADMIN, 'a1', { getTool: () => tool })).toMatchObject({ ok: false, status: 403 })
    expect(execute).not.toHaveBeenCalled()
    expect((await store.getAction(ADMIN, 'a1'))?.status).toBe('pending')
  })

  it('re-validates stored args with parse() before executing', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action({ args: { title: '' } }))
    const r = await confirmAction(ADMIN, 'a1', { getTool: () => tool })
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(execute).not.toHaveBeenCalled()
    expect((await store.getAction(ADMIN, 'a1'))?.status).toBe('pending')
  })

  it('records failed when execute reports failure or throws', async () => {
    const { tool } = makeTool({ execute: async () => ({ ok: false, message: 'Seat limit reached' }) })
    await store.saveAction(action())
    expect(await confirmAction(ADMIN, 'a1', { getTool: () => tool })).toMatchObject({ ok: true, action: { status: 'failed', result: { ok: false, message: 'Seat limit reached' } } })

    const { tool: boom } = makeTool({ execute: async () => { throw new Error('db exploded: secret detail') } })
    await store.saveAction(action({ id: 'a2' }))
    const r = await confirmAction(ADMIN, 'a2', { getTool: () => boom })
    expect(r).toMatchObject({ ok: true, action: { status: 'failed' } })
    expect(r.ok && r.action.result?.message).not.toMatch(/secret detail/)
  })

  it('refuses a tool that is gone or not a write tool', async () => {
    await store.saveAction(action())
    expect(await confirmAction(ADMIN, 'a1', { getTool: () => undefined })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('cancel and edit', () => {
  it('cancel moves pending → cancelled; confirm afterwards is refused', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action())
    expect(await cancelAction(ADMIN, 'a1')).toMatchObject({ ok: true, action: { status: 'cancelled' } })
    expect(await cancelAction(ADMIN, 'a1')).toMatchObject({ ok: true, replayed: true })
    expect(await confirmAction(ADMIN, 'a1', { getTool: () => tool })).toMatchObject({ ok: false, status: 409 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('edit re-validates, re-runs propose() and refreshes the preview', async () => {
    const { tool, propose, execute } = makeTool()
    await store.saveAction(action())
    const r = await editAction(ADMIN, 'a1', { title: '  Kotlin  ' }, { getTool: () => tool })
    expect(r).toMatchObject({ ok: true, action: { status: 'pending', args: { title: 'Kotlin' }, title: 'Create test “Kotlin”', preview: { title: 'Kotlin' } } })
    expect(propose).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(await editAction(ADMIN, 'a1', { title: '' }, { getTool: () => tool })).toMatchObject({ ok: false, status: 422 })
    expect(await editAction(OTHER_USER, 'a1', { title: 'x' }, { getTool: () => tool })).toMatchObject({ ok: false, status: 404 })
  })
})

describe('conversation store scoping', () => {
  it('lists, renames and deletes only within owner + tenant; delete cancels pending proposals', async () => {
    const conv = await store.createConversation(ADMIN, 'First')
    await store.appendUserMessage(ADMIN, conv.id, 'hello')
    await store.saveAction(action({ conversationId: conv.id }))
    expect(await store.listConversations(ADMIN)).toHaveLength(1)
    expect(await store.listConversations(OTHER_TENANT)).toHaveLength(0)
    expect(await store.getConversation(OTHER_USER, conv.id)).toBeNull()
    expect(await store.renameConversation(OTHER_TENANT, conv.id, 'hijack')).toBe(false)
    expect(await store.renameConversation(ADMIN, conv.id, '  Renamed  ')).toBe(true)
    expect((await store.getConversation(ADMIN, conv.id))?.title).toBe('Renamed')
    expect(await store.deleteConversation(OTHER_USER, conv.id)).toBe(false)
    expect(await store.deleteConversation(ADMIN, conv.id)).toBe(true)
    expect(await store.loadMessages(ADMIN, conv.id)).toHaveLength(0)
    expect((await store.getAction(ADMIN, 'a1'))?.status).toBe('cancelled')
  })

  it('expireStaleActions only touches pending proposals past expiry', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    await store.saveAction(action({ id: 'p', expires_at: past }))
    await store.saveAction(action({ id: 'd', expires_at: past, status: 'done' }))
    await store.saveAction(action({ id: 'f' }))
    expect(await store.expireStaleActions()).toBe(1)
    expect((await store.getAction(ADMIN, 'p'))?.status).toBe('expired')
    expect((await store.getAction(ADMIN, 'd'))?.status).toBe('done')
    expect((await store.getAction(ADMIN, 'f'))?.status).toBe('pending')
  })
})

describe('superadmin tenant scope + action id', () => {
  const SUPER: AgentCaller = { userId: 'su', role: 'superadmin', tenantId: null }

  it('confirm passes actionId and runs a superadmin proposal inside the tenant it was drafted for', async () => {
    const { tool, execute } = makeTool()
    await store.saveAction(action({ created_by: 'su', tenant_id: 't9' }))
    const r = await confirmAction(SUPER, 'a1', { getTool: () => tool })
    expect(r).toMatchObject({ ok: true, action: { status: 'done' } })
    expect(execute).toHaveBeenCalledWith({ title: 'Java' }, expect.objectContaining({ caller: { ...SUPER, tenantId: 't9' }, actionId: 'a1' }))
  })

  it('tenant admins still only match their own tenant; another superadmin cannot see it', async () => {
    await store.saveAction(action({ created_by: 'su', tenant_id: 't9' }))
    expect(await store.getAction({ userId: 'su', role: 'tenant_admin', tenantId: 't1' }, 'a1')).toBeNull()
    expect(await store.getAction({ userId: 'other', role: 'superadmin', tenantId: null }, 'a1')).toBeNull()
    expect(await store.getAction(SUPER, 'a1')).not.toBeNull()
  })

  it('stores the chosen scope on a superadmin conversation only', async () => {
    const c = await store.createConversation(SUPER, 'Scoped', 't9')
    expect(c.scope_tenant_id).toBe('t9')
    expect(c.tenant_id).toBeNull()
    const t = await store.createConversation(ADMIN, 'Mine', 't9')
    expect(t.scope_tenant_id).toBeUndefined()
  })
})
