import { describe, expect, it } from 'vitest'
import { cacheKey, normalizePrompt } from '@/lib/ai/semantic-cache'

describe('normalizePrompt', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePrompt('  hello   world\n\nfoo  ')).toBe('hello world foo')
  })
  it('is case-SENSITIVE (code prompts must not collide)', () => {
    expect(normalizePrompt('Print Hello')).not.toBe(normalizePrompt('print hello'))
  })
  it('handles empty input', () => {
    expect(normalizePrompt('')).toBe('')
  })
})

describe('cacheKey', () => {
  const base = {
    feature: 'test',
    modelRole: 'reasoning',
    systemMessage: 'sys',
    userMessage: 'hello world',
  }
  it('is stable for identical inputs', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }))
  })
  it('ignores whitespace differences', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base, userMessage: '  hello   world ' }))
  })
  it('differs across prompts', () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, userMessage: 'goodbye world' }))
  })
  it('differs across features and roles', () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, feature: 'other' }))
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, modelRole: 'fast' }))
  })
  it('differs across provider/model overrides', () => {
    expect(cacheKey(base)).not.toBe(
      cacheKey({ ...base, providerOverride: 'groq', modelOverride: 'm1' }),
    )
  })
  it('is a 64-char hex sha256', () => {
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{64}$/)
  })
})
