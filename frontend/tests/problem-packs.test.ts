import { describe, it, expect } from 'vitest'
import { packsContaining, problemAccess, type PackRule } from '@/lib/entitlements-core'

const graphs: PackRule = { id: 'pack_graphs', name: 'Graphs pack', problem_slugs: ['dijkstra', 'Bellman-Ford'], topics: [], included_in_plans: ['pro'], active: true }
const dp: PackRule = { id: 'pack_dp', name: 'DP pack', problem_slugs: [], topics: ['Dynamic-Programming'], included_in_plans: [], active: true }
const retired: PackRule = { id: 'pack_old', name: 'Old pack', problem_slugs: ['legacy-1'], topics: [], included_in_plans: [], active: false }
const PACKS = [graphs, dp, retired]

const free = { id: 'p0', slug: 'two-sum', topics: ['arrays'] }
const inGraphs = { id: 'p1', slug: 'dijkstra', topics: ['graphs'] }
const inDp = { id: 'p2', slug: 'knapsack', topics: ['dynamic-programming', 'arrays'] }
const inOld = { id: 'p3', slug: 'legacy-1', topics: [] }

describe('packsContaining', () => {
  it('matches by slug, id or topic, case-insensitively', () => {
    expect(packsContaining(inGraphs, PACKS).map((p) => p.id)).toEqual(['pack_graphs'])
    expect(packsContaining({ slug: 'bellman-ford' }, PACKS).map((p) => p.id)).toEqual(['pack_graphs'])
    expect(packsContaining({ id: 'dijkstra', slug: 'x' }, PACKS).map((p) => p.id)).toEqual(['pack_graphs'])
    expect(packsContaining(inDp, PACKS).map((p) => p.id)).toEqual(['pack_dp'])
    expect(packsContaining(free, PACKS)).toEqual([])
  })
})

describe('problemAccess', () => {
  it('problems in no pack are open to everyone, even signed out', () => {
    expect(problemAccess({ problem: free, packs: PACKS }).locked).toBe(false)
  })

  it('pack problems are locked for free users and offer the pack', () => {
    const a = problemAccess({ problem: inGraphs, packs: PACKS, planKey: 'free', purchasedPacks: [] })
    expect(a.locked).toBe(true)
    expect(a.unlockWith).toEqual({ id: 'pack_graphs', name: 'Graphs pack' })
  })

  it('a purchase unlocks the pack for good, whatever the plan', () => {
    expect(problemAccess({ problem: inDp, packs: PACKS, planKey: 'free', purchasedPacks: ['pack_dp'] }).locked).toBe(false)
    expect(problemAccess({ problem: inDp, packs: PACKS, planKey: 'free', purchasedPacks: ['PACK_DP'] }).locked).toBe(false)
  })

  it('buying a different pack does not unlock this one', () => {
    expect(problemAccess({ problem: inDp, packs: PACKS, planKey: 'free', purchasedPacks: ['pack_graphs'] }).locked).toBe(true)
  })

  it('plans listed on the pack include it; other paid plans do not', () => {
    expect(problemAccess({ problem: inGraphs, packs: PACKS, planKey: 'pro' }).locked).toBe(false)
    expect(problemAccess({ problem: inGraphs, packs: PACKS, planKey: 'pro_monthly' }).locked).toBe(false)
    expect(problemAccess({ problem: inDp, packs: PACKS, planKey: 'pro' }).locked).toBe(true)
  })

  it('staff bypass', () => {
    expect(problemAccess({ problem: inDp, packs: PACKS, bypass: true }).locked).toBe(false)
  })

  it('a pack that is not on sale still locks, but offers nothing to buy; buyers keep it', () => {
    const a = problemAccess({ problem: inOld, packs: PACKS, planKey: 'free' })
    expect(a.locked).toBe(true)
    expect(a.unlockWith).toBeNull()
    expect(problemAccess({ problem: inOld, packs: PACKS, purchasedPacks: ['pack_old'] }).locked).toBe(false)
  })

  it('junk purchase data never unlocks (deny by default)', () => {
    expect(problemAccess({ problem: inGraphs, packs: PACKS, purchasedPacks: 'pack_graphs' }).locked).toBe(true)
    expect(problemAccess({ problem: inGraphs, packs: PACKS, purchasedPacks: [null, 42] }).locked).toBe(true)
    expect(problemAccess({ problem: inGraphs, packs: PACKS, planKey: null }).locked).toBe(true)
  })
})
