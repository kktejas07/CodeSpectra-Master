/**
 * The backend wraps completions as { ok, raw, text }. Reading `res.json` first
 * returned that envelope, so the interview planner saw no `questions` and every
 * mock interview answered 503 "The interviewer is not available right now"
 * (2026-11-03).
 */
import { describe, expect, it } from 'vitest'
import { extractJson, modelJson } from '@/lib/ai/model-json'

describe('modelJson', () => {
  it('reads the payload out of the backend envelope (raw text)', () => {
    const res = { json: { ok: true, raw: '{"greeting":"hi","questions":[{"text":"Explain hashing"}]}' }, raw: '{"greeting":"hi","questions":[{"text":"Explain hashing"}]}' }
    expect(modelJson(res)).toEqual({ greeting: 'hi', questions: [{ text: 'Explain hashing' }] })
  })

  it('accepts a direct payload in res.json', () => {
    expect(modelJson({ json: { questions: [{ text: 'q' }] } })).toEqual({ questions: [{ text: 'q' }] })
  })

  it('never returns the envelope itself', () => {
    expect(modelJson({ json: { ok: true, raw: 'not json' } })).toBeNull()
  })

  it('tolerates fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
})
