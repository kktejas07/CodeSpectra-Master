import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — intercept server-only modules
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

// Mock the LLM-dependent modules so the graph runs without a real AI backend
const mocks = vi.hoisted(() => {
  const mockScreenEvidencePack = vi.fn().mockResolvedValue({
    scores: [
      { key: 'relevance', score: 4, citation: 'solid problem statement' },
      { key: 'innovation', score: 3, citation: 'standard approach' },
      { key: 'implementation', score: 4, citation: 'clean code' },
      { key: 'ai_use', score: 3, citation: 'basic AI integration' },
      { key: 'ux', score: 4, citation: 'responsive design' },
      { key: 'completeness', score: 3, citation: 'some features missing' },
    ],
    total: 21,
    maxTotal: 30,
    notes: 'Solid submission overall',
    model: 'test-model',
    screenedAt: new Date().toISOString(),
  })

  const mockAuditRepo = vi.fn().mockResolvedValue({
    repoUrl: 'https://github.com/test/repo',
    totalFiles: 10,
    totalSize: 5000,
    commitCount: 20,
    languages: { TypeScript: 3000, JavaScript: 2000 },
  })

  return { mockScreenEvidencePack, mockAuditRepo }
})

vi.mock('@/lib/hackathons/ai-screening', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    screenEvidencePack: mocks.mockScreenEvidencePack,
  }
})

