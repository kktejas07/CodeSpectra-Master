/**
 * Daily digest (lib/digest): candidate view, ranking + quotas, verifier rules,
 * the curator/verifier loop (termination, replacement, fallback), schedule
 * idempotency per date, templates per locale, RAG sources.
 */
import { describe, expect, it, vi } from 'vitest'
import { toCandidate, newsTopicFromTags, regionOf, type PoolRow } from '@/lib/digest/candidates'
import { isNearDuplicate, isOpen, scoreAll, scoreCandidate, selectDigest } from '@/lib/digest/rank'
import { DEFAULT_DIGEST_SETTINGS, DigestSettingsPatchSchema, digestAiBlocked, mergeDigestSettings } from '@/lib/digest/settings'
import { linkBroken, linkCheckerUnavailable, summaryIssues, verifyItem, type VerifyEvidence } from '@/lib/digest/verify'
import { DIGEST_AGENTS, MAX_ITERATIONS, assertAgentTool, fallbackDigestItems, runCuratorLoop, type LoopTools } from '@/lib/digest/loop'
import { digestDue, localDay } from '@/lib/digest/schedule'
import { DEFAULT_TEMPLATES, digestEmailHtml, digestWhatsAppText, mergeTemplates, renderDigest, templateSummary } from '@/lib/digest/templates'
import { parseAiSummaries } from '@/lib/digest/prompt'
import { digestSource, newsPostSource } from '@/lib/rag/sources/digest'
import { KNOWLEDGE_SOURCE_TYPES } from '@/lib/rag/types'
import type { DigestCandidate, ScoredCandidate } from '@/lib/digest/types'

const NOW = new Date('2026-10-23T03:00:00.000Z') // 08:30 IST
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

let seq = 0
function cand(over: Partial<DigestCandidate> = {}): DigestCandidate {
  seq++
  return {
    key: `event:e${seq}`, source_type: 'event', ref_id: `e${seq}`, category: 'hackathon', group: 'events', topic: null,
    title: `Unique event title number ${seq} alpha${seq}`, summary: 'A weekend online hackathon.', url: `https://codespectra.ai/events/e${seq}`, source_url: `https://org.example/e${seq}`,
    source: `src${seq}`, source_name: 'Devpost', trust: 0.8, region: 'global', country: null, city: null, mode: 'online',
    starts_at: day(10), ends_at: day(12), deadline: day(5), prize_text: null, prize_usd_minor: null, organiser: null, level: null,
    published_at: day(-0.5), languages: ['en'], engagement: { views: 0, saves: 0, clicks: 0 }, student_friendly: false, third_party: true,
    ...over,
  }
}
const news = (over: Partial<DigestCandidate> = {}) => cand({ key: `news:n${seq + 1}`, source_type: 'news', category: 'news', group: 'news', starts_at: null, ends_at: null, deadline: null, topic: 'ai', source_url: null, ...over })
const learn = (over: Partial<DigestCandidate> = {}) => cand({ key: `learn:l${seq + 1}`, source_type: 'learn', category: 'learn', group: 'learn', starts_at: null, ends_at: null, deadline: null, source: 'learn', trust: 1, source_url: null, third_party: false, ...over })
const contest = (over: Partial<DigestCandidate> = {}) => cand({ key: `contest:c${seq + 1}`, source_type: 'contest', category: 'contest', group: 'contests', source: 'codespectra', trust: 1, source_url: null, third_party: false, ...over })

