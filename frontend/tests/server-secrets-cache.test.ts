/**
 * A transient Mongo/decrypt failure while reading platform secrets must not be
 * cached as "no secrets configured". The old code stored `{}` and marked the
 * cache valid for the 30s TTL, which is exactly why the course worker logged
 * "All LLM providers failed. Last: No LLM provider with a key is configured"
 * in 3-attempt bursts and then recovered on its own.
 *
 * Run: npx vitest run tests/server-secrets-cache.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findOne = vi.fn()

vi.mock('@/lib/mongodb', () => ({
  getMongoDb: async () => ({ collection: () => ({ findOne, updateOne: async () => ({}) }) }),
}))

import { readServerSecrets, invalidateServerSecretsCache } from '@/lib/server-secrets-cache'

describe('server secrets cache', () => {
  beforeEach(() => {
    findOne.mockReset()
    invalidateServerSecretsCache()
  })

  it('retries after a failed read instead of caching an empty secret set', async () => {
    findOne.mockRejectedValueOnce(new Error('mongo: connection reset'))
    await expect(readServerSecrets()).resolves.toEqual({})

    // Next call must hit Mongo again (no 30s poisoned window).
    findOne.mockResolvedValueOnce({ key: 'secrets', value: { custom_api_key: 'sk-bro-test' } })
    await expect(readServerSecrets()).resolves.toMatchObject({ custom_api_key: 'sk-bro-test' })
    expect(findOne).toHaveBeenCalledTimes(2)
  })

  it('keeps serving the last good snapshot while reads fail', async () => {
    findOne.mockResolvedValueOnce({ key: 'secrets', value: { custom_api_key: 'sk-bro-good' } })
    await expect(readServerSecrets()).resolves.toMatchObject({ custom_api_key: 'sk-bro-good' })

    // Expire the TTL, then fail: callers must still see the key.
    invalidateServerSecretsCache()
    findOne.mockResolvedValueOnce({ key: 'secrets', value: { custom_api_key: 'sk-bro-good' } })
    await readServerSecrets()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 31_000)
    findOne.mockRejectedValueOnce(new Error('mongo: timeout'))
    await expect(readServerSecrets()).resolves.toMatchObject({ custom_api_key: 'sk-bro-good' })
    vi.useRealTimers()
  })
})
