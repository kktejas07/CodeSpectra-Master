import { describe, it, expect, vi } from 'vitest'
import { parseScopeRequest, scopedCaller } from '@/lib/agent/scope-tenant'
import { idempotencyKey } from '@/lib/agent/tools/ledger'
import { addedJudges } from '@/lib/services/judge-emails'
import type { AgentCaller } from '@/lib/agent/contract'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/send-email', () => ({ sendEmail: async () => ({ success: true }) }))
vi.mock('@/lib/email-templates', () => ({ hackathonEmailTemplates: {} }))

const SUPER: AgentCaller = { userId: 's', role: 'superadmin', tenantId: null }
const ADMIN: AgentCaller = { userId: 'a', role: 'tenant_admin', tenantId: 't1' }

describe('parseScopeRequest', () => {
  it('superadmin: platform / null / tenant id', () => {
    expect(parseScopeRequest(SUPER, undefined)).toEqual({ kind: 'keep' })
    expect(parseScopeRequest(SUPER, null)).toEqual({ kind: 'set', tenantId: null })
    expect(parseScopeRequest(SUPER, 'platform')).toEqual({ kind: 'set', tenantId: null })
    expect(parseScopeRequest(SUPER, ' t9 ')).toEqual({ kind: 'set', tenantId: 't9' })
    expect(parseScopeRequest(SUPER, { $ne: 1 })).toMatchObject({ kind: 'error', status: 400 })
    expect(parseScopeRequest(SUPER, 'bad id!')).toMatchObject({ kind: 'error', status: 400 })
  })

  it('tenant admin: own tenant or nothing is ignored, anything else is forbidden', () => {
    expect(parseScopeRequest(ADMIN, 't1')).toEqual({ kind: 'keep' })
    expect(parseScopeRequest(ADMIN, 'platform')).toMatchObject({ kind: 'error', status: 403 })
    expect(parseScopeRequest(ADMIN, 't2')).toMatchObject({ kind: 'error', status: 403 })
    expect(parseScopeRequest(ADMIN, null)).toEqual({ kind: 'keep' })
  })

  it('scopedCaller only re-scopes a superadmin', () => {
    expect(scopedCaller(SUPER, 't9').tenantId).toBe('t9')
    expect(scopedCaller(SUPER, null).tenantId).toBeNull()
    expect(scopedCaller(ADMIN, 't9')).toBe(ADMIN)
  })
})

describe('ledger idempotency key', () => {
  const ctx = { caller: ADMIN, conversationId: 'c' }
  it('prefers ctx.actionId, falls back to _nonce, then an args hash', () => {
    expect(idempotencyKey('t', { _nonce: 'n1' }, { ...ctx, actionId: 'act1' })).toBe('action:act1')
    expect(idempotencyKey('t', { _nonce: 'n1' }, ctx)).toBe('nonce:a:n1')
    expect(idempotencyKey('t', { x: 1 }, ctx)).toMatch(/^args:/)
  })
})

describe('addedJudges', () => {
  it('returns only judges that were not on the event', () => {
    expect(addedJudges(['a', 'b', 'b', 'c'], ['a'])).toEqual(['b', 'c'])
    expect(addedJudges(['a'], ['a', 'z'])).toEqual([])
    expect(addedJudges(undefined, undefined)).toEqual([])
  })
})