describe('candidate view (aggregator)', () => {
  const row = (over: Partial<PoolRow> = {}): PoolRow => ({ key: 'event:ef1', type: 'event', ref_id: 'ef1', title: 'Global Climate Hack', summary: 'Build climate tools.', url: 'https://codespectra.ai/events/ef1', source: 'devpost', facts: { starts_at: day(10), deadline: day(4), prize: '$10,000', mode: 'online', tags: ['climate'] }, published_at: day(-1), ...over })

  it('normalises category, region, mode, deadline, prize and trust', () => {
    const c = toCandidate(row(), { feed: { kind: 'ctf', url: 'https://ctftime.org/x', country: 'IN', city: 'Hyderabad', mode: 'in_person', source: 'ctftime', prize_usd_minor: 1_000_000, status: 'published', themes: ['security'] } }, NOW)!
    expect(c).toMatchObject({ category: 'ctf', group: 'events', region: 'india', mode: 'in_person', prize_text: '$10,000', prize_usd_minor: 1_000_000, source_url: 'https://ctftime.org/x', topic: 'security' })
    expect(c.trust).toBeCloseTo(0.85)
    expect(toCandidate(row(), { feed: { kind: 'datathon' } }, NOW)!.category).toBe('datathon')
    expect(toCandidate(row(), { feed: { kind: 'conference' } }, NOW)!.category).toBe('conference')
  })

  it('maps news topics + trusted feeds, Learn translations, platform items; drops roundups and unpublished rows', () => {
    const n = toCandidate(row({ key: 'news:p1', type: 'news', ref_id: 'p1', source: 'news', facts: {} }), { news: { tags: ['signals', 'aws-news', 'news:cloud'], source_urls: ['https://aws.amazon.com/blogs/x'] } }, NOW)!
    expect(n).toMatchObject({ category: 'news', group: 'news', topic: 'cloud', source_name: 'AWS News Blog', trust: 0.9, source_url: 'https://aws.amazon.com/blogs/x' })
    expect(newsTopicFromTags(['signals', 'hn-frontpage'])).toBe('industry')
    const l = toCandidate(row({ key: 'learn:l1', type: 'learn', ref_id: 'l1', source: 'learn', facts: { level: 'beginner' } }), { learn: { category: 'dsa', locales: ['hi', 'te'] } }, NOW)!
    expect(l).toMatchObject({ category: 'learn', topic: 'dsa', languages: ['en', 'hi', 'te'], trust: 1 })
    expect(toCandidate(row({ type: 'certification', key: 'certification:x' }), {}, NOW)!.category).toBe('platform')
    expect(toCandidate(row({ type: 'roundup', key: 'roundup:w' }), {}, NOW)).toBeNull()
    expect(toCandidate(row(), { feed: { status: 'hidden' } }, NOW)).toBeNull()
    expect(regionOf(null, 'Bengaluru', 'in_person')).toBe('india')
    expect(regionOf('US', 'Austin', 'in_person')).toBe('other')
  })
})