vi.mock('@/lib/hackathons/repo-audit', () => ({
  auditSubmissionRepo: mocks.mockAuditRepo,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('judging-graph', () => {
  beforeEach(() => {
    mocks.mockScreenEvidencePack.mockClear()
    mocks.mockAuditRepo.mockClear()
  })

  it('creates and compiles the judging graph', async () => {
    const { createJudgingGraph } = await import('@/lib/hackathons/judging-graph')
    const graph = createJudgingGraph()
    expect(graph).toBeDefined()
    expect(typeof graph.invoke).toBe('function')
  })

  it('runs the full pipeline without human judges (audit → screen → rank)', async () => {
    const { runJudgingPipeline } = await import('@/lib/hackathons/judging-graph')

    const submissions = [
      {
        id: 'sub-1',
        input: { description: 'AI chatbot', techStack: 'Next.js', liveUrl: 'https://github.com/team1/bot' },
      },
      {
        id: 'sub-2',
        input: { description: 'Data viz', techStack: 'D3.js', liveUrl: 'https://github.com/team2/viz' },
      },
    ] satisfies any[]

    const result = await runJudgingPipeline(submissions, null, false)

    // Both should have been audited and screened
    expect(mocks.mockAuditRepo).toHaveBeenCalledTimes(2)
    expect(mocks.mockScreenEvidencePack).toHaveBeenCalledTimes(2)

    // Both should have final scores and ranks
    expect(result.submissions).toHaveLength(2)
    for (const sub of result.submissions) {
      expect(sub.finalScore).toBeGreaterThan(0)
      expect(sub.rank).toBeDefined()
    }

    // Pipeline should have completed all phases
    expect(result.completedPhases).toContain('audit')
    expect(result.completedPhases).toContain('screen')
    expect(result.completedPhases).toContain('rank')
    expect(result.phase).toBe('ranked')
  })

  it('runs with human judges (audit → screen → calibrate → rank)', async () => {
    const { runJudgingPipeline } = await import('@/lib/hackathons/judging-graph')

    const submissions = [
      {
        id: 'sub-1',
        input: { description: 'AI chatbot', liveUrl: 'https://github.com/team1/bot' },
        humanScores: [85, 90, 80],
      },
      {
        id: 'sub-2',
        input: { description: 'Data viz', liveUrl: 'https://github.com/team2/viz' },
        humanScores: [70, 75],
      },
    ] satisfies any[]

    const config = {
      criteria: [],
      aiWeight: 0.4,
      advanceTopN: 3,
      displayCount: 10,
      blindMode: false,
      dropHighLow: false,
    }

    const result = await runJudgingPipeline(submissions, config, true)

    expect(result.completedPhases).toContain('calibrate')
    expect(result.calibration).not.toBeNull()
    expect(result.phase).toBe('ranked')

    // sub-1 should rank higher (higher human scores)
    const sub1 = result.submissions.find((s) => s.id === 'sub-1')
    const sub2 = result.submissions.find((s) => s.id === 'sub-2')
    expect(sub1!.rank).toBeLessThanOrEqual(sub2!.rank!)
  })

  it('skips submissions without repo URLs', async () => {
    const { runJudgingPipeline } = await import('@/lib/hackathons/judging-graph')

    const result = await runJudgingPipeline(
      [{ id: 'sub-no-repo', input: { description: 'No repo' } }],
      null,
      false,
    )

    // Audit should not have been called (no URL)
    expect(mocks.mockAuditRepo).not.toHaveBeenCalled()
    expect(result.submissions[0].evidencePack).toBeUndefined()
  })

  it('records errors without crashing', async () => {
    mocks.mockAuditRepo.mockRejectedValueOnce(new Error('GitHub rate limited'))

    const { runJudgingPipeline } = await import('@/lib/hackathons/judging-graph')

    const result = await runJudgingPipeline(
      [{ id: 'sub-err', input: { description: 'test', liveUrl: 'https://github.com/x/y' } }],
      null,
      false,
    )

    // Graph should complete despite the error
    expect(result.phase).toBe('ranked')
    expect(result.submissions).toHaveLength(1)
  })

  it('preserves pre-existing evidence packs', async () => {
    const { runJudgingPipeline } = await import('@/lib/hackathons/judging-graph')

    const existingPack = { repoUrl: 'test', totalFiles: 5, totalSize: 1000, commitCount: 10, languages: {} }
    const result = await runJudgingPipeline(
      [{ id: 'sub-pre', input: { description: 'pre-audited' }, evidencePack: existingPack as any }],
      null,
      false,
    )

    // Should not re-audit
    expect(mocks.mockAuditRepo).not.toHaveBeenCalled()
    expect(result.submissions[0].evidencePack).toEqual(existingPack)
  })
})

describe('graph builder', () => {
  it('builds and invokes a simple linear graph', async () => {
    const { Annotation, buildGraph, START, END, appendReducer } = await import('@/lib/agent/graph')

    const TestState = Annotation.Root({
      count: Annotation<number>({ reducer: (_old, up) => up, default: () => 0 }),
      log: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
    })

    const graph = buildGraph<typeof TestState.State>(
      TestState,
      [
        { name: 'add1', fn: async (s) => ({ count: s.count + 1, log: ['add1'] }) },
        { name: 'add2', fn: async (s) => ({ count: s.count + 10, log: ['add2'] }) },
      ],
      [
        { from: START, to: 'add1' },
        { from: 'add1', to: 'add2' },
        { from: 'add2', to: END },
      ],
    )

    const result = await graph.invoke({ count: 0, log: [] })
    expect(result.count).toBe(11)
    expect(result.log).toEqual(['add1', 'add2'])
  })

  it('handles node errors gracefully', async () => {
    const { Annotation, buildGraph, START, END, appendReducer } = await import('@/lib/agent/graph')

    const TestState = Annotation.Root({
      value: Annotation<string>({ reducer: (_old, up) => up, default: () => '' }),
      errors: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
    })

    const graph = buildGraph<typeof TestState.State>(
      TestState,
      [
        { name: 'fail', fn: async () => { throw new Error('boom') } },
        { name: 'after', fn: async () => ({ value: 'survived' }) },
      ],
      [
        { from: START, to: 'fail' },
        { from: 'fail', to: 'after' },
        { from: 'after', to: END },
      ],
    )

    const result = await graph.invoke({ value: '', errors: [] })
    expect(result.value).toBe('survived')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('boom')
  })
})
