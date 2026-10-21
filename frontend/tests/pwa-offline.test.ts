/**
 * PWA offline practice + install rules: offline pack (no hidden tests /
 * solutions), daily pick, queued submission builder, install-card engagement,
 * bottom-nav active tab, manifest.
 * Run: npx vitest run tests/pwa-offline.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildOfflinePack, dailyIndex, todayKey } from '@/lib/pwa/offline-payload'
import { buildQueuedSubmission, isPackExpired, queueStatusLabel, MAX_QUEUE_ITEMS } from '@/lib/pwa/offline-queue'
import { recordVisit, shouldShowInstall } from '@/components/pwa/install-state'
import { isTabActive } from '@/components/pwa/bottom-nav'
import manifest from '@/app/manifest'

const DOC = {
  id: 'p1',
  slug: 'two-sum',
  title: 'Two sum',
  difficulty: 'easy',
  topics: ['arrays', 'hashing'],
  statement_md: 'Find two numbers…',
  input_format: 'n then n ints',
  output_format: 'two indices',
  constraints: '1 ≤ n ≤ 1e5',
  test_cases: [
    { id: 't1', stdin: '2\n1 2', expected_stdout: '0 1', is_sample: true },
    { id: 't2', stdin: 'HIDDEN', expected_stdout: 'HIDDEN-ANSWER', is_sample: false },
  ],
  starter_code: { python: 'def solve(): pass', JavaScript: 'function solve(){}', 'bad lang!': 'x' },
  editorial_md: 'SOLUTION: use a hash map',
  solution_code: { python: 'secret' },
  created_by: 'author-1',
  time_limit_ms: 2000,
}

describe('buildOfflinePack', () => {
  const pack = buildOfflinePack(DOC, '2026-10-21', new Date('2026-10-21T08:00:00Z'))
  const json = JSON.stringify(pack)

  it('ships samples only — never hidden tests, editorials or solutions', () => {
    expect(pack.problem.samples).toEqual([{ stdin: '2\n1 2', expected_stdout: '0 1' }])
    expect(json).not.toContain('HIDDEN')
    expect(json).not.toContain('SOLUTION')
    expect(json).not.toContain('secret')
    expect(json).not.toContain('author-1')
  })

  it('keeps the statement and valid starter languages', () => {
    expect(pack.problem.statement_md).toBe('Find two numbers…')
    expect(Object.keys(pack.problem.starter_code).sort()).toEqual(['javascript', 'python'])
    expect(pack.key).toBe('daily:2026-10-21')
  })

  it('expires at the end of the next UTC day', () => {
    expect(pack.expires_at).toBe('2026-10-23T00:00:00.000Z')
    expect(isPackExpired(pack, Date.parse('2026-10-22T23:59:00Z'))).toBe(false)
    expect(isPackExpired(pack, Date.parse('2026-10-23T00:00:00Z'))).toBe(true)
    expect(isPackExpired({ expires_at: 'nonsense' }, 0)).toBe(true)
  })
})

describe('daily pick', () => {
  it('is deterministic per UTC day and in range', () => {
    expect(todayKey(new Date('2026-10-21T23:59:59Z'))).toBe('2026-10-21')
    const i = dailyIndex('2026-10-21', 37)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(i).toBeLessThan(37)
    expect(dailyIndex('2026-10-21', 37)).toBe(i)
    expect(dailyIndex('2026-10-21', 0)).toBe(-1)
  })
})

describe('buildQueuedSubmission', () => {
  const pack = buildOfflinePack(DOC, '2026-10-21')
  const opts = { id: 'q1', now: 123, csrf: 'tok' }

  it('builds a normal /api/submissions submit', () => {
    const r = buildQueuedSubmission(pack, 'Python', 'print(1)', opts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.item).toMatchObject({
      id: 'q1', state: 'queued', attempts: 0, created_at: 123, endpoint: '/api/submissions', csrf: 'tok',
      body: { problem_slug: 'two-sum', language: 'python', source_code: 'print(1)', mode: 'submit' },
    })
  })

  it('rejects empty, oversized or odd input before queueing', () => {
    expect(buildQueuedSubmission(pack, 'python', '   ', opts).ok).toBe(false)
    expect(buildQueuedSubmission(pack, '', 'x', opts).ok).toBe(false)
    expect(buildQueuedSubmission(pack, 'py;rm -rf', 'x', opts).ok).toBe(false)
    expect(buildQueuedSubmission(pack, 'python', 'x'.repeat(50_001), opts).ok).toBe(false)
    expect(buildQueuedSubmission(pack, 'python', 'x', { ...opts, queueLength: MAX_QUEUE_ITEMS }).ok).toBe(false)
  })

  it('describes queue states in plain words', () => {
    expect(queueStatusLabel({ state: 'queued' })).toBe('Waiting for a connection')
    expect(queueStatusLabel({ state: 'synced', result: { status: 'accepted', passed: 3, total: 3 } })).toBe('Accepted · 3/3 tests')
    expect(queueStatusLabel({ state: 'synced', result: { status: 'wrong_answer', passed: 1, total: 3 } })).toBe('wrong answer · 1/3 tests')
    expect(queueStatusLabel({ state: 'rejected', error: 'Problem not found' })).toBe('Problem not found')
  })
})

describe('install card engagement', () => {
  const DAY = 86_400_000
  it('is not shown on the first visit', () => {
    expect(shouldShowInstall(recordVisit({ days: [] }, '2026-10-21'), 0)).toBe(false)
  })
  it('counts distinct days only', () => {
    const e = recordVisit(recordVisit({ days: [] }, '2026-10-21'), '2026-10-21')
    expect(e.days).toEqual(['2026-10-21'])
    expect(shouldShowInstall(recordVisit(e, '2026-10-22'), 0)).toBe(true)
  })
  it('stays hidden for 30 days after "Not now" and once installed', () => {
    const e = { days: ['a', 'b'], dismissedAt: 1000 }
    expect(shouldShowInstall(e, 1000 + 29 * DAY)).toBe(false)
    expect(shouldShowInstall(e, 1000 + 31 * DAY)).toBe(true)
    expect(shouldShowInstall({ days: ['a', 'b'], installed: true }, 0)).toBe(false)
  })
})

describe('bottom nav', () => {
  it('marks the right tab active', () => {
    expect(isTabActive('/dashboard', '/dashboard', true)).toBe(true)
    expect(isTabActive('/dashboard/problems', '/dashboard', true)).toBe(false)
    expect(isTabActive('/dashboard/problems/two-sum', '/dashboard/problems')).toBe(true)
    expect(isTabActive('/dashboard/problemsets', '/dashboard/problems')).toBe(false)
  })
})

describe('manifest', () => {
  it('is installable: standalone, start url, any + maskable icons, shortcuts', () => {
    const m = manifest()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/dashboard?source=pwa')
    const icons = m.icons ?? []
    for (const size of ['192x192', '512x512']) {
      expect(icons.some((i) => i.sizes === size && i.purpose === 'maskable')).toBe(true)
      expect(icons.some((i) => i.sizes === size && i.purpose === 'any')).toBe(true)
    }
    expect((m.shortcuts ?? []).map((s) => s.name)).toEqual(['Daily challenge', 'Study plan', 'Contests', 'Practice'])
  })
})