describe('ranking + quotas', () => {
  const w = DEFAULT_DIGEST_SETTINGS.weights
  it('never ranks closed items; closing soon, prizes, fresh and trusted score higher', () => {
    expect(isOpen(cand({ deadline: day(-1) }), NOW)).toBe(false)
    expect(isOpen(cand({ deadline: null, ends_at: day(-0.1) }), NOW)).toBe(false)
    expect(scoreAll([cand({ deadline: day(-1) })], w, NOW)).toHaveLength(0)
    const soon = scoreCandidate(cand({ deadline: day(1) }), w, NOW).score
    const late = scoreCandidate(cand({ deadline: day(13) }), w, NOW).score
    expect(soon).toBeGreaterThan(late)
    expect(scoreCandidate(cand({ prize_usd_minor: 5_000_000 }), w, NOW).score).toBeGreaterThan(scoreCandidate(cand(), w, NOW).score)
    expect(scoreCandidate(cand({ published_at: day(-0.1) }), w, NOW).score).toBeGreaterThan(scoreCandidate(cand({ published_at: day(-6) }), w, NOW).score)
    expect(scoreCandidate(cand({ engagement: { views: 400, saves: 20, clicks: 5 } }), w, NOW).score).toBeGreaterThan(scoreCandidate(cand(), w, NOW).score)
    // A zero weight removes a factor entirely.
    const noPrize = { ...w, prize: 0 }
    expect(scoreCandidate(cand({ prize_usd_minor: 5_000_000 }), noPrize, NOW).score).toBeCloseTo(scoreCandidate(cand(), noPrize, NOW).score, 4)
  })

  it('default N = 25 with ~8 events / 7 news / 5 Learn / 5 contests, no near-duplicates, per-source cap', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => cand({ prize_usd_minor: 10_000_000 - i, category: i % 2 ? 'hackathon' : 'ctf' })),
      ...Array.from({ length: 12 }, () => news()),
      ...Array.from({ length: 8 }, () => learn()),
      ...Array.from({ length: 8 }, () => contest({ source: `c${seq}` })),
    ]
    const s = { ...DEFAULT_DIGEST_SETTINGS, max_per_category: 10 }
    const sel = selectDigest(scoreAll(pool, s.weights, NOW), s)
    expect(sel.items).toHaveLength(25)
    const by = (g: string) => sel.items.filter((i) => i.group === g).length
    expect([by('events'), by('news'), by('learn'), by('contests')]).toEqual([8, 7, 5, 5])
    // Quiet day: an empty group's slots spill to the next best.
    const quiet = selectDigest(scoreAll(pool.filter((c) => c.group !== 'news'), s.weights, NOW), s)
    expect(quiet.items).toHaveLength(25)
    expect(quiet.spill).toBeGreaterThan(0)
    // Caps: max per category / source.
    const capped = selectDigest(scoreAll(Array.from({ length: 10 }, () => cand({ source: 'devpost' })), s.weights, NOW), { ...s, max_per_source: 3 })
    expect(capped.items).toHaveLength(3)
  })

  it('drops near-duplicates (same page, same source link, near-identical title within a day)', () => {
    const a = cand({ title: 'Smart India Hackathon 2026 Grand Finale' })
    const b = cand({ title: 'Smart India Hackathon 2026 – Grand Finale', starts_at: a.starts_at })
    expect(isNearDuplicate(a, b)).toBe(true)
    expect(isNearDuplicate(a, cand({ source_url: a.source_url }))).toBe(true)
    const sel = selectDigest(scoreAll([a, b], DEFAULT_DIGEST_SETTINGS.weights, NOW), DEFAULT_DIGEST_SETTINGS)
    expect(sel.items).toHaveLength(1)
    expect(sel.duplicates).toHaveLength(1)
  })

  it('settings: defaults, partial merge, validation', () => {
    expect(mergeDigestSettings(null)).toEqual(DEFAULT_DIGEST_SETTINGS)
    expect(mergeDigestSettings({ n: 10, quotas: { news: 2 }, weights: { prize: 0 } })).toMatchObject({ n: 10, quotas: { events: 8, news: 2, learn: 5, contests: 5 }, weights: { prize: 0, trust: 1 } })
    expect(DigestSettingsPatchSchema.safeParse({ publish_time: '25:00' }).success).toBe(false)
    expect(DigestSettingsPatchSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false)
    expect(digestAiBlocked(DEFAULT_DIGEST_SETTINGS, 0, 0)).toBeNull()
    expect(digestAiBlocked(DEFAULT_DIGEST_SETTINGS, 12, 0)).toBe('daily_cap')
    expect(digestAiBlocked(DEFAULT_DIGEST_SETTINGS, 0, 3)).toBe('monthly_cap')
  })
})

describe('verifier rules', () => {
  const ev = (over: Partial<VerifyEvidence> = {}): VerifyEvidence => ({ now: NOW, current: { title: 't', url: 'https://x', deadline: null, ends_at: null, starts_at: null, group: 'events', published_at: day(-1) }, verified: [], recentKeys: new Set(), maxAgeDays: 7, ...over })
  it('rejects closed deadlines (re-read from the source), gone items, broken links, duplicates, repeats, stale news, missing facts, flagged text', () => {
    const c = cand()
    expect(verifyItem(c, {}, ev()).ok).toBe(true)
    expect(verifyItem(c, {}, ev({ current: { ...ev().current!, deadline: day(-0.1) } })).reasons).toContain('closed')
    expect(verifyItem(c, {}, ev({ current: null })).reasons).toContain('gone')
    expect(verifyItem(c, {}, ev({ link: { ok: false, status: 404 } })).reasons).toContain('broken_link')
    expect(verifyItem(c, {}, ev({ link: { ok: false, status: 403 } })).ok).toBe(true)
    expect(verifyItem(c, {}, ev({ verified: [{ ...c, key: 'other' }] })).reasons).toContain('duplicate')
    expect(verifyItem(c, {}, ev({ recentKeys: new Set([c.key]) })).reasons).toContain('repeat')
    expect(verifyItem(cand({ deadline: day(1) }), {}, ev({ recentKeys: new Set([`event:e${seq}`]) })).ok).toBe(true) // closing-soon reminder may repeat
    expect(verifyItem(news({ published_at: day(-9) }), {}, ev()).reasons).toContain('stale')
    expect(verifyItem(cand({ starts_at: null, ends_at: null, deadline: null }), {}, ev({ current: { ...ev().current!, starts_at: null } })).reasons).toContain('missing_facts')
    expect(verifyItem(c, {}, ev({ flagged: true })).reasons).toContain('flagged')
  })

  it('flags summaries with invented numbers, URLs or too long text (any script)', () => {
    const c = cand({ prize_text: '$5,000', deadline: '2026-11-03T00:00:00.000Z' })
    expect(summaryIssues({ text: 'Prizes worth $5,000; register by 3 Nov 2026.', ai: true }, c)).toEqual([])
    expect(summaryIssues({ text: 'Prizes worth $50,000 for 300 teams.', ai: true }, c)).toContain('invented_facts')
    expect(summaryIssues({ text: '₹१०००० इनाम', ai: true }, c)).toContain('invented_facts')
    expect(summaryIssues({ text: 'See https://evil.example now', ai: true }, c)).toContain('has_url')
    expect(summaryIssues({ text: 'x'.repeat(400), ai: true }, c)).toContain('too_long')
    expect(verifyItem(c, { en: { text: 'Win 1,000,000 dollars', ai: true } }, ev()).summary_issues.en).toContain('invented_facts')
    expect(linkBroken({ ok: false })).toBe(true)
    expect(linkCheckerUnavailable([{ ok: false }, { ok: false }, { ok: false }])).toBe(true)
    expect(linkCheckerUnavailable([{ ok: false }, { ok: true, status: 200 }, { ok: false }])).toBe(false)
  })
})

