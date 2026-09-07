import { describe, it, expect, vi, afterEach } from 'vitest'
import { similarityScore, parseRepoUrl, auditSubmissionRepo } from '@/lib/hackathons/repo-audit'

describe('similarityScore', () => {
  it('scores identical code ~1', () => {
    const code = 'function add(a, b) { return a + b; }\nconst x = add(1, 2);'
    expect(similarityScore(code, code)).toBeGreaterThan(0.99)
  })

  it('scores unrelated code low', () => {
    const a = 'function quicksort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; }'
    const b = 'class DatabaseConnection { async connect() { await this.pool.acquire(); } }'
    expect(similarityScore(a, b)).toBeLessThan(0.3)
  })

  it('scores boilerplate-heavy pairs mid (shared scaffolding, different logic)', () => {
    const header = 'import React from "react";\nimport { useState, useEffect } from "react";\n'
    const a = `${header}export default function UsersPage() { const [users, setUsers] = useState([]); useEffect(() => { fetchUsers().then(setUsers); }, []); return renderUserTable(users); }`
    const b = `${header}export default function OrdersPage() { const [orders, setOrders] = useState([]); useEffect(() => { fetchOrders().then(setOrders); }, []); return renderOrderChart(orders); }`
    const s = similarityScore(a, b)
    expect(s).toBeGreaterThan(0.1)
    expect(s).toBeLessThan(0.9)
  })

  it('returns 0 for empty inputs', () => {
    expect(similarityScore('', 'const x = 1')).toBe(0)
    expect(similarityScore('', '')).toBe(0)
  })

  it('ignores comments and string literals when comparing', () => {
    const a = '// totally different comment here\nconst API_KEY = "aaaa-bbbb-cccc";\nfunction add(x, y) { return x + y; }'
    const b = '// another unrelated remark\nconst API_KEY = "zzzz-yyyy-xxxx";\nfunction add(x, y) { return x + y; }'
    expect(similarityScore(a, b)).toBeGreaterThan(0.9)
  })
})

describe('parseRepoUrl', () => {
  it('parses owner/repo', () => {
    expect(parseRepoUrl('https://github.com/acme/widget')).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('strips .git suffix and trailing slash', () => {
    expect(parseRepoUrl('https://github.com/acme/widget.git')).toEqual({ owner: 'acme', repo: 'widget' })
    expect(parseRepoUrl('https://github.com/acme/widget/')).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('rejects non-GitHub hosts with a clear flag', () => {
    const r = parseRepoUrl('https://gitlab.com/acme/widget')
    expect(r).toHaveProperty('error')
    expect((r as { error: string }).error).toMatch(/not a github\.com URL/)
  })

  it('rejects empty and malformed URLs', () => {
    expect(parseRepoUrl('')).toHaveProperty('error')
    expect(parseRepoUrl('https://github.com/onlyowner')).toHaveProperty('error')
  })
})

describe('rateLimited flag', () => {
  const baseOpts = {
    repoUrl: 'https://github.com/acme/widget',
    eventStartISO: '2026-01-01T00:00:00.000Z',
    eventEndISO: '2026-01-03T00:00:00.000Z',
    teamSize: 3,
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flags rateLimited on GitHub 403 and explains the fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: 'API rate limit exceeded' }),
    })))
    const pack = await auditSubmissionRepo(baseOpts)
    expect(pack.rateLimited).toBe(true)
    expect(pack.repoAccessible).toBe(false)
    expect(pack.limitations.some((l) => /rate limit/i.test(l || ''))).toBe(true)
  })

  it('does not flag rateLimited on 404 (private/missing)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })))
    const pack = await auditSubmissionRepo(baseOpts)
    expect(typeof pack.rateLimited).toBe('boolean')
    expect(pack.rateLimited).toBe(false)
    expect(pack.repoAccessible).toBe(false)
  })
})
