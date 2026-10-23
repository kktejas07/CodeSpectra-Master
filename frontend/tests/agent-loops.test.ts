/**
 * Wave 15 agent loops (lib/agent-loops): schedule windows, settings + AI caps,
 * content QA checks, SEO gap finding, community moderator verdicts,
 * analytics insight rules and the daily social pack picks / posting times.
 */
import { describe, expect, it } from 'vitest'
import { AGENT_LOOPS, loopDef, loopWindow } from '@/lib/agent-loops/registry'
import { defaultLoopSettings, loopAiBlocked, mergeLoopSettings, LoopSettingsPatchSchema } from '@/lib/agent-loops/settings'
import { datesInText, extractLinks, lowEngagement, outdatedReason, rotatingBatch, staleNewsReason } from '@/lib/agent-loops/pure/content-qa'
import { clusterQueries, coverageScore, findGaps, guessCategory, normalizeQuery, parseSearchConsoleCsv, queryLocale, queryTokens, topicTitleFromQuery } from '@/lib/agent-loops/pure/seo-gap'
import { classifyPost, reportReasonFor, unansweredQuestions } from '@/lib/agent-loops/pure/community-mod'
import { funnelNotes, jobNotes, kpiNotes, rankNotes, spendNotes, workflowNotes } from '@/lib/agent-loops/pure/analytics-insight'
import { cardSizeFor, packDay, pickPack, scorePackItem, suggestTimes } from '@/lib/agent-loops/pure/social-pack'
import { SOCIAL_PLATFORMS } from '@/lib/social/types'

const NOW = new Date('2026-10-23T10:00:00.000Z') // Friday

describe('loop registry + schedule windows', () => {
  it('defaults: read-only loops on, people-facing / spending loops off', () => {
    expect(defaultLoopSettings('content-qa').enabled).toBe(true)
    expect(defaultLoopSettings('seo-gap').enabled).toBe(true)
    expect(defaultLoopSettings('analytics-insight').enabled).toBe(true)
    expect(defaultLoopSettings('analytics-insight').notify).toBe(false)
    expect(defaultLoopSettings('community-mod').enabled).toBe(false)
    expect(defaultLoopSettings('community-mod').auto_hide).toBe(false)
    expect(defaultLoopSettings('social-pack').enabled).toBe(false)
    for (const l of AGENT_LOOPS) expect(l.heartbeat).toBe(`agent-loop:${l.id}`)
  })
  it('every30 windows change each half hour', () => {
    const a = loopWindow(loopDef('community-mod'), { run_hour_utc: 0, weekday: 0 }, new Date('2026-10-23T10:05:00Z'))
    const b = loopWindow(loopDef('community-mod'), { run_hour_utc: 0, weekday: 0 }, new Date('2026-10-23T10:29:00Z'))
    const c = loopWindow(loopDef('community-mod'), { run_hour_utc: 0, weekday: 0 }, new Date('2026-10-23T10:31:00Z'))
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })
  it('daily loops are due from their hour, once per day', () => {
    const def = loopDef('social-pack')
    expect(loopWindow(def, { run_hour_utc: 11, weekday: 0 }, NOW)).toBeNull()
    expect(loopWindow(def, { run_hour_utc: 3, weekday: 0 }, NOW)).toBe('d2026-10-23')
  })
  it('weekly loops run on their weekday and catch up later in the same ISO week', () => {
    const def = loopDef('analytics-insight')
    // Monday 03:00 target; Friday is later in the week → due, same window all week.
    expect(loopWindow(def, { run_hour_utc: 3, weekday: 1 }, NOW)).toBe('w2026-W43')
    expect(loopWindow(def, { run_hour_utc: 3, weekday: 1 }, new Date('2026-10-19T02:00:00Z'))).toBeNull()
    expect(loopWindow(def, { run_hour_utc: 3, weekday: 1 }, new Date('2026-10-19T03:00:00Z'))).toBe('w2026-W43')
    // Sunday is the last day of an ISO week.
    expect(loopWindow(def, { run_hour_utc: 2, weekday: 0 }, NOW)).toBeNull()
    expect(loopWindow(def, { run_hour_utc: 2, weekday: 0 }, new Date('2026-10-25T02:30:00Z'))).toBe('w2026-W43')
  })
})