describe('curator + verifier loop', () => {
  const settings = { ...DEFAULT_DIGEST_SETTINGS, max_per_category: 25, max_per_source: 25 }
  function tools(pool: DigestCandidate[], verdict: (c: ScoredCandidate) => string[], opts: { aiText?: (c: ScoredCandidate) => string } = {}) {
    const verified: string[] = []
    const t: LoopTools & { calls: string[] } = {
      calls: [],
      async list_candidates() { t.calls.push('list'); return pool },
      score_items(c) { return scoreAll(c, settings.weights, NOW) },
      async draft_summary(items, langs) {
        t.calls.push(`draft:${items.length}`)
        return { summaries: new Map(items.map((i) => [i.key, Object.fromEntries(langs.map((l) => [l, { text: opts.aiText ? opts.aiText(i) : `Summary for ${i.category}.`, ai: true }]))])), ai_calls: 1, fallback: null }
      },
      async verify_item(item, s) {
        const reasons = verdict(item)
        if (!reasons.length) verified.push(item.key)
        const sum = s.en ? summaryIssues(s.en, item) : []
        return { key: item.key, ok: !reasons.length, reasons: reasons as never, summary_issues: sum.length ? { en: sum } : {} }
      },
    }
    return t
  }

  it('replaces rejected picks from the next best and stops at N', async () => {
    const pool = Array.from({ length: 12 }, (_, i) => cand({ prize_usd_minor: 100_000 * (12 - i) }))
    const bad = new Set(pool.slice(0, 3).map((c) => c.key))
    const t = tools(pool, (c) => (bad.has(c.key) ? ['broken_link'] : []))
    const r = await runCuratorLoop(t, { settings, n: 5, langs: ['en', 'hi', 'te'] })
    expect(r.items).toHaveLength(5)
    expect(r.items.some((i) => bad.has(i.key))).toBe(false)
    expect(r.rejected.map((x) => x.key).sort()).toEqual([...bad].sort())
    expect(r.iterations).toBe(2)
    expect(r.items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5])
    // Every language has a summary (template where the model gave none).
    for (const i of r.items) expect(Object.keys(i.summaries).sort()).toEqual(['en', 'hi', 'te'])
    expect(r.trace.some((s) => s.agent === 'verifier' && s.tool === 'verify_item')).toBe(true)
  })

  it('terminates after 3 iterations even when the verifier keeps rejecting', async () => {
    const pool = Array.from({ length: 40 }, () => cand())
    const t = tools(pool, () => ['closed'])
    const r = await runCuratorLoop(t, { settings, n: 5, langs: ['en'] })
    expect(r.iterations).toBe(MAX_ITERATIONS)
    expect(r.items).toHaveLength(0)
    expect(t.calls.filter((c) => c.startsWith('draft')).length).toBe(3)
  })

  it('stops early when there is nothing left to pick, and fixes invented-fact summaries with the template', async () => {
    const pool = [cand({ prize_text: '$1,000' }), cand()]
    const t = tools(pool, () => [], { aiText: () => 'Prizes of $9,999,999 await.' })
    const r = await runCuratorLoop(t, { settings, n: 25, langs: ['en'] })
    expect(r.items).toHaveLength(2)
    expect(r.iterations).toBe(2)
    expect(r.summary_fixes).toBe(2)
    expect(r.items.every((i) => i.summaries.en?.ai === false)).toBe(true)
  })

  it('agents only use their own tools; the deterministic fallback needs no AI or network', () => {
    expect(() => assertAgentTool('verifier', 'publish_digest')).toThrow()
    expect(() => assertAgentTool('curator', 'draft_summary')).not.toThrow()
    expect(DIGEST_AGENTS.verifier.tools).toContain('verify_item')
    const items = fallbackDigestItems(scoreAll([cand(), news(), learn(), contest()], settings.weights, NOW), { settings, n: 25, langs: ['en', 'hi', 'te'] })
    expect(items).toHaveLength(4)
    expect(items.every((i) => Object.values(i.summaries).every((s) => s && !s.ai && s.text.length > 5))).toBe(true)
  })

  it('parses model output only for known keys and asked languages', () => {
    const m = parseAiSummaries({ items: [{ key: 'event:a', en: 'Online hackathon, register soon.', hi: 'ऑनलाइन hackathon, जल्दी रजिस्टर करें।', xx: 'nope' }, { key: 'event:zzz', en: 'ignored item text' }] }, [{ key: 'event:a' }], ['en', 'hi'])
    expect([...m.keys()]).toEqual(['event:a'])
    expect(Object.keys(m.get('event:a')!)).toEqual(['en', 'hi'])
    expect(parseAiSummaries('garbage', [{ key: 'event:a' }], ['en']).size).toBe(0)
  })
})

