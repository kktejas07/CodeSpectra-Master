import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory `user` collection supporting the operators spendAiCredits uses.
const state: { doc: Record<string, unknown> | null } = { doc: null }
function matches(filter: Record<string, unknown>): boolean {
  const d = state.doc
  if (!d) return false
  const and = (filter.$and as Record<string, unknown>[] | undefined) ?? [filter]
  return and.every((f) => {
    if (f.$or) return (f.$or as Record<string, unknown>[]).some((o) => Object.entries(o).every(([k, v]) => d[k] === v))
    const gte = (f.aiCredits as { $gte?: number } | undefined)?.$gte
    if (gte !== undefined) return typeof d.aiCredits === 'number' && (d.aiCredits as number) >= gte
    return true
  })
}
const col = {
  findOne: vi.fn(async (f: Record<string, unknown>) => (matches(f) ? { ...state.doc } : null)),
  updateOne: vi.fn(async (f: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => {
    if (!matches(f)) return { modifiedCount: 0 }
    if (u.$set) Object.assign(state.doc!, u.$set)
    if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) state.doc![k] = ((state.doc![k] as number) || 0) + (v as number)
    return { modifiedCount: 1 }
  }),
  findOneAndUpdate: vi.fn(async (f: Record<string, unknown>, u: Record<string, Record<string, number>>) => {
    if (!matches(f)) return null
    for (const [k, v] of Object.entries(u.$inc)) state.doc![k] = ((state.doc![k] as number) || 0) + v
    return { ...state.doc }
  }),
}

vi.mock('@/lib/db/admin', () => ({ users: async () => col }))
vi.mock('@/lib/entitlements', async () => {
  const core = await import('@/lib/entitlements-core')
  return {
    userIdFilter: (id: string) => ({ $or: [{ id }, { _id: id }] }),
    getUserEntitlements: async () => ({ planKey: 'free', source: 'default', plan: core.mergePlanDefinition('free', null), subscription: null }),
  }
})

describe('spendAiCredits', () => {
  beforeEach(() => {
    state.doc = { id: 'u1', aiCredits: 3, creditsPlan: 'free', creditsResetAt: new Date(Date.now() + 86_400_000) }
    vi.clearAllMocks()
  })

  it('deducts atomically and returns the new balance', async () => {
    const { spendAiCredits } = await import('@/lib/user-credits')
    expect(await spendAiCredits('u1', 2)).toEqual({ ok: true, balance: 1 })
    expect(state.doc!.aiCredits).toBe(1)
  })

  it('refuses when the balance is too low (never goes negative)', async () => {
    const { spendAiCredits } = await import('@/lib/user-credits')
    expect((await spendAiCredits('u1', 5)).ok).toBe(false)
    expect(state.doc!.aiCredits).toBe(3)
  })

  it('cannot mint credits with a negative or fractional amount', async () => {
    const { spendAiCredits } = await import('@/lib/user-credits')
    await expect(spendAiCredits('u1', -100000)).rejects.toThrow(RangeError)
    await expect(spendAiCredits('u1', 0.5)).rejects.toThrow(RangeError)
    expect(state.doc!.aiCredits).toBe(3)
  })

  it('refund gives back exactly what was taken', async () => {
    const { spendAiCredits, refundAiCredits } = await import('@/lib/user-credits')
    await spendAiCredits('u1', 1)
    await refundAiCredits('u1', 1)
    expect(state.doc!.aiCredits).toBe(3)
    await expect(refundAiCredits('u1', -5)).rejects.toThrow(RangeError)
  })
})
