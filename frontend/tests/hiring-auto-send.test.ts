/**
 * SEC-036: hiring-agent auto-send — only the organisation owner or a
 * superadmin can switch it on, the enabling admin is recorded, and auto-sent
 * items go out in the organisation's name.
 * Run: npx vitest run tests/hiring-auto-send.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoSendTurnedOn, autoSentNote, mayEnableAutoSend, nextAutoSendBy, orgSenderName } from '@/lib/agent/hiring-loops/auto-send'

const NOW = new Date('2026-10-23T10:00:00Z')

describe('auto-send rules (pure)', () => {
  it('detects only off → on changes', () => {
    expect(autoSendTurnedOn({ send_invites: false }, { send_invites: true })).toEqual(['send_invites'])
    expect(autoSendTurnedOn({ send_invites: true }, { send_invites: true })).toEqual([])
    expect(autoSendTurnedOn({ send_invites: true }, { send_invites: false })).toEqual([])
    expect(autoSendTurnedOn(undefined, undefined)).toEqual([])
  })

  it('only the org owner or a superadmin may switch it on', () => {
    expect(mayEnableAutoSend({ userId: 'A', role: 'tenant_admin' }, 'A')).toBe(true)
    expect(mayEnableAutoSend({ userId: 'B', role: 'tenant_admin' }, 'A')).toBe(false)
    expect(mayEnableAutoSend({ userId: 'B', role: 'tenant_admin' }, null)).toBe(false)
    expect(mayEnableAutoSend({ userId: 'S', role: 'superadmin' }, 'A')).toBe(true)
  })

  it('stamps the enabling admin and drops the stamp when switched off', () => {
    const by = nextAutoSendBy({}, { send_invites: false }, { send_invites: true }, { id: 'A', name: 'Asha' }, NOW)
    expect(by.send_invites).toEqual({ user_id: 'A', name: 'Asha', at: NOW.toISOString() })
    // Saving again while on keeps the original grant (no take-over by a later saver).
    const again = nextAutoSendBy(by, { send_invites: true }, { send_invites: true }, { id: 'B', name: 'Bala' }, NOW)
    expect(again.send_invites.user_id).toBe('A')
    expect(nextAutoSendBy(by, { send_invites: true }, { send_invites: false }, { id: 'B' }, NOW)).toEqual({})
  })

  it('sends as the organisation and names the enabling admin in the note', () => {
    expect(orgSenderName('Acme')).toBe('Acme hiring team')
    expect(orgSenderName('')).toBe('Hiring team')
    expect(autoSentNote({ user_id: 'A', name: 'Asha', at: NOW.toISOString() })).toContain('enabled by A')
    expect(autoSentNote(null)).toBe('auto-sent by the organisation')
  })
})

describe('PATCH /api/admin/hiring-agents', () => {
  const state = { caller: { userId: 'B', role: 'tenant_admin', tenantId: 't1', name: 'Bala' }, owner: 'A' as string | null, saved: 0, audits: [] as string[] }
  beforeEach(() => {
    vi.resetModules()
    state.saved = 0
    state.audits = []
    vi.doMock('@/lib/agent/hiring-loops/http', () => ({ hiringAgentsGate: async () => ({ caller: state.caller, tenantId: 't1' }) }))
    vi.doMock('@/lib/agent/http', () => ({
      readJson: async (req: Request) => req.json(),
      auditAgent: async (_a: unknown, action: string) => { state.audits.push(action) },
    }))
    vi.doMock('@/lib/tenant-owner', () => ({ orgOwnerId: async () => state.owner }))
    vi.doMock('@/lib/agent/hiring-loops/store', () => ({
      getLoopSettings: async () => ({ settings: { auto_send: { send_invites: false } }, owner_id: 'A', owner_name: 'Asha', updated_at: null, auto_send_by: {} }),
      saveLoopSettings: async () => { state.saved++; return { settings: {}, owner_name: 'Asha', auto_send_by: {} } },
    }))
  })
  const patch = (auto: Record<string, boolean>) => new Request('http://x/api/admin/hiring-agents', { method: 'PATCH', body: JSON.stringify({ loop: 'sourcer', patch: { auto_send: auto } }) })

  it('refuses a second org admin switching auto-send on', async () => {
    state.caller = { userId: 'B', role: 'tenant_admin', tenantId: 't1', name: 'Bala' }
    const { PATCH } = await import('@/app/api/admin/hiring-agents/route')
    const res = await PATCH(patch({ send_invites: true }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('hiring_auto_send_owner_only')
    expect(state.saved).toBe(0)
  })

  it('lets any org admin switch it off', async () => {
    state.caller = { userId: 'B', role: 'tenant_admin', tenantId: 't1', name: 'Bala' }
    const { PATCH } = await import('@/app/api/admin/hiring-agents/route')
    const res = await PATCH(patch({ send_invites: false }))
    expect(res.status).toBe(200)
    expect(state.saved).toBe(1)
    expect(state.audits).not.toContain('hiring_agent.auto_send_enabled')
  })

  it('lets the owner switch it on and audits it', async () => {
    state.caller = { userId: 'A', role: 'tenant_admin', tenantId: 't1', name: 'Asha' }
    const { PATCH } = await import('@/app/api/admin/hiring-agents/route')
    const res = await PATCH(patch({ send_invites: true }))
    expect(res.status).toBe(200)
    expect(state.audits).toContain('hiring_agent.auto_send_enabled')
  })
})