describe('schedule: one digest per date', () => {
  const s = { enabled: true, timezone: 'Asia/Kolkata', publish_time: '08:00', bootstrap: true }
  it('bootstraps at once when no digest exists, then runs daily from 08:00 IST', () => {
    const early = new Date('2026-10-23T01:00:00.000Z') // 06:30 IST
    expect(localDay(early, 'Asia/Kolkata')).toBe('2026-10-23')
    expect(digestDue(early, s, { total: 0, hasToday: false })).toEqual({ date: '2026-10-23', trigger: 'bootstrap' })
    expect(digestDue(early, s, { total: 3, hasToday: false })).toBeNull()
    expect(digestDue(NOW, s, { total: 3, hasToday: false })).toEqual({ date: '2026-10-23', trigger: 'schedule' })
    expect(digestDue(NOW, s, { total: 3, hasToday: true })).toBeNull()
    expect(digestDue(NOW, { ...s, enabled: false }, { total: 0, hasToday: false })).toBeNull()
    // 23:00 UTC is already the next day in India.
    expect(digestDue(new Date('2026-10-23T23:00:00.000Z'), s, { total: 3, hasToday: false })).toBeNull() // 04:30 IST on the 24th
    expect(digestDue(new Date('2026-10-24T02:31:00.000Z'), s, { total: 3, hasToday: false })).toEqual({ date: '2026-10-24', trigger: 'schedule' })
  })

  it('a scheduled run for a date that already has a digest is skipped', async () => {
    vi.resetModules()
    vi.doMock('@/lib/digest/store', () => ({
      getDigestConfig: async () => ({ settings: DEFAULT_DIGEST_SETTINGS, templates: DEFAULT_TEMPLATES, rawTemplates: {}, aiCallsToday: 0 }),
      getDigest: async (date: string) => ({ id: `dg_${date}`, date, status: 'published', items: [] }),
      runsCol: async () => ({ updateOne: async () => ({}), insertOne: async () => ({}) }),
      recentDigestKeys: async () => new Set(), digestsCol: async () => ({}), digestStats: async () => ({ total: 1, hasDate: true }),
    }))
    const { runDailyDigest } = await import('@/lib/digest/service')
    const r = await runDailyDigest({ trigger: 'schedule', now: NOW, date: '2026-10-23' })
    expect(r.status).toBe('skipped')
    vi.doUnmock('@/lib/digest/store')
  })
})

