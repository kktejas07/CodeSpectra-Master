/**
 * Langfuse integration — unit tests for the observability wrapper.
 *
 * The SDK is mocked so tests verify wiring (lazy init, no-op when
 * unconfigured, fire-and-forget semantics) without network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock is hoisted above const declarations — vi.hoisted makes
// the mock fns available inside the factory.
const {
  mockGeneration,
  mockUpdate,
  mockTrace,
  mockScore,
  mockFlush,
  MockLangfuse,
} = vi.hoisted(() => {
  const mockGeneration = vi.fn()
  const mockUpdate = vi.fn()
  const mockTrace = vi.fn(() => ({
    generation: mockGeneration,
    update: mockUpdate,
  }))
  const mockScore = vi.fn()
  const mockFlush = vi.fn(() => Promise.resolve())
  const MockLangfuse = vi.fn().mockImplementation(function (this: any) {
    this.trace = mockTrace
    this.generation = mockGeneration
    this.score = mockScore
    this.flushAsync = mockFlush
  })
  return { mockGeneration, mockUpdate, mockTrace, mockScore, mockFlush, MockLangfuse }
})

vi.mock('langfuse', () => ({ Langfuse: MockLangfuse }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-secrets-cache', () => ({
  readServerSecrets: vi.fn(() => Promise.resolve({ langfuse_api_key: '' })),
  isMaskedSecret: vi.fn(() => false),
}))

import {
  langfuseTrace,
  langfuseGeneration,
  langfuseScore,
  langfuseFlush,
  langfuseEnabled,
  _resetClient,
} from '@/lib/ai/langfuse'

describe('langfuse wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetClient()
    delete process.env.LANGFUSE_SECRET_KEY
    delete process.env.LANGFUSE_PUBLIC_KEY
    delete process.env.LANGFUSE_BASE_URL
  })

  afterEach(() => {
    delete process.env.LANGFUSE_SECRET_KEY
    delete process.env.LANGFUSE_PUBLIC_KEY
    delete process.env.LANGFUSE_BASE_URL
  })

  it('returns no-op trace when unconfigured (no keys)', async () => {
    const trace = await langfuseTrace({ name: 'test' })
    trace.generation({ name: 'gen', model: 'gpt-4' })
    trace.update({ output: 'hello' })
    expect(MockLangfuse).not.toHaveBeenCalled()
  })

  it('initialises Langfuse when both keys are set', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test-secret'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test-public'

    const trace = await langfuseTrace({ name: 'test-trace', userId: 'u1' })

    expect(MockLangfuse).toHaveBeenCalledWith(
      expect.objectContaining({
        secretKey: 'sk-lf-test-secret',
        publicKey: 'pk-lf-test-public',
      }),
    )
    expect(mockTrace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test-trace', userId: 'u1' }),
    )

    trace.generation({
      name: 'chat',
      model: 'gpt-4o-mini',
      usage: { input: 100, output: 50, unit: 'TOKENS' },
      latencyMs: 1200,
    })
    expect(mockGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat', model: 'gpt-4o-mini' }),
    )
  })

  it('langfuseGeneration creates a standalone trace + generation', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'

    await langfuseGeneration({
      name: 'grading',
      model: 'llama-3.3-70b',
      userId: 'u2',
      usage: { input: 200, output: 80, unit: 'TOKENS' },
      latencyMs: 800,
      metadata: { provider: 'groq', feature: 'grade-question' },
      tags: ['provider:groq'],
    })

    expect(mockTrace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'grading', userId: 'u2' }),
    )
    expect(mockGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'grading', model: 'llama-3.3-70b' }),
    )
  })

  it('langfuseScore logs a score', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'

    await langfuseScore({ name: 'jev_confidence', value: 0.92 })
    expect(mockScore).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'jev_confidence', value: 0.92 }),
    )
  })

  it('langfuseEnabled returns false when unconfigured', async () => {
    expect(await langfuseEnabled()).toBe(false)
  })

  it('langfuseEnabled returns true when keys are set', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'
    expect(await langfuseEnabled()).toBe(true)
  })

  it('langfuseFlush does not throw when unconfigured', async () => {
    await expect(langfuseFlush()).resolves.toBeUndefined()
  })

  it('uses custom base URL from env', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'
    process.env.LANGFUSE_BASE_URL = 'http://langfuse.internal:3000'

    await langfuseTrace({ name: 'test' })

    expect(MockLangfuse).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://langfuse.internal:3000' }),
    )
  })

  it('defaults to Langfuse cloud when no base URL set', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'

    await langfuseTrace({ name: 'test' })

    expect(MockLangfuse).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://cloud.langfuse.com' }),
    )
  })

  it('re-uses the cached client on subsequent calls', async () => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test'
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test'

    await langfuseTrace({ name: 'first' })
    await langfuseTrace({ name: 'second' })

    // Constructor called only once despite two trace calls
    expect(MockLangfuse).toHaveBeenCalledTimes(1)
    expect(mockTrace).toHaveBeenCalledTimes(2)
  })
})
