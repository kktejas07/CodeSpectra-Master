/**
 * The arena publish gate: nothing reaches users unless its reference solution
 * reproduces every expected output. This is the difference between "100
 * challenges" and "100 unsolvable challenges" — the seeds shipped the latter.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  normalizeGeneratedArena,
  verifyArenaChallenge,
  gradedCases,
  type ArenaExecutor,
} from '@/lib/practice-content/arena-generate'
import type { ArenaChallenge } from '@/lib/arena-challenges'
import { problemPublishable } from '@/lib/practice-content/problems-generate'
import { normalizeGeneratedChallenge } from '@/lib/practice-content/challenges-generate'

const goodRaw = {
  title: 'Rotate A Matrix In Place',
  shortDescription: 'Rotate an n x n matrix by 90 degrees clockwise.',
  difficulty: 'medium',
  category: 'Arrays',
  statement: ['stdin: n, then n lines of n integers.', 'Print the rotated matrix, one row per line.'],
  examples: [
    { input: '2\n1 2\n3 4', output: '3 1\n4 2' },
    { input: '1\n5', output: '5' },
  ],
  constraints: ['1 <= n <= 100'],
  solutionCode: [
    'const lines = require("fs").readFileSync(0, "utf8").trim().split("\\n")',
    'const n = Number(lines[0])',
    'const m = lines.slice(1, 1 + n).map(l => l.trim().split(/\\s+/).map(Number))',
    'const out = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => m[n - 1 - j][i]))',
    'console.log(out.map(r => r.join(" ")).join("\\n"))',
  ].join('\n'),
}

/** Reference behaviour for the fixture's cases, so the gate is tested without a sandbox. */
const expectedFor = new Map(goodRaw.examples.map(e => [e.input, e.output]))

function challenge(over: Partial<ArenaChallenge> = {}): ArenaChallenge {
  const n = normalizeGeneratedArena(goodRaw)
  if (!n.ok) throw new Error(n.reason)
  return { ...n.challenge, ...over }
}

describe('normalizeGeneratedArena', () => {
  it('accepts a complete candidate and derives id/slug/points', () => {
    const n = normalizeGeneratedArena(goodRaw)
    expect(n.ok).toBe(true)
    if (!n.ok) return
    expect(n.challenge.id).toBe('gen-rotate-a-matrix-in-place')
    expect(n.challenge.points).toBe(200)
    expect(gradedCases(n.challenge)).toHaveLength(2)
  })

  it('rejects a candidate with no reference solution', () => {
    const n = normalizeGeneratedArena({ ...goodRaw, solutionCode: '' })
    expect(n).toEqual({ ok: false, reason: 'reference solution missing' })
  })

  it('rejects fewer than two worked examples', () => {
    const n = normalizeGeneratedArena({ ...goodRaw, examples: goodRaw.examples.slice(0, 1) })
    expect(n.ok).toBe(false)
  })

  it('rejects an invalid difficulty', () => {
    const n = normalizeGeneratedArena({ ...goodRaw, difficulty: 'expert' })
    expect(n.ok).toBe(false)
  })
})

describe('verifyArenaChallenge (publish gate)', () => {
  const matches: ArenaExecutor = async ({ stdin }) => expectedFor.get(stdin) ?? ''

  it('passes when the reference solution reproduces every expected output', async () => {
    await expect(verifyArenaChallenge(challenge(), matches)).resolves.toEqual({ ok: true })
  })

  it('rejects when one case prints the wrong output', async () => {
    const second = goodRaw.examples[1].input
    const exec: ArenaExecutor = async ({ stdin }) =>
      stdin === second ? '999' : (expectedFor.get(stdin) ?? '')
    const res = await verifyArenaChallenge(challenge(), exec)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toContain('case 2')
    expect(res.reason).toContain('999')
  })

  it('rejects when the solution crashes', async () => {
    const exec: ArenaExecutor = async () => { throw new Error('SyntaxError: unexpected token') }
    const res = await verifyArenaChallenge(challenge(), exec)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toContain('crashed')
  })

  it('rejects a candidate with nothing gradable', async () => {
    const res = await verifyArenaChallenge(challenge({ examples: [], testCases: [] }), matches)
    expect(res).toEqual({ ok: false, reason: 'no gradable cases' })
  })
})

describe('problemPublishable (problems publish gate)', () => {
  const verified = { verified: true, language: 'python', total: 6, passed: 6, dropped: [], note: '' }

  it('publishes a verified problem with enough tests', () => {
    expect(problemPublishable(verified, 6)).toEqual({ ok: true })
  })

  it('refuses when the reference solution could not verify the tests', () => {
    const res = problemPublishable({ ...verified, verified: false, note: 'No reference solution — hidden tests were not checked.' }, 6)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toContain('No reference solution')
  })

  it('refuses when the runner was unavailable (verified = null)', () => {
    expect(problemPublishable({ ...verified, verified: null }, 6).ok).toBe(false)
  })

  it('refuses when too few tests survived verification', () => {
    const res = problemPublishable(verified, 3)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toContain('need 4')
  })
})

describe('normalizeGeneratedChallenge (challenge drafts)', () => {
  const good = {
    title: 'Rewrite A Blocking Node Route',
    type: 'code_review',
    difficulty: 'medium',
    duration_minutes: 20,
    description: 'The route below reads a 2 GB file with fs.readFileSync inside the request handler. Explain what happens under concurrent load and rewrite it so memory stays bounded.',
  }

  it('accepts a complete prompt and marks it draft', () => {
    const n = normalizeGeneratedChallenge(good)
    expect(n.ok).toBe(true)
    if (!n.ok) return
    expect(n.challenge.review_status).toBe('draft')
    expect(n.challenge.id).toBe('ch_ai_rewrite-a-blocking-node-route')
    expect(n.challenge.duration_minutes).toBe(20)
  })

  it('rejects a vague description — an admin would have to rewrite it anyway', () => {
    const n = normalizeGeneratedChallenge({ ...good, description: 'Explain the event loop.' })
    expect(n.ok).toBe(false)
    if (n.ok) return
    expect(n.reason).toContain('description too short')
  })

  it('rejects an unknown type and an out-of-range duration', () => {
    expect(normalizeGeneratedChallenge({ ...good, type: 'trivia' }).ok).toBe(false)
    expect(normalizeGeneratedChallenge({ ...good, duration_minutes: 300 }).ok).toBe(false)
  })
})

describe('generateArenaChallenge', () => {
  it('never publishes a candidate whose verified output is wrong', async () => {
    vi.resetModules()
    vi.doMock('@/lib/ai/backend', () => ({
      backendComplete: async () => ({
        ok: true,
        text: JSON.stringify({
          ...goodRaw,
          solutionCode: 'console.log("nope")',
        }),
      }),
    }))
    const { generateArenaChallenge: generate } = await import('@/lib/practice-content/arena-generate')
    const res = await generate({ maxAttempts: 2, exec: async () => 'unused' })
    expect(res.ok).toBe(false)
    expect(res.attempts).toBe(2)
    vi.doUnmock('@/lib/ai/backend')
  })
})