describe('templates per locale', () => {
  const doc = {
    date: '2026-10-23',
    items: [
      { ...cand({ prize_text: '$2,000', deadline: '2026-11-03T00:00:00.000Z', mode: 'online' }), rank: 1, score: 0.9, parts: {} as never, summaries: { en: { text: 'An online build weekend.', ai: true } } },
      { ...news({ title: 'AWS launches a new region' }), rank: 2, score: 0.8, parts: {} as never, summaries: {} },
    ],
  }
  it('renders sections, chips and summaries in en / hi / te; titles stay original', () => {
    const en = renderDigest(doc, 'en')
    expect(en.heading).toBe('Daily digest: 23 October 2026')
    expect(en.sections.map((s) => s.category)).toEqual(['hackathon', 'news'])
    expect(en.sections[0].items[0].summary).toBe('An online build weekend.')
    expect(en.sections[0].items[0].chips.map((c) => c.key)).toEqual(['starts', 'deadline', 'prize', 'mode', 'region'])
    const hi = renderDigest(doc, 'hi')
    expect(hi.heading.startsWith('डेली डाइजेस्ट')).toBe(true)
    expect(hi.sections[1].items[0].title).toBe('AWS launches a new region')
    expect(/[ऀ-ॿ]/.test(hi.sections[0].items[0].summary)).toBe(true) // template summary, not the English AI text
    const te = renderDigest(doc, 'te')
    expect(te.sections[1].heading).toBe(DEFAULT_TEMPLATES.te.sections.news)
    expect(/[ఀ-౿]/.test(te.sections[0].items[0].summary)).toBe(true)
    // Template summaries only use the item's own numbers.
    expect(summaryIssues({ text: templateSummary(doc.items[0], 'te'), ai: false }, doc.items[0])).toEqual([])
    expect(summaryIssues({ text: templateSummary(doc.items[0], 'en'), ai: false }, doc.items[0])).toEqual([])
  })

  it('admin template overrides apply per language with defaults for empty fields; email + WhatsApp carry links and STOP', () => {
    const tpl = mergeTemplates({ hi: { heading: 'आज की टॉप पिक्स {date}', sections: { news: 'खबरें' } }, en: { intro: '' } })
    expect(tpl.hi.heading).toBe('आज की टॉप पिक्स {date}')
    expect(tpl.hi.sections.news).toBe('खबरें')
    expect(tpl.hi.sections.hackathon).toBe(DEFAULT_TEMPLATES.hi.sections.hackathon)
    expect(tpl.en.intro).toBe(DEFAULT_TEMPLATES.en.intro)
    const r = renderDigest(doc, 'en')
    const html = digestEmailHtml(r, 'https://codespectra.ai')
    expect(html).toContain('utm_campaign=daily_digest')
    expect(html).not.toContain('<script')
    const wa = digestWhatsAppText(renderDigest(doc, 'te'), 'https://codespectra.ai')
    expect(wa).toContain('https://codespectra.ai/te/digest/2026-10-23')
    expect(wa).toContain('STOP')
  })
})

describe('RAG sources for news and digests', () => {
  it('lists the new public source types and loads only published rows', () => {
    expect(KNOWLEDGE_SOURCE_TYPES).toEqual(expect.arrayContaining(['news', 'digest', 'external_event', 'doc']))
    const n = newsPostSource({ id: 'p1', slug: 'aws-region', title: 'AWS region', status: 'published', tags: ['signals', 'news:cloud'], excerpt: 'New region.', body: '<p>Details <b>here</b></p>' })!
    expect(n).toMatchObject({ type: 'news', visibility: 'public', tenant_id: null, url: '/news/aws-region' })
    expect(n.text).toContain('Topic: cloud')
    expect(n.text).not.toContain('<b>')
    expect(newsPostSource({ id: 'p2', slug: 'x', title: 'x', status: 'draft', tags: ['signals'] })).toBeNull()
    expect(newsPostSource({ id: 'p3', slug: 'x', title: 'x', status: 'published', tags: ['engineering'] })).toBeNull()
    const d = digestSource({ id: 'dg_2026-10-23', date: '2026-10-23', status: 'published', items: [{ rank: 1, category: 'hackathon', title: 'Climate Hack', url: 'https://codespectra.ai/events/e1', deadline: day(3), summaries: { en: { text: 'Open now.' } } }] })!
    expect(d).toMatchObject({ type: 'digest', url: '/digest/2026-10-23', visibility: 'public' })
    expect(d.text).toContain('## Hackathons (2026-10-23)')
    expect(d.text).toContain('Link: /events/e1')
    expect(digestSource({ id: 'dg_2026-10-22', date: '2026-10-22', status: 'review', items: [{ title: 'x' }] })).toBeNull()
  })
})
