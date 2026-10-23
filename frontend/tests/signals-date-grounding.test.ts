/**
 * AGT-048: an extracted fact's separate `date` is evidence only when the
 * fetched pages carry that date too; an invented date can't back the article.
 *
 * Run: npx vitest run tests/signals-date-grounding.test.ts
 */
import { describe, it, expect } from 'vitest'
import { dateGrounded, signalEvidenceText, verifySignalDraft } from '@/lib/signals/verify'

describe('AGT-048: fact dates are grounded in the pages', () => {
  it('accepts the common spellings of a date that is in the text', () => {
    for (const src of ['Released on 2026-10-14.', 'Released 14 October 2026', 'Released October 14th, 2026', 'Out Oct 14, 2026', '14/10/2026 release']) {
      expect(dateGrounded('2026-10-14', src), src).toBe(true)
    }
    expect(dateGrounded('Q4 2026', 'planned for Q4 2026')).toBe(true)
  })

  it('rejects a date the pages do not contain', () => {
    expect(dateGrounded('2026-11-03', 'Go 1.25 released on 14 October 2026')).toBe(false)
    expect(dateGrounded('', 'anything')).toBe(false)
    expect(dateGrounded('not a date', 'something else')).toBe(false)
  })

  it('an invented date on a real claim no longer lets the same date pass in the article', () => {
    const evidence = {
      facts: [{ claim: 'Go 1.25 adds a new garbage collector', date: '2026-11-03', source_url: 'https://go.dev' }],
      sourceTitle: 'Go 1.25 released', sourceSummary: 'The release adds a new garbage collector.',
    }
    expect(signalEvidenceText(evidence)).not.toContain('2026-11-03')
    const fc = verifySignalDraft({ title: 'Go 1.25 is out', excerpt: 'It shipped on 3 November 2026.', body: '<p>Go 1.25 adds a new garbage collector.</p>' }, evidence)
    expect(fc.ok).toBe(false)
    expect(fc.numbers.join(' ')).toMatch(/2026|3/)
  })

  it('a date the pages back still counts', () => {
    const evidence = {
      facts: [{ claim: 'Go 1.25 adds a new garbage collector', date: '2026-10-14', source_url: 'https://go.dev' }],
      sourceTitle: 'Go 1.25 released', sourceSummary: 'The release on 14 October 2026 adds a new garbage collector.',
    }
    expect(signalEvidenceText(evidence)).toContain('14 October 2026')
  })
})