describe('loop settings + AI caps', () => {
  it('merges stored values and ignores invalid ones', () => {
    const s = mergeLoopSettings('social-pack', { enabled: true, daily_ai_cap: 4, langs: ['en', 'en', 'te'] })
    expect(s.enabled).toBe(true)
    expect(s.daily_ai_cap).toBe(4)
    expect(s.langs).toEqual(['en', 'te'])
    expect(mergeLoopSettings('social-pack', { daily_ai_cap: -1 }).daily_ai_cap).toBe(defaultLoopSettings('social-pack').daily_ai_cap)
    expect(LoopSettingsPatchSchema.safeParse({ nope: 1 }).success).toBe(false)
  })
  it('blocks AI when off, over the monthly cap or the daily cap', () => {
    const s = { use_ai: true, daily_ai_cap: 3, monthly_cost_cap_usd: 1 }
    expect(loopAiBlocked({ ...s, use_ai: false }, 0, 0)).toBe('off')
    expect(loopAiBlocked(s, 0, 1)).toBe('monthly_cap')
    expect(loopAiBlocked(s, 3, 0)).toBe('daily_cap')
    expect(loopAiBlocked(s, 2, 0.5)).toBeNull()
  })
})

describe('content QA checks', () => {
  it('extracts external links outside code', () => {
    const md = 'See [docs](https://docs.python.org/3/). Also https://example.com/a, and `https://in.code` plus\n```\nhttps://block.example\n```'
    expect(extractLinks(md)).toEqual(['https://docs.python.org/3/', 'https://example.com/a'])
  })
  it('reads dates in several formats', () => {
    expect(datesInText('Register by 2026-03-01 or 5 March 2026, closes Mar 9, 2026').map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-03-01', '2026-03-05', '2026-03-09'])
  })
  it('flags news about a passed deadline, not evergreen or recent news', () => {
    expect(staleNewsReason({ title: 'Registrations close on 12 August 2026 for the AI challenge', published_at: '2026-08-01T00:00:00Z' }, NOW)).toEqual({ stale: true, last_date: '2026-08-12' })
    expect(staleNewsReason({ title: 'Python 3.14 released on 7 October 2025', published_at: '2025-10-08T00:00:00Z' }, NOW).stale).toBe(false)
    expect(staleNewsReason({ title: 'Deadline 30 October 2026', published_at: '2026-08-01T00:00:00Z' }, NOW).stale).toBe(false)
    expect(staleNewsReason({ title: 'Deadline 1 October 2026', published_at: '2026-10-10T00:00:00Z' }, NOW).stale).toBe(false)
  })
  it('flags Learn posts not touched for a year that mention old years', () => {
    expect(outdatedReason({ body: 'As of 2021 the latest version is 2.0', updated_at: '2025-01-01T00:00:00Z' }, NOW)).toMatchObject({ outdated: true, year: 2021 })
    expect(outdatedReason({ body: 'Year 2021 is old', updated_at: '2026-06-01T00:00:00Z' }, NOW).outdated).toBe(false)
    expect(outdatedReason({ body: '```\nprint(2019)\n```', updated_at: '2024-01-01T00:00:00Z' }, NOW).outdated).toBe(false)
  })
  it('low engagement needs age and few views', () => {
    expect(lowEngagement({ published_at: '2026-06-01T00:00:00Z', stats: { views: 3 } }, NOW)).toBe(true)
    expect(lowEngagement({ published_at: '2026-10-01T00:00:00Z', stats: { views: 3 } }, NOW)).toBe(false)
    expect(lowEngagement({ published_at: '2026-06-01T00:00:00Z', stats: { views: 300 } }, NOW)).toBe(false)
  })
  it('rotating batches wrap round', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
    const first = rotatingBatch(items, null, 3)
    expect(first.batch.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    const second = rotatingBatch(items, first.cursor, 3)
    expect(second.batch.map((x) => x.id)).toEqual(['d', 'a', 'b'])
    expect(rotatingBatch([], 'x', 3).batch).toEqual([])
  })
})

describe('SEO / content gaps', () => {
  it('normalises queries and drops personal data', () => {
    expect(normalizeQuery('  What is BINARY Search?? ')).toBe('what is binary search')
    expect(normalizeQuery('call me 98765 43210 about java')).toBe('call me about java')
    expect(normalizeQuery('mail asha@example.com resume tips')).toBe('mail resume tips')
    expect(normalizeQuery('12')).toBeNull()
    expect(normalizeQuery('c++ pointers')).toBe('c++ pointers')
  })
  it('detects the query language', () => {
    expect(queryLocale('बाइनरी सर्च क्या है')).toBe('hi')
    expect(queryLocale('బైనరీ సెర్చ్')).toBe('te')
    expect(queryLocale('binary search')).toBe('en')
  })
  it('scores coverage and guesses categories / titles', () => {
    expect(coverageScore(queryTokens('binary search tree'), { id: 't', title: 'Binary search trees' })).toBe(1)
    expect(coverageScore(queryTokens('kafka consumer groups'), { id: 't', title: 'Binary search' })).toBe(0)
    expect(guessCategory('kubernetes pods explained')).toBe('cloud')
    expect(guessCategory('sql joins')).toBe('databases')
    expect(topicTitleFromQuery('what is kafka consumer group?')).toBe('Kafka consumer group')
  })
  it('clusters near-duplicate queries', () => {
    const c = clusterQueries([
      { key: '1', q: 'kafka consumer groups', count: 5, locale: 'en' },
      { key: '2', q: 'kafka consumer group', count: 2, locale: 'en' },
      { key: '3', q: 'docker volumes', count: 3, locale: 'en' },
    ])
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ count: 7, lead: { key: '1' } })
  })
  it('finds new topics and missing translations, skips covered queries', () => {
    const gaps = findGaps([
      { key: 'k1', q: 'kafka consumer groups', count: 6, locale: 'en' },
      { key: 'k2', q: 'binary search', count: 9, locale: 'en' },
      { key: 'k3', q: 'binary search हिंदी में', count: 4, locale: 'hi' },
      { key: 'k4', q: 'rare thing', count: 1, locale: 'en' },
    ], {
      topics: [{ id: 't1', title: 'Binary search' }],
      posts: [{ id: 'p1', title: 'Binary search', locales: ['en'] }],
    })
    expect(gaps.map((g) => g.kind)).toEqual(['new_topic', 'translate'])
    expect(gaps[0]).toMatchObject({ kind: 'new_topic', title: 'Kafka consumer groups', category: 'system-design' })
    expect(gaps[1]).toMatchObject({ kind: 'translate', post_id: 'p1', locale: 'hi' })
  })
  it('parses a Search Console export', () => {
    const rows = parseSearchConsoleCsv('Top queries,Clicks,Impressions,CTR,Position\n"dsa, roadmap",3,"1,200",0.2%,4.1\nleetcode patterns,1,40,2%,9\n')
    expect(rows).toEqual([{ q: 'dsa, roadmap', impressions: 1200 }, { q: 'leetcode patterns', impressions: 40 }])
    expect(parseSearchConsoleCsv('Page,Clicks\n/a,1')).toEqual([])
  })
})

