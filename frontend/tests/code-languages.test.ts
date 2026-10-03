/**
 * Coding-language mapping tests (lib/code-languages.ts — pure logic).
 * Run: npx vitest run tests/code-languages.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CODE_LANGUAGES, monacoIdFor, normalizeCodeLang } from '@/lib/code-languages'

describe('normalizeCodeLang — legacy ids → Piston runtime ids', () => {
  it('maps legacy editor ids to the runtime the grader runs', () => {
    expect(normalizeCodeLang('cpp')).toBe('c++')
    expect(normalizeCodeLang('c#')).toBe('csharp')
    expect(normalizeCodeLang('node')).toBe('javascript')
    expect(normalizeCodeLang('python3')).toBe('python')
    expect(normalizeCodeLang('py')).toBe('python')
  })

  it('passes through already-correct runtime ids (case-insensitive)', () => {
    expect(normalizeCodeLang('Java')).toBe('java')
    expect(normalizeCodeLang('c++')).toBe('c++')
    expect(normalizeCodeLang('go')).toBe('go')
  })

  it('defaults to python when missing', () => {
    expect(normalizeCodeLang(undefined)).toBe('python')
    expect(normalizeCodeLang('')).toBe('python')
  })
})

describe('monacoIdFor — runtime id → editor syntax mode', () => {
  it('maps c++ and csharp to monaco ids', () => {
    expect(monacoIdFor('c++')).toBe('cpp')
    expect(monacoIdFor('csharp')).toBe('csharp')
  })

  it('falls back to python for unknown languages', () => {
    expect(monacoIdFor('brainfuck')).toBe('python')
    expect(monacoIdFor(undefined)).toBe('python')
  })
})

describe('CODE_LANGUAGES catalog', () => {
  it('includes the commonly-requested languages', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id)
    for (const required of ['python', 'java', 'c++', 'csharp', 'javascript', 'go']) {
      expect(ids).toContain(required)
    }
  })

  it('has unique runtime ids (a duplicate would shadow a language)', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
