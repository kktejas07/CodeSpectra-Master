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
    process.env.GROQ_API_KEY = 'fake-groq-env-key'
    try {
      const { getApiKey } = await import('@/lib/ai/get-api-key')
      expect((await getApiKey('groq' as never))?.key).toBe('fake-groq-env-key')
      expect(await getApiKey('openai' as never).then((r) => r?.key ?? null)).not.toBe(RAW)
    } finally {
      delete process.env.GROQ_API_KEY
    }
  })
})

describe('resolveModel legacy key with per-task overrides', () => {
  beforeEach(() => vi.resetModules())

  it('gives the legacy key only when the resolved provider is the key owner', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(mockLlmDoc({
      provider: 'anthropic', model: 'claude-x', endpoint: '', api_key: RAW, keys: {},
      taskOverrides: { review_model: { provider: 'openai', model: 'gpt-x' } },
    }) as never)
    const { resolveModel } = await import('@/lib/ai/get-user-model')
    const review = await resolveModel('u1', 'review_model')
    expect(review.providerOverride).toBe('openai')
    expect(review.apiKeyOverride).toBeUndefined()
    const chat = await resolveModel('u1', 'chat_model')
    expect(chat.providerOverride).toBe('anthropic')
    expect(chat.apiKeyOverride).toBe(RAW)
  })

  it('an override on the same provider still gets the legacy key', async () => {
    const { getMongoDb } = await import('@/lib/mongodb')
    vi.mocked(getMongoDb).mockResolvedValue(mockLlmDoc({
      provider: 'anthropic', model: 'claude-x', endpoint: '', api_key: RAW, keys: {},
      taskOverrides: { grade_model: { provider: 'Anthropic', model: 'claude-y' } },
    }) as never)
    const { resolveModel } = await import('@/lib/ai/get-user-model')
    const r = await resolveModel('u2', 'grade_model')
    expect(r.modelOverride).toBe('claude-y')
    expect(r.apiKeyOverride).toBe(RAW)
  })
})
