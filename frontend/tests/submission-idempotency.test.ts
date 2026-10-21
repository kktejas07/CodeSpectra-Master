/**
 * Idempotent practice submissions (lib/submission-idempotency.ts + the
 * /api/submissions wrapper): a repeated Idempotency-Key replays the first
 * result and never grades twice. Also checks the offline queue sends the key.
 * Run: npx vitest run tests/submission-idempotency.test.ts
 */
import { createRequire } from 'node:module'
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Doc = Record<string, unknown> & { key: string }
const rows = new Map<string, Doc>()
const fakeCol = {
  createIndex: async () => 'ok',
  insertOne: async (d: Doc) => {
    if (rows.has(d.key)) throw Object.assign(new Error('dup'), { code: 11000 })
    rows.set(d.key, { ...d })
    return { acknowledged: true }
  },
  findOne: async (q: { key: string }) => rows.get(q.key) ?? null,
  updateOne: async (q: Doc, u: { $set: Record<string, unknown> }) => {
    const d = rows.get(q.key)
    if (!d || (q.state && d.state !== q.state) || (q.created_at && d.created_at !== q.created_at)) return { modifiedCount: 0 }
    Object.assign(d, u.$set)
    return { modifiedCount: 1 }
  },
  deleteOne: async (q: Doc) => {
    const d = rows.get(q.key)
    if (d && (!q.state || d.state === q.state)) rows.delete(q.key)
    return { deletedCount: 1 }
  },
}

let graded = 0
let gradeStatus = 200
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => ({ collection: () => fakeCol }) }))
vi.mock('@/lib/route-auth', () => ({ requireAuth: async () => ({ user: { id: 'u1', email: 'a@b.c', role: 'user' } }) }))
vi.mock('@/lib/rate-limit', () => ({ limitRequest: async () => null }))
vi.mock('@/lib/entitlements', () => ({
  getUserEntitlements: async () => ({}), checkLimit: () => null, windowStart: () => '2000-01-01',
  checkProblemAccess: async () => ({ locked: false }), packLockedError: () => ({}),
}))
vi.mock('@/lib/db/leaderboard', () => ({ awardXp: async () => undefined, DIFFICULTY_XP: {}, FIRST_BLOOD_BONUS: 0, getXpRewards: async () => ({}) }))
vi.mock('@/lib/piston', () => ({
  executeOnce: async () => {
    graded++
    if (gradeStatus >= 500) throw new Error('sandbox down')
    return { run: { stdout: '3', stderr: '', code: 0, signal: null } }
  },
}))
vi.mock('@/lib/db/problems', () => {
  const sub = { findOne: async () => null, distinct: async () => [], insertOne: async () => ({}), updateOne: async () => ({}), countDocuments: async () => 0 }
  return {
    problems: async () => ({ findOne: async () => ({ id: 'p1', slug: 'two-sum', difficulty: 'easy', time_limit_ms: 1000, test_cases: [{ id: 't1', stdin: '1 2', expected_stdout: '3', is_sample: true }] }), updateOne: async () => ({}) }),
    submissions: async () => sub,
    newId: () => 'sub-1',
    nowIso: () => new Date().toISOString(),
  }
})

import { claimIdempotency, parseIdempotencyKey, settleIdempotency, PENDING_STALE_MS } from '@/lib/submission-idempotency'
import { POST } from '@/app/api/submissions/route'

const KEY = '7f1c2a9e-5b6d-4c3e-9a8b-0123456789ab' // gitleaks:allow (fixture UUID, not a secret)
function req(key?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key) headers['idempotency-key'] = key
  return new Request('http://x/api/submissions', {
    method: 'POST', headers,
    body: JSON.stringify({ problem_slug: 'two-sum', language: 'python', source_code: 'print(3)', mode: 'submit' }),
  }) as unknown as import('next/server').NextRequest
}

beforeEach(() => { rows.clear(); graded = 0; gradeStatus = 200 })

describe('claim / settle', () => {
  it('accepts uuid-like keys only', () => {
    expect(parseIdempotencyKey(KEY)).toBe(KEY)
    expect(parseIdempotencyKey('short')).toBeNull()
    expect(parseIdempotencyKey('{"$gt":""}aaaaaaaaaaaaaaaa')).toBeNull()
    expect(parseIdempotencyKey(null)).toBeNull()
  })

  it('fresh → in progress → replay', async () => {
    const col = fakeCol as never
    expect(await claimIdempotency(col, 'u1', KEY)).toEqual({ kind: 'fresh' })
    expect(await claimIdempotency(col, 'u1', KEY)).toEqual({ kind: 'in_progress' })
    await settleIdempotency(col, 'u1', KEY, 200, { status: 'accepted' })
    expect(await claimIdempotency(col, 'u1', KEY)).toEqual({ kind: 'replay', status: 200, body: { status: 'accepted' } })
  })

  it('keys are per user', async () => {
    const col = fakeCol as never
    await claimIdempotency(col, 'u1', KEY)
    expect(await claimIdempotency(col, 'u2', KEY)).toEqual({ kind: 'fresh' })
  })

  it('releases the key on 5xx / 429 so a retry is graded', async () => {
    const col = fakeCol as never
    await claimIdempotency(col, 'u1', KEY)
    await settleIdempotency(col, 'u1', KEY, 503, null)
    expect(await claimIdempotency(col, 'u1', KEY)).toEqual({ kind: 'fresh' })
  })

  it('a stale pending claim (crashed request) can be taken over', async () => {
    const col = fakeCol as never
    const t0 = new Date('2026-10-21T00:00:00Z')
    await claimIdempotency(col, 'u1', KEY, t0)
    expect(await claimIdempotency(col, 'u1', KEY, new Date(t0.getTime() + 1000))).toEqual({ kind: 'in_progress' })
    expect(await claimIdempotency(col, 'u1', KEY, new Date(t0.getTime() + PENDING_STALE_MS + 1))).toEqual({ kind: 'fresh' })
  })
})

describe('POST /api/submissions with Idempotency-Key', () => {
  it('grades once and replays the original result on a repeat', async () => {
    const first = await POST(req(KEY))
    const a = await first.json()
    expect(first.status).toBe(200)
    expect(a.status).toBe('accepted')
    expect(graded).toBe(1)

    const second = await POST(req(KEY))
    expect(second.status).toBe(200)
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(await second.json()).toEqual(a)
    expect(graded).toBe(1)
  })

  it('without a key every call is graded (unchanged behaviour)', async () => {
    await POST(req())
    await POST(req())
    expect(graded).toBe(2)
  })
})

describe('offline queue sends the key', () => {
  it('postQueued uses the queue item id as Idempotency-Key', async () => {
    const core = createRequire(import.meta.url)('../public/pwa-core.js')
    const calls: Array<[string, RequestInit]> = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (u: string, init: RequestInit) => { calls.push([u, init]); return new Response('{}', { status: 200 }) }) as typeof fetch
    try {
      await core.postQueued({ id: KEY, endpoint: '/api/submissions', body: { a: 1 } }, 'tok')
    } finally {
      globalThis.fetch = orig
    }
    const h = calls[0][1].headers as Record<string, string>
    expect(h['Idempotency-Key']).toBe(KEY)
    expect(h['x-csrf-token']).toBe('tok')
  })
})
