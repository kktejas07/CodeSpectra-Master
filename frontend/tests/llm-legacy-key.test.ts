import { describe, it, expect, vi, beforeEach } from 'vitest'

// The platform's single legacy api_key must only be used for the provider it
// was saved with — never handed to another vendor.

vi.mock('@/lib/mongodb', () => ({ getMongoDb: vi.fn() }))

const RAW = 'sk-legacy-abcdefghijklmnop'

function mockLlmDoc(value: unknown) {
  return {
    collection: vi.fn().mockReturnValue({
      findOne: vi.fn().mockResolvedValue({ key: 'llm', value }),
      updateOne: vi.fn().mockResolvedValue({}),
    }),
  }
}

describe('legacyKeyFor', () => {
  it('matches only the configured provider (default provider when unset)', async () => {
    const { legacyKeyFor } = await import('@/lib/ai/get-round-robin-key')
    expect(legacyKeyFor({ provider: 'openai', api_key: RAW }, 'openai')).toBe(RAW)
    expect(legacyKeyFor({ provider: 'openai', api_key: RAW }, 'anthropic')).toBeNull()
    expect(legacyKeyFor({ provider: 'OpenAI' as never, api_key: ` ${RAW} ` }, 'openai')).toBe(RAW)
    expect(legacyKeyFor({ provider: '' as never, api_key: RAW }, 'gemini')).toBe(RAW) // default provider
    expect(legacyKeyFor({ provider: '' as never, api_key: RAW }, 'openai')).toBeNull()
    expect(legacyKeyFor({ provider: 'openai', api_key: 'sk••••1234' }, 'openai')).toBeNull()
    expect(legacyKeyFor(null, 'openai')).toBeNull()
  })
})

describe('getRoundRobinKey legacy fallback', () => {
  beforeEach(() => vi.resetModules())

  it('returns the legacy key for its own provider only', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(mockLlmDoc({ provider: 'anthropic', model: 'x', endpoint: '', api_key: RAW, keys: {} }) as never)
    const { getRoundRobinKey } = await import('@/lib/ai/get-round-robin-key')
    expect(await getRoundRobinKey('anthropic')).toBe(RAW)
    expect(await getRoundRobinKey('openai')).toBeNull()
    expect(await getRoundRobinKey('groq')).toBeNull()
  })

  it('getApiKey for another provider falls through to its own secret/env, not the legacy key', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(mockLlmDoc({ provider: 'anthropic', model: 'x', endpoint: '', api_key: RAW, keys: {} }) as never)
    vi.doMock('@/lib/server-secrets-cache', async (orig) => ({ ...(await orig<object>()), readServerSecrets: async () => ({}) }))
    process.env.GROQ_API_KEY = 'gsk-env-key-1234567890'
    try {
      const { getApiKey } = await import('@/lib/ai/get-api-key')
      expect((await getApiKey('groq' as never))?.key).toBe('gsk-env-key-1234567890')
      expect(await getApiKey('openai' as never).then((r) => r?.key ?? null)).not.toBe(RAW)
    } finally {
      delete process.env.GROQ_API_KEY
    }
  })
})
