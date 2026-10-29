/**
 * Learn produced 0 posts across 12 scheduled runs because `callModel` trusted
 * `res.json` whenever it was an object — and `{}` is an object — so the real
 * JSON in `text` was never parsed and every draft failed with "title: expected
 * string, received undefined". These pin the recovery paths.
 */
import { describe, expect, it } from 'vitest'
import { coercePostJson } from '@/lib/learn/generate'

const post = { title: 'Big-O notation', summary: 'x'.repeat(60), level: 'beginner' }

describe('coercePostJson', () => {
  it('prefers a populated json field', () => {
    expect(coercePostJson(post, {})).toEqual(post)
  })

  it('ignores an empty json object and uses the parsed text instead (the production bug)', () => {
    expect(coercePostJson({}, post)).toEqual(post)
  })

  it('unwraps a single-key container', () => {
    expect(coercePostJson({ post })).toEqual(post)
    expect(coercePostJson({ data: post })).toEqual(post)
  })

  it('unwraps a one-element array', () => {
    expect(coercePostJson([post])).toEqual(post)
  })

  it('walks through the transport envelope (the live failure: keys ok, raw, json, …)', () => {
    expect(coercePostJson({ ok: true, raw: '', json: post, usage: {}, provider: 'groq', model: 'm' })).toEqual(post)
  })

  it('returns null when nothing usable is present', () => {
    expect(coercePostJson(null, undefined, {}, [])).toBeNull()
  })
})
