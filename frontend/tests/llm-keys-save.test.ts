import { describe, it, expect, vi, beforeEach } from 'vitest'

// ponytail: the LLM-keys save saga had a shadow-store bug — stale/masked
// entries in platform_settings.llm silently won over fresh secrets and 401'd
// every call. These tests pin the guard at the choke point.

vi.mock('@/lib/mongodb', () => ({
  getMongoDb: vi.fn(),
}))

function mockLlmDoc(doc: unknown) {
  return {
    collection: vi.fn().mockReturnValue({
      findOne: vi.fn().mockResolvedValue(doc),
      updateOne: vi.fn().mockResolvedValue({}),
    }),
  }
}

describe('getRoundRobinKey shadow-store guard', () => {
  beforeEach(async () => {
    vi.resetModules()
    delete process.env.GROQ_API_KEY
  })

  it('returns null for masked placeholder keys (never sends bullets upstream)', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(
      mockLlmDoc({
        key: 'llm',
        value: {
          keys: {
            groq: [{ id: 'k1', key: 'gsk_••••••••abcd', usage_count: 0 }],
          },
        },
      }) as never,
    )
    const { getRoundRobinKey } = await import('@/lib/ai/get-round-robin-key')
    expect(await getRoundRobinKey('groq')).toBeNull()
  })

  it('returns null for short/placeholder entries', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(
      mockLlmDoc({
        key: 'llm',
        value: { keys: { gemini: [{ id: 'k1', key: 'test', usage_count: 0 }] } },
      }) as never,
    )
    const { getRoundRobinKey } = await import('@/lib/ai/get-round-robin-key')
    expect(await getRoundRobinKey('gemini')).toBeNull()
  })

  it('returns the raw key when the shadow entry is valid', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(
      mockLlmDoc({
        key: 'llm',
        value: {
          keys: { groq: [{ id: 'k1', key: 'gsk_validkey1234567890', usage_count: 3 }] },
        },
      }) as never,
    )
    const { getRoundRobinKey } = await import('@/lib/ai/get-round-robin-key')
    expect(await getRoundRobinKey('groq')).toBe('gsk_validkey1234567890')
  })

  it('getApiKey skips masked secrets and falls through (no env → null)', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    // llm doc empty → round-robin yields nothing; secrets doc holds a masked value
    vi.mocked(getMongoDb).mockResolvedValue({
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'platform_settings') {
          return {
            findOne: vi.fn().mockImplementation(async (q: unknown) => {
              const key = (q as { key?: string })?.key
              if (key === 'llm') return null
              if (key === 'secrets')
                return { key: 'secrets', value: { openai_api_key: 'sk-••••••••1234' } }
              return null
            }),
            updateOne: vi.fn().mockResolvedValue({}),
          }
        }
        return { findOne: vi.fn().mockResolvedValue(null), updateOne: vi.fn().mockResolvedValue({}) }
      }),
    } as never)
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    expect(await getApiKey('openai')).toBeNull()
  })
})