describe('community moderator verdicts', () => {
  const base = { spam: [] as never[], duplicates: 1, links: 0, accountAgeDays: 100, injection: [] as string[], profanityHits: 0 }
  it('hides only clear spam', () => {
    expect(classifyPost({ ...base, duplicates: 3, links: 1 }).verdict).toBe('clear_spam')
    expect(classifyPost({ ...base, spam: ['link_heavy'], links: 4, accountAgeDays: 1 })).toEqual({ verdict: 'clear_spam', reasons: ['new_account_links'] })
    expect(classifyPost({ ...base, spam: ['link_heavy'], links: 4 }).verdict).toBe('review')
  })
  it('reports injection, profanity and duplicates for a person to look at', () => {
    expect(classifyPost({ ...base, injection: ['role:chat-marker'] })).toEqual({ verdict: 'review', reasons: ['prompt_injection'] })
    expect(classifyPost({ ...base, profanityHits: 1 }).reasons).toContain('profanity')
    expect(classifyPost({ ...base, duplicates: 2 }).reasons).toContain('duplicate')
    expect(classifyPost(base).verdict).toBe('ok')
    expect(reportReasonFor(['profanity'])).toBe('abuse')
    expect(reportReasonFor(['duplicate'])).toBe('spam')
    expect(reportReasonFor(['prompt_injection'])).toBe('other')
  })
  it('picks unanswered questions in the age window, oldest first', () => {
    const t = (id: string, h: number, extra = {}) => ({ id, kind: 'question', status: 'visible', reply_count: 0, accepted_reply_id: null, created_at: new Date(NOW.getTime() - h * 3_600_000).toISOString(), ...extra })
    const out = unansweredQuestions([t('new', 2), t('a', 10), t('b', 30), t('old', 24 * 9), t('answered', 10, { reply_count: 1 }), t('disc', 10, { kind: 'discussion' })], NOW)
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('analytics insight rules', () => {
  it('KPI drops, rises and rate drops', () => {
    const notes = kpiNotes([
      { key: 'signups', label: 'Sign-ups', value: 40, previous: 100, change: -60, unit: 'count' },
      { key: 'visitors', label: 'Visitors', value: 300, previous: 100, change: 200, unit: 'count' },
      { key: 'small', label: 'Small', value: 1, previous: 5, change: -80, unit: 'count' },
      { key: 'activation', label: 'Activation rate', value: 20, previous: 30, unit: 'percent' },
    ])
    expect(notes.map((n) => [n.kind, n.severity])).toEqual([['kpi_drop', 'critical'], ['kpi_rise', 'info'], ['rate_drop', 'warning']])
  })
  it('funnel step conversion drops', () => {
    const f = (conv: number) => [{ name: 'hiring', label: 'Hiring', steps: [{ label: 'Applied', count: 100, step_conversion: null }, { label: 'Screened', count: conv, step_conversion: conv }] }]
    expect(funnelNotes(f(30), f(50))).toHaveLength(1)
    expect(funnelNotes(f(45), f(50))).toHaveLength(0)
  })
  it('AI spend spikes, feature spikes, failures and copilot drops', () => {
    const cur = { totals: { requests: 100, failed: 15, cost_usd: 6 }, by_feature: [{ key: 'learn', requests: 10, cost_usd: 3 }], copilot_questions: 10 }
    const prev = { totals: { requests: 100, failed: 0, cost_usd: 2 }, by_feature: [{ key: 'learn', requests: 10, cost_usd: 1 }], copilot_questions: 40 }
    expect(spendNotes(cur, prev).map((n) => n.kind).sort()).toEqual(['ai_failures', 'ai_feature_spike', 'ai_spend_spike', 'copilot_drop'])
    expect(spendNotes(prev, prev)).toEqual([])
  })
  it('workflow failures and unhealthy required jobs', () => {
    expect(workflowNotes({ failed: 5, workflows: 2 }, 1)).toHaveLength(1)
    expect(workflowNotes({ failed: 5, workflows: 2 }, 6)).toHaveLength(0)
    expect(jobNotes([{ id: 'a', label: 'A', state: 'failing' }, { id: 'b', label: 'B', state: 'stale', optional: true }, { id: 'c', label: 'C', state: 'ok' }]).map((n) => n.key)).toEqual(['job:a'])
  })
  it('ranks critical first and caps the list', () => {
    const notes = [...jobNotes([{ id: 'a', label: 'A', state: 'failing' }]), ...workflowNotes({ failed: 5, workflows: 1 }, 0), ...kpiNotes([{ key: 'v', label: 'V', value: 300, previous: 100, change: 200 }])]
    expect(rankNotes(notes, 2).map((n) => n.severity)).toEqual(['critical', 'warning'])
  })
})

describe('daily social pack', () => {
  type Cand = Parameters<typeof scorePackItem>[0]
  const item = (id: string, type: string, hoursAgo: number, extra = {}): Cand => ({
    id, type, title: id, published_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), facts: {}, image_own: false, posted_count: 0, ...extra,
  }) as Cand
  it('skips posted, old, closed and digest items', () => {
    expect(scorePackItem(item('a', 'news', 2, { posted_count: 1 }), NOW)).toBeNull()
    expect(scorePackItem(item('b', 'news', 24 * 8), NOW)).toBeNull()
    expect(scorePackItem(item('c', 'contest', 2, { facts: { deadline: '2026-10-20T00:00:00Z' } }), NOW)).toBeNull()
    expect(scorePackItem(item('d', 'digest', 2), NOW)).toBeNull()
    expect(scorePackItem(item('e', 'hackathon', 2, { facts: { deadline: '2026-10-25T00:00:00Z' } }), NOW)?.reasons).toContain('soon')
  })
  it('picks the best items with one per type and skips recently packed', () => {
    const picks = pickPack([item('n1', 'news', 1), item('n2', 'news', 2), item('h1', 'hackathon', 5), item('l1', 'learn', 3)], 3, NOW, new Set(['l1']))
    expect(picks.map((p) => p.id)).toEqual(['h1', 'n1'])
  })
  it('suggests distinct India-time slots per item and network', () => {
    const day = packDay(NOW)
    expect(day).toBe('2026-10-23')
    const a = suggestTimes(day, 0, SOCIAL_PLATFORMS)
    const b = suggestTimes(day, 1, SOCIAL_PLATFORMS)
    expect(a.linkedin).toBe('2026-10-23T03:30:00.000Z') // 09:00 IST
    for (const p of SOCIAL_PLATFORMS) expect(a[p]).not.toBe(b[p])
    expect(suggestTimes(day, 3, ['x']).x).not.toBe(a.x)
    expect(packDay(new Date('2026-10-23T20:00:00Z'))).toBe('2026-10-24')
  })
  it('card size per network', () => {
    expect(cardSizeFor('instagram')).toBe('square')
    expect(cardSizeFor('whatsapp')).toBe('story')
    expect(cardSizeFor('linkedin')).toBe('landscape')
  })
})
