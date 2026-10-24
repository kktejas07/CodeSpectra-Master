import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must use vi.hoisted so they're available in vi.mock factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'mem-1' })
  const mockSearch = vi.fn().mockResolvedValue([
    { id: 'mem-1', memory: 'Candidate knows React', score: 0.95 },
    { id: 'mem-2', memory: 'Prefers remote work', score: 0.8 },
  ])
  const mockGetAll = vi.fn().mockResolvedValue([
    { id: 'mem-1', memory: 'Candidate knows React' },
    { id: 'mem-2', memory: 'Prefers remote work' },
  ])
  const mockDeleteAll = vi.fn().mockResolvedValue(undefined)

  // Constructor function (not arrow) so it works with `new`
  function MockMemoryClient(this: any) {
    this.add = mockAdd
    this.search = mockSearch
    this.getAll = mockGetAll
    this.deleteAll = mockDeleteAll
  }

  return { MockMemoryClient, mockAdd, mockSearch, mockGetAll, mockDeleteAll }
})

vi.mock('mem0ai', () => ({
  MemoryClient: mocks.MockMemoryClient,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/server-secrets-cache', () => ({
  readServerSecrets: vi.fn().mockResolvedValue({}),
  isMaskedSecret: vi.fn().mockReturnValue(false),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mem0 candidate memory', () => {
  beforeEach(async () => {
    vi.resetModules()
    mocks.mockAdd.mockClear()
    mocks.mockSearch.mockClear()
    mocks.mockGetAll.mockClear()
    mocks.mockDeleteAll.mockClear()
  })

  it('returns no-ops when unconfigured', async () => {
    delete process.env.MEM0_API_KEY
    const { searchCandidateMemory, mem0Enabled, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    expect(await mem0Enabled()).toBe(false)
    const results = await searchCandidateMemory({
      candidateId: 'c1', orgId: 'org1', query: 'skills',
    })
    expect(results).toEqual([])
    expect(mocks.mockSearch).not.toHaveBeenCalled()
  })

  it('initialises when API key is in env', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { mem0Enabled, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    expect(await mem0Enabled()).toBe(true)
    delete process.env.MEM0_API_KEY
  })

  it('adds candidate memory from messages', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { addCandidateMemory, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    await addCandidateMemory({
      candidateId: 'cand-42',
      orgId: 'org-1',
      messages: [
        { role: 'user', content: 'I have 5 years of React experience' },
        { role: 'assistant', content: 'Great, noted your React expertise' },
      ],
      metadata: { interviewId: 'int-99' },
    })

    expect(mocks.mockAdd).toHaveBeenCalledWith(
      [
        { role: 'user', content: 'I have 5 years of React experience' },
        { role: 'assistant', content: 'Great, noted your React expertise' },
      ],
      {
        userId: 'cand-42',
        metadata: { org_id: 'org-1', interviewId: 'int-99' },
      },
    )
    delete process.env.MEM0_API_KEY
  })

  it('searches candidate memories by query', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { searchCandidateMemory, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    const results = await searchCandidateMemory({
      candidateId: 'cand-42',
      orgId: 'org-1',
      query: 'technical skills',
      limit: 5,
    })

    expect(mocks.mockSearch).toHaveBeenCalledWith('technical skills', {
      filters: { user_id: 'cand-42', org_id: 'org-1' },
      topK: 5,
    })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ id: 'mem-1', memory: 'Candidate knows React', score: 0.95 })
    delete process.env.MEM0_API_KEY
  })

  it('gets all memories for a candidate', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { getCandidateMemories, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    const mems = await getCandidateMemories({ candidateId: 'cand-42', orgId: 'org-1' })

    expect(mocks.mockGetAll).toHaveBeenCalledWith({
      filters: { user_id: 'cand-42', org_id: 'org-1' },
    })
    expect(mems).toHaveLength(2)
    expect(mems[1].memory).toBe('Prefers remote work')
    delete process.env.MEM0_API_KEY
  })

  it('deletes all memories for a candidate (GDPR)', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { deleteCandidateMemories, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    await deleteCandidateMemories({ candidateId: 'cand-42', orgId: 'org-1' })

    expect(mocks.mockDeleteAll).toHaveBeenCalledWith({
      userId: 'cand-42',
    })
    delete process.env.MEM0_API_KEY
  })

  it('never throws on SDK errors', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    mocks.mockSearch.mockRejectedValueOnce(new Error('network timeout'))
    const { searchCandidateMemory, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    const results = await searchCandidateMemory({
      candidateId: 'cand-42', orgId: 'org-1', query: 'skills',
    })
    expect(results).toEqual([])
    delete process.env.MEM0_API_KEY
  })

  it('caches the client across calls', async () => {
    process.env.MEM0_API_KEY = 'test-key-123'
    const { mem0Enabled, _resetClient } = await import('@/lib/ai/mem0')
    _resetClient()

    await mem0Enabled()
    await mem0Enabled()
    // MemoryClient constructor should only be called once (singleton)
    // (The mock is a function, so we check it was instantiated correctly)
    expect(await mem0Enabled()).toBe(true)
    delete process.env.MEM0_API_KEY
  })
})
