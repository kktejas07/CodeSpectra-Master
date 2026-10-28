import { describe, expect, it } from 'vitest'
import { checkFacts, unsupportedClaims, unsupportedNames } from '@/lib/ai/fact-check'
import { articleText, verifySignalDraft } from '@/lib/signals/verify'
import { shouldAutoPublish } from '@/lib/signals/settings'
import { summaryIssues } from '@/lib/digest/verify'
import { withPlatformHardStop, budgetState, PLATFORM_HARD_STOP_REASON } from '@/lib/agent/budget'
import { learnerInScope } from '@/lib/agent/tools/study-plan-shared'
import { promptRunComplete, runSlotClaimFilter } from '@/lib/contests/scoring/prompt'

describe('fact check (AGT-031 / AGT-034)', () => {
  const facts = 'title: Smart India Hackathon 2026\norganiser: AICTE\nprizes: ₹1,00,000\nmode: online'
  it('passes text that only repeats the facts', () => {
    expect(checkFacts('Smart India Hackathon 2026 by AICTE is online. Win ₹1,00,000.', facts).ok).toBe(true)
  })
  it('flags invented organisations and names mid-sentence', () => {
    expect(unsupportedNames('The hackathon is backed by Google Cloud this year.', facts)).toEqual(['Google Cloud'])
    expect(unsupportedNames('Teams from IIT Bombay compete.', facts)).toEqual(['IIT Bombay'])
  })
  it('does not flag ordinary sentence starters but does flag acronyms there', () => {
    expect(unsupportedNames('Hurry. Register before it closes.', facts)).toEqual([])
    expect(unsupportedNames('AWS credits for all.', facts)).toEqual(['AWS'])
  })
  it('flags unbacked claims', () => {
    expect(unsupportedClaims('Google sponsors this beginner-friendly event.', facts)).toEqual(['sponsored', 'beginner friendly'])
    expect(unsupportedClaims('Fully remote.', facts)).toEqual([])
    expect(unsupportedClaims('Winners get a certificate.', facts)).toEqual(['certificate'])
  })
  it('flags invented numbers', () => {
    expect(checkFacts('Over 5000 teams join.', facts).numbers).toEqual(['5000'])
  })
})

describe('news fact verifier (AGT-031)', () => {
  const evidence = { facts: [{ claim: 'Go 1.25 adds a new garbage collector', source_url: 'https://go.dev', date: '2026-08-12' }], sourceTitle: 'Go 1.25 is released', sourceSummary: 'The Go team released Go 1.25.' }
  it('a faithful rewrite passes and may auto-publish', () => {
    const fc = verifySignalDraft({ title: 'Go 1.25 is out', excerpt: 'A new garbage collector.', body: '<h2>What changed</h2><p>Go 1.25 adds a new garbage collector.</p>' }, evidence)
    expect(fc.ok).toBe(true)
    expect(shouldAutoPublish({ trusted: true, autoPublishTrusted: true, aiRewritten: true, flagged: false, factsVerified: fc.ok })).toBe(true)
  })
  it('a hallucinated figure, name or claim sends the draft to review', () => {
    const fc = verifySignalDraft({ title: 'Go 1.25 is out', excerpt: 'Google says it is 40% faster.', body: '<p>Built with Microsoft, and guaranteed to be stable.</p>' }, evidence)
    expect(fc.ok).toBe(false)
    expect(fc.numbers).toContain('40')
    expect(fc.names).toContain('Microsoft')
    expect(fc.claims).toContain('guaranteed')
    expect(shouldAutoPublish({ trusted: true, autoPublishTrusted: true, aiRewritten: true, flagged: false, factsVerified: fc.ok })).toBe(false)
    expect(shouldAutoPublish({ trusted: true, autoPublishTrusted: true, aiRewritten: true, flagged: false })).toBe(false)
  })
  it('Title Case headings are not read as invented names', () => {
    expect(verifySignalDraft({ title: 'Go 1.25 Brings A Faster Collector', excerpt: 'A new garbage collector.', body: '<h2>What Changed In Go 1.25</h2><p>Go 1.25 adds a new garbage collector.</p>' }, evidence).ok).toBe(true)
    expect(verifySignalDraft({ title: 'Go 1.26 Is Here', excerpt: 'x', body: '<p>y</p>' }, evidence).numbers).toEqual(['126'])
  })
  it('article text keeps block boundaries and drops the source link label', () => {
    expect(articleText('<h2>One</h2><p>Two <a href="https://x.example">Source</a></p>')).toBe('One\nTwo')
  })
})

describe('digest summary names (AGT-034)', () => {
  const item = { key: 'k', group: 'events', category: 'hackathon', title: 'HackWave 2026', summary: 'A 24 hour hackathon.', topic: null, starts_at: null, ends_at: null, deadline: null, prize_text: null, mode: 'online', city: null, country: null, organiser: 'SNIST', level: null, source_name: 'Devpost', url: 'https://x.example', published_at: '2026-10-01T00:00:00Z' } as never
  it('flags an invented sponsor', () => {
    expect(summaryIssues({ text: 'HackWave 2026 is a 24 hour online hackathon by SNIST.' } as never, item)).toEqual([])
    expect(summaryIssues({ text: 'HackWave 2026, sponsored by Google, runs online.' } as never, item)).toContain('invented_facts')
  })
})

describe('copilot budget + scope (AGT-028 / AGT-032)', () => {
  it('the platform hard stop blocks the copilot', () => {
    const s = budgetState({ day: 0, month: 0 }, { daily: 100, monthly: 1000 })
    expect(withPlatformHardStop(s, false)).toBe(s)
    expect(withPlatformHardStop(s, true)).toMatchObject({ ok: false, remaining: 0, reason: PLATFORM_HARD_STOP_REASON })
  })
  it('a scoped superadmin only sees its organisation (plus individual learners)', () => {
    expect(learnerInScope({ role: 'superadmin', tenantId: null }, 'b')).toBe(true)
    expect(learnerInScope({ role: 'superadmin', tenantId: 'a' }, 'b')).toBe(false)
    expect(learnerInScope({ role: 'superadmin', tenantId: 'a' }, 'a')).toBe(true)
    expect(learnerInScope({ role: 'superadmin', tenantId: 'a' }, null)).toBe(true)
    expect(learnerInScope({ role: 'tenant_admin', tenantId: 'a' }, null)).toBe(false)
    expect(learnerInScope({ role: 'tenant_admin', tenantId: null }, null)).toBe(false)
  })
})

describe('prompt-a-thon runs (AGT-029 / AGT-030)', () => {
  it('only a run where every case answered is scored', () => {
    expect(promptRunComplete(0, 10)).toBe(true)
    expect(promptRunComplete(3, 10)).toBe(false)
    expect(promptRunComplete(0, 0)).toBe(false)
  })
  it('the claim filter enforces the cap and one run in flight', () => {
    expect(runSlotClaimFilter('c:u', 5, '2026-01-01T00:00:00Z')).toEqual({ id: 'c:u', runs: { $lt: 5 }, $or: [{ busy_since: null }, { busy_since: { $lt: '2026-01-01T00:00:00Z' } }] })
  })
})
