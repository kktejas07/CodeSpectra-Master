/**
 * AGT-047: auto-send steps that are on without a valid grant are shown to
 * org admins and the owner re-enables them in one click.
 * AGT-049: a loop owner / auto-send enabler who lost admin rights or owes
 * admin 2FA can't act; the loop pauses and the org is told.
 *
 * Run: npx vitest run tests/hiring-agents-owner-guard.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ownerBlockReason, reauthoriseAutoSendBy, stepsNeedingOwner } from '@/lib/agent/hiring-loops/auto-send'
import { HL_MESSAGES } from '@/lib/agent/hiring-loops/i18n'

const NOW = new Date('2026-10-24T10:00:00Z')
const grant = (u: string) => ({ user_id: u, name: u, at: NOW.toISOString() })

describe('AGT-047 / AGT-049 rules (pure)', () => {
  it('flags steps on with no grant or an invalid enabler; ignores steps off', () => {
    const valid = (u: string) => u === 'A'
    expect(stepsNeedingOwner({ send_invites: true }, {}, valid)).toEqual(['send_invites'])
    expect(stepsNeedingOwner({ send_invites: true }, { send_invites: grant('A') }, valid)).toEqual([])
    expect(stepsNeedingOwner({ send_invites: true }, { send_invites: grant('B') }, valid)).toEqual(['send_invites'])
    expect(stepsNeedingOwner({ send_invites: false }, {}, valid)).toEqual([])
    expect(stepsNeedingOwner(undefined, undefined, valid)).toEqual([])
  })

  it('re-stamps only the listed steps', () => {
    const by = reauthoriseAutoSendBy({ offer_slots: grant('A') }, ['send_invites'], { id: 'O', name: 'Owner' }, NOW)
    expect(by).toEqual({ offer_slots: grant('A'), send_invites: { user_id: 'O', name: 'Owner', at: NOW.toISOString() } })
  })

  it('an owner who lost rights or owes 2FA is blocked', () => {
    expect(ownerBlockReason({ authorised: true, twoFactorOwed: false })).toBeNull()
    expect(ownerBlockReason({ authorised: false, twoFactorOwed: false })).toBe('owner')
    expect(ownerBlockReason({ authorised: true, twoFactorOwed: true })).toBe('owner_2fa')
  })

  it('has every new string in en / hi / te', () => {
    for (const k of ['autoSendNeedsOwner', 'autoSendReauthorise', 'blocked.owner_2fa', 'notify.paused.owner', 'notify.paused.owner_2fa'] as const) {
      for (const loc of ['en', 'hi', 'te'] as const) expect(HL_MESSAGES[loc][k], `${loc}:${k}`).toBeTruthy()
    }
  })
})

describe('PATCH /api/admin/hiring-agents { reauthorise_auto_send }', () => {
  const state = {
    caller: { userId: 'O', role: 'tenant_admin', tenantId: 't1', name: 'Owner' } as Record<string, unknown>,
    owner: 'O' as string | null,
    saved: null as Record<string, unknown> | null,
    validUsers: new Set<string>(),
  }
  beforeEach(() => {
    vi.resetModules()
    state.saved = null
    state.validUsers = new Set()
    vi.doMock('@/lib/agent/hiring-loops/http', () => ({ hiringAgentsGate: async () => ({ caller: state.caller, tenantId: 't1' }) }))
    vi.doMock('@/lib/agent/http', () => ({ readJson: async (req: Request) => req.json(), auditAgent: async () => undefined }))
    vi.doMock('@/lib/tenant-owner', () => ({ orgOwnerId: async () => state.owner }))
    vi.doMock('@/lib/agent/hiring-loops/runtime', () => ({ autoSendEnablerValid: async (u: string) => state.validUsers.has(u) }))
    vi.doMock('@/lib/agent/hiring-loops/store', () => ({
      getLoopSettings: async () => ({ settings: { auto_send: { send_invites: true } }, owner_id: 'O', owner_name: 'Owner', updated_at: null, auto_send_by: {} }),
      saveAutoSendBy: async (_t: string, _l: string, by: Record<string, unknown>) => { state.saved = by; return { settings: {}, owner_name: 'Owner', auto_send_by: by } },
    }))
  })
  const req = () => new Request('http://x/api/admin/hiring-agents', { method: 'PATCH', body: JSON.stringify({ loop: 'sourcer', reauthorise_auto_send: true }) })

  it('the owner re-enables an ungranted step in one call', async () => {
    state.caller = { userId: 'O', role: 'tenant_admin', tenantId: 't1', name: 'Owner' }
    const { PATCH } = await import('@/app/api/admin/hiring-agents/route')
    const res = await PATCH(req())
    expect(res.status).toBe(200)
    expect((await res.json()).reauthorised).toEqual(['send_invites'])
    expect(state.saved).toMatchObject({ send_invites: { user_id: 'O' } })
  })

  it('another org admin cannot', async () => {
    state.caller = { userId: 'B', role: 'tenant_admin', tenantId: 't1', name: 'Bala' }
    const { PATCH } = await import('@/app/api/admin/hiring-agents/route')
    const res = await PATCH(req())
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('hiring_auto_send_owner_only')
    expect(state.saved).toBeNull()
  })
})
