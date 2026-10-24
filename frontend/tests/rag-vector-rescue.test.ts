/**
 * RAG-025: a confident vector top hit that the keyword list buries is moved
 * up to rank 3; keyword-led answers keep the top 2.
 *
 * Run: npx vitest run tests/rag-vector-rescue.test.ts
 */
import { describe, it, expect } from 'vitest'
import { FUSION_DEFAULTS, reciprocalRankFusion, VECTOR_RESCUE_DEFAULTS, vectorRescue, vectorRescueConfig } from '@/lib/rag/fusion'

const kw = Array.from({ length: 25 }, (_, i) => `k${i + 1}`)
const fuse = (vec: string[]) => reciprocalRankFusion([vec, kw], FUSION_DEFAULTS.k, [FUSION_DEFAULTS.vector, FUSION_DEFAULTS.keyword])
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('RAG-025: vector-confidence rescue', () => {
  it('moves a confident vector-only hit to rank 3', () => {
    const vector = [{ id: 'para', score: 0.72 }, { id: 'k9', score: 0.55 }]
    const before = fuse(['para', 'k9'])
    expect(ids(before).indexOf('para')).toBeGreaterThan(10)
    const after = ids(vectorRescue(before, vector, kw))
    expect(after.slice(0, 3)).toEqual(['k1', 'k2', 'para'])
    expect(after).toHaveLength(before.length)
  })

  it('also rescues a hit the keyword list ranks poorly', () => {
    const vector = [{ id: 'k18', score: 0.7 }, { id: 'k2', score: 0.6 }]
    expect(ids(vectorRescue(fuse(['k18', 'k2']), vector, kw))[2]).toBe('k18')
  })

  it('does nothing when the vector list is unsure, or the keyword list already ranks it well', () => {
    const lowScore = [{ id: 'para', score: 0.4 }, { id: 'x', score: 0.1 }]
    const noMargin = [{ id: 'para', score: 0.72 }, { id: 'x', score: 0.70 }]
    const kwGood = [{ id: 'k4', score: 0.9 }, { id: 'x', score: 0.1 }]
    for (const v of [lowScore, noMargin, kwGood]) {
      const before = fuse(v.map((x) => x.id))
      expect(ids(vectorRescue(before, v, kw))).toEqual(ids(before))
    }
    expect(vectorRescue(fuse([]), [], kw)).toEqual(fuse([]))
  })

  it('reads the best hit by score even when the list is unsorted', () => {
    const vector = [{ id: 'x', score: 0.3 }, { id: 'para', score: 0.8 }]
    expect(ids(vectorRescue(fuse(['x', 'para']), vector, kw))[2]).toBe('para')
  })

  it('env knobs are clamped; MIN 0 switches it off', () => {
    expect(vectorRescueConfig({})).toEqual(VECTOR_RESCUE_DEFAULTS)
    expect(vectorRescueConfig({ RAG_VECTOR_RESCUE_POSITION: '0', RAG_VECTOR_RESCUE_MIN: 'x' }).position).toBe(1)
    const off = { ...VECTOR_RESCUE_DEFAULTS, minScore: 0 }
    const v = [{ id: 'para', score: 0.99 }]
    expect(ids(vectorRescue(fuse(['para']), v, kw, off))).toEqual(ids(fuse(['para'])))
  })
})
