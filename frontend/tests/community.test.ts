/** Community rules (lib/community/pure.ts): moderation filters, mentions, reputation → XP, budgets. */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS, ThreadInputSchema, aiBudget, countLinks, filterProfanity, hotScore, isThreadId, linkLimitFor, mergeSettings,
  parseMentions, solutionVisible, spamSignals, voteRepDelta, xpForReputation,
} from '@/lib/community/pure'

describe('profanity filter', () => {
  it('masks whole words only, outside code', () => {
    const r = filterProfanity('This shit works. `shit` stays in code, and the class assignment is fine.')
    expect(r.hits).toBe(1)
    expect(r.text).toBe('This s*** works. `shit` stays in code, and the class assignment is fine.')
  })
  it('uses admin words and can be switched off', () => {
    expect(filterProfanity('such a bakwas answer', ['bakwas']).text).toBe('such a b***** answer')
    expect(filterProfanity('shit', [], false).hits).toBe(0)
  })
})

describe('links and spam', () => {
  it('counts links in prose, not in code', () => {
    expect(countLinks('see https://a.dev and www.example.com\n```\nhttps://in.code\n```')).toBe(2)
  })
  it('new accounts get the stricter link limit', () => {
    expect(linkLimitFor(DEFAULT_SETTINGS, 2)).toBe(0)
    expect(linkLimitFor(DEFAULT_SETTINGS, 30)).toBe(5)
  })
  it('flags shouting, repeated characters, duplicates and link dumps', () => {
    expect(spamSignals('WHY DOES MY CODE NOT WORK AT ALL PLEASE HELP ME NOW')).toContain('shouting')
    expect(spamSignals('heyyyyyyyyyyyyyyyyyyyy')).toContain('repeated_chars')
    expect(spamSignals('same', { hash: 'h1', recentHashes: ['h1'] })).toContain('duplicate')
    expect(spamSignals('https://a.io https://b.io https://c.io buy')).toContain('link_heavy')
    expect(spamSignals('How do I reverse a linked list in place?')).toEqual([])
  })
})

describe('mentions', () => {
  it('finds @handles in prose, lower-cased and unique', () => {
    expect(parseMentions('Thanks @AshaRao and @asharao! email me@x.com `@notme`')).toEqual(['asharao'])
  })
})

describe('reputation and XP', () => {
  it('vote changes move reputation both ways', () => {
    expect(voteRepDelta('reply', 0, 1)).toBe(10)
    expect(voteRepDelta('reply', 1, -1)).toBe(-12)
    expect(voteRepDelta('thread', 1, 0)).toBe(-5)
    expect(voteRepDelta('solution', 0, 1)).toBe(10)
  })
  it('only positive gains earn XP, within the daily cap', () => {
    expect(xpForReputation(15, DEFAULT_SETTINGS, 0)).toBe(15)
    expect(xpForReputation(15, DEFAULT_SETTINGS, 95)).toBe(5)
    expect(xpForReputation(-2, DEFAULT_SETTINGS, 0)).toBe(0)
    expect(xpForReputation(10, mergeSettings(DEFAULT_SETTINGS, { xp: { per_point: 0 } }), 0)).toBe(0)
  })
})

describe('AI moderation budget', () => {
  it('is off by default and capped per day and month', () => {
    expect(aiBudget(DEFAULT_SETTINGS, 0, 0)).toEqual({ ok: false, reason: 'off' })
    const on = mergeSettings(DEFAULT_SETTINGS, { ai: { enabled: true } })
    expect(aiBudget(on, 0, 0)).toEqual({ ok: true })
    expect(aiBudget(on, 200, 0)).toEqual({ ok: false, reason: 'daily_cap' })
    expect(aiBudget(on, 1, 5)).toEqual({ ok: false, reason: 'monthly_cap' })
  })
})

describe('threads', () => {
  it('solutions need a problem; titles and bodies are bounded and cleaned', () => {
    expect(ThreadInputSchema.safeParse({ category_id: 'general', kind: 'solution', title: 'My two-pointer approach', body: 'Here is how I did it' }).success).toBe(false)
    const ok = ThreadInputSchema.parse({ category_id: 'general', title: '  How to   start DSA?‮ ', body: 'I am new and want a plan.', tags: ['DSA', 'dsa', 'C++'] })
    expect(ok.title).toBe('How to start DSA?')
    expect(ok.tags).toEqual(['dsa', 'c++'])
  })
  it('solution write-ups show only to solvers, authors and moderators', () => {
    expect(solutionVisible({ isAuthor: false, isModerator: false, solved: false })).toBe(false)
    expect(solutionVisible({ isAuthor: false, isModerator: false, solved: true })).toBe(true)
    expect(solutionVisible({ isAuthor: true, isModerator: false, solved: false })).toBe(true)
  })
  it('thread ids are URL-safe for localized paths', () => {
    expect(isThreadId('t0123456789abcdef')).toBe(true)
    expect(isThreadId('T0123456789ABCDEF')).toBe(false)
  })
  it('hot ranking decays with age', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    const fresh = hotScore({ score: 2, reply_count: 1, last_activity_at: '2026-10-23T11:00:00Z' }, now)
    const old = hotScore({ score: 2, reply_count: 1, last_activity_at: '2026-10-20T11:00:00Z' }, now)
    expect(fresh).toBeGreaterThan(old)
  })
})
