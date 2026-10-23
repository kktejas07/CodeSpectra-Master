/**
 * Social studio (lib/social): caption rules per platform, UTM builder,
 * share-intent URLs, queue mappers + dedupe, caption fact guard, roundup
 * pick, weekly stats and AI caps.
 */
import { describe, expect, it } from 'vitest'
import { checkCaption, finalCaption, fitX, isoWeekKey, shareIntentUrl, socialLink, xWeightedLength } from '@/lib/social/share'
import { dedupeQueueInputs, fromContest, fromFeedEvent, fromLearnPost, fromNewsPost, pickRoundup, queueKey, queueMongoFilter, QueueFilterSchema, weeklyPostCounts } from '@/lib/social/queue'
import { asciiDigits, cleanCaptions, hashtagsForItem, templateCaptions, unsupportedNumbers } from '@/lib/social/captions'
import { aiBlocked, DEFAULT_SOCIAL_SETTINGS, mergeSocialSettings } from '@/lib/social/settings'
import { SOCIAL_PLATFORMS, type QueueInput, type SocialQueueDoc } from '@/lib/social/types'

const ORIGIN = 'https://codespectra.ai'
const NOW = new Date('2026-10-23T10:00:00.000Z')
const LINK = 'https://codespectra.ai/events/ef_0123456789abcdef'

describe('UTM builder', () => {
  it('adds source / medium / campaign and keeps other params', () => {
    const u = new URL(socialLink(`${LINK}?ref=x&utm_source=old`, 'linkedin', 'event'))
    expect(u.searchParams.get('utm_source')).toBe('linkedin')
    expect(u.searchParams.get('utm_medium')).toBe('social')
    expect(u.searchParams.get('utm_campaign')).toBe('event')
    expect(u.searchParams.get('ref')).toBe('x')
  })
  it('sanitises the campaign and leaves bad URLs alone', () => {
    expect(new URL(socialLink(LINK, 'x', 'Company Test!')).searchParams.get('utm_campaign')).toBe('companytest')
    expect(socialLink('not a url', 'x', 'news')).toBe('not a url')
  })
})

describe('share intents', () => {
  const body = 'Hackathon this weekend #CodeSpectra'
  const link = socialLink(LINK, 'x', 'event')
  it('uses the official share pages, prefilled', () => {
    expect(shareIntentUrl('linkedin', body, link)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`)
    expect(shareIntentUrl('facebook', body, link)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`)
    const x = new URL(shareIntentUrl('x', body, link))
    expect(x.origin + x.pathname).toBe('https://x.com/intent/tweet')
    expect(x.searchParams.get('text')).toBe(body)
    expect(x.searchParams.get('url')).toBe(link)
    const wa = new URL(shareIntentUrl('whatsapp', body, link))
    expect(wa.host).toBe('wa.me')
    expect(wa.searchParams.get('text')).toBe(`${body}\n\n${link}`)
    const tg = new URL(shareIntentUrl('telegram', body, link))
    expect(tg.origin + tg.pathname).toBe('https://t.me/share/url')
    expect(tg.searchParams.get('url')).toBe(link)
    expect(tg.searchParams.get('text')).toBe(body)
  })
  it('instagram: no link in the caption, "link in bio" instead', () => {
    expect(finalCaption('instagram', 'Hi', link, 'en')).toBe('Hi\n\nLink in bio.')
    expect(finalCaption('instagram', 'Hi', link, 'te')).not.toContain('http')
  })
})

describe('caption length rules', () => {
  it('X counts a link as 23, Latin / Indic letters 1, CJK and emoji 2', () => {
    expect(xWeightedLength('abc https://example.com/a/very/long/path?x=1')).toBe(4 + 23)
    expect(xWeightedLength('नमस्ते')).toBe([...'नमस्ते'].length)
    expect(xWeightedLength('日本🙂')).toBe(6)
  })
  it('X: body + link must fit 280', () => {
    expect(checkCaption('x', 'a'.repeat(250), LINK).ok).toBe(true)
    const long = checkCaption('x', 'a'.repeat(260), LINK)
    expect(long.ok).toBe(false)
    expect(long.issues).toContain('too_long')
    expect(long.max).toBe(280)
  })
  it('fitX shortens to fit, on a word boundary when it can', () => {
    const body = 'word '.repeat(80)
    const fit = fitX(body, LINK)
    expect(xWeightedLength(finalCaption('x', fit, LINK))).toBeLessThanOrEqual(280)
    expect(fit.endsWith('…')).toBe(true)
    expect(fitX('short', LINK)).toBe('short')
    const hi = fitX('नमस्ते '.repeat(60), LINK)
    expect(xWeightedLength(finalCaption('x', hi, LINK))).toBeLessThanOrEqual(280)
  })
  it('LinkedIn wants 3–5 lines and 3–5 hashtags', () => {
    const good = 'Line one\nLine two\nLine three\n#CodeSpectra #Hackathon #Students'
    expect(checkCaption('linkedin', good, LINK).issues).toEqual([])
    const bad = checkCaption('linkedin', 'One line #a', LINK)
    expect(bad.issues).toEqual(expect.arrayContaining(['lines_few', 'hashtags_few']))
    expect(bad.ok).toBe(true) // soft issues only
    expect(checkCaption('linkedin', 'a\nb\nc\nd\ne\nf\n#a #b #c #d #e #f', LINK).issues).toEqual(expect.arrayContaining(['lines_many', 'hashtags_many']))
  })
  it('a URL inside the body and an empty body are hard errors', () => {
    expect(checkCaption('whatsapp', 'See https://evil.example', LINK).ok).toBe(false)
    expect(checkCaption('telegram', '   ', LINK).issues).toContain('empty')
  })
  it('limits per platform', () => {
    expect(checkCaption('whatsapp', 'a'.repeat(800), LINK).issues).toContain('too_long')
    expect(checkCaption('telegram', 'a'.repeat(900), LINK).ok).toBe(true)
    expect(checkCaption('instagram', `${'a'.repeat(2300)} #a #b #c`, LINK).ok).toBe(false)
  })
})

const feedRow = { id: 'ef_0123456789abcdef', title: ' Hyderabad  AI hack ', status: 'published', source: 'devpost', mode: 'offline', location: { city: 'Hyderabad' }, starts_at: '2026-11-03T04:00:00Z', ends_at: '2026-11-04T12:00:00Z', registration_deadline: '2026-11-01T00:00:00Z', prize: { text: '₹50,000 in prizes' }, themes: ['ai'], image: 'https://img.devpost.com/x.png', first_seen_at: '2026-10-20T00:00:00Z' }

describe('queue mappers', () => {
  it('events feed: public only, links to our page, credits publisher image', () => {
    const it = fromFeedEvent(feedRow, ORIGIN, NOW)!
    expect(it.type).toBe('event')
    expect(it.title).toBe('Hyderabad AI hack')
    expect(it.url).toBe(`${ORIGIN}/events/ef_0123456789abcdef`)
    expect(it.image_own).toBe(false)
    expect(it.facts.prize).toBe('₹50,000 in prizes')
    expect(fromFeedEvent({ ...feedRow, status: 'hidden' }, ORIGIN, NOW)).toBeNull()
    expect(fromFeedEvent({ ...feedRow, internal: true }, ORIGIN, NOW)).toBeNull()
    expect(fromFeedEvent({ ...feedRow, ends_at: '2026-10-01T00:00:00Z' }, ORIGIN, NOW)).toBeNull()
    expect(fromFeedEvent({ ...feedRow, image: 'javascript:alert(1)' }, ORIGIN, NOW)!.image).toBeNull()
  })
  it('news, learn (no translations), contests (public, published)', () => {
    expect(fromNewsPost({ id: 'b1', slug: 'gpu-news', title: 'GPU news', status: 'published', tags: ['signals', 'news:ai'] }, ORIGIN)!.url).toBe(`${ORIGIN}/news/gpu-news`)
    expect(fromNewsPost({ id: 'b1', slug: 'x', title: 'x', status: 'draft' }, ORIGIN)).toBeNull()
    expect(fromLearnPost({ id: 'l1', slug: 'hash-maps', title: 'Hash maps', status: 'published' }, ORIGIN)!.url).toBe(`${ORIGIN}/learn/hash-maps`)
    expect(fromLearnPost({ id: 'l2', slug: 'hash-maps-hi', title: 'x', status: 'published', locale: 'hi' }, ORIGIN)).toBeNull()
    const c = { id: 'c1', slug: 'speed-run', title: 'Speed run', status: 'published', visibility: 'public', schedule: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-02T00:00:00Z' } }
    expect(fromContest(c, ORIGIN, NOW)!.url).toBe(`${ORIGIN}/contests/speed-run`)
    expect(fromContest({ ...c, visibility: 'unlisted' }, ORIGIN, NOW)).toBeNull()
  })
})

describe('queue dedupe', () => {
  const base = fromFeedEvent(feedRow, ORIGIN, NOW)!
  it('one entry per key; later copies only fill gaps', () => {
    const second: QueueInput = { ...base, summary: 'Summary from second', image: null, facts: { ...base.facts, prize: null, organiser: 'Devpost' } }
    const out = dedupeQueueInputs([{ ...base, summary: '' }, second, null])
    expect(out).toHaveLength(1)
    expect(out[0].summary).toBe('Summary from second')
    expect(out[0].image).toBe(base.image)
    expect(out[0].facts.prize).toBe('₹50,000 in prizes')
    expect(out[0].facts.organiser).toBe('Devpost')
  })
  it('a different type pointing at the same page is dropped', () => {
    const sameUrl: QueueInput = { ...base, type: 'contest', ref_id: 'c1', url: `${base.url}/` }
    expect(dedupeQueueInputs([base, sameUrl]).map((x) => queueKey(x.type, x.ref_id))).toEqual(['event:ef_0123456789abcdef'])
  })
  it('filter: not posted per platform, escaped search', () => {
    const f = QueueFilterSchema.parse({ status: 'not_posted', platform: 'x', q: 'a.b(' })
    const m = queueMongoFilter(f)
    expect(m['posts.x']).toEqual({ $exists: false })
    expect(JSON.stringify(m.$or)).toContain('a\\\\.b\\\\(')
    expect(queueMongoFilter(QueueFilterSchema.parse({ status: 'not_posted' })).posted_count).toBe(0)
  })
})

describe('caption guard + templates', () => {
  const it0 = fromFeedEvent(feedRow, ORIGIN, NOW)!
  const item = { ...it0, published_at: it0.published_at! } as Pick<SocialQueueDoc, 'type' | 'title' | 'summary' | 'facts' | 'source' | 'url'>
  it('numbers must come from the facts (Indic digits normalised, hashtags ignored)', () => {
    const facts = 'starts: 3 Nov 2026\nprize: ₹50,000 in prizes'
    expect(unsupportedNumbers('Starts 3 Nov 2026, ₹50,000 to win #100DaysOfCode', facts)).toEqual([])
    expect(unsupportedNumbers('Win ₹1,00,000!', facts)).not.toEqual([])
    expect(asciiDigits('३ नवंबर ౨౦')).toBe('3 नवंबर 20')
    expect(unsupportedNumbers('३ नवंबर 2026', facts)).toEqual([])
  })
  it('cleanCaptions drops invented numbers and links per platform', () => {
    const out = cleanCaptions({ linkedin: 'Join us on 3 Nov 2026.\nBuild something.\nMeet people.\n#CodeSpectra #AI #Hackathon', x: 'Prize pool of $1,000,000 — go https://evil.example', whatsapp: 42 }, item, LINK)
    expect(out.linkedin).toContain('3 Nov 2026')
    expect(out.x).toBeUndefined()
    expect(out.whatsapp).toBeUndefined()
  })
  it('templates exist for every platform and language and pass hard rules', () => {
    for (const lang of ['en', 'hi', 'te'] as const) {
      const caps = templateCaptions(item, lang, LINK)
      for (const p of SOCIAL_PLATFORMS) {
        const c = checkCaption(p, caps[p], LINK, lang)
        expect(c.ok, `${lang}/${p}: ${c.issues.join(',')}`).toBe(true)
        expect(unsupportedNumbers(caps[p], `${item.title} 3 Nov 2026 1 Nov 2026 ₹50,000 ${hashtagsForItem(item).join(' ')}`), `${lang}/${p}`).toEqual([])
      }
    }
    expect(hashtagsForItem(item).length).toBeGreaterThanOrEqual(3)
    expect(hashtagsForItem(item).length).toBeLessThanOrEqual(5)
  })
})

describe('roundup, stats, caps', () => {
  const doc = (id: string, over: Partial<SocialQueueDoc>): SocialQueueDoc => ({
    id, key: id, type: 'event', ref_id: id, title: id, summary: '', url: `${ORIGIN}/${id}`, image: null, image_own: false, source: 'devpost', facts: {},
    published_at: '2026-10-22T00:00:00Z', captions: {}, posts: {}, posted_count: 0, last_posted_at: null, created_at: '', updated_at: '', ...over,
  })
  it('pickRoundup prefers ours, prizes, open deadlines; this week only', () => {
    const items = [
      doc('a', {}), doc('b', { facts: { prize: '$1k' } }), doc('c', { source: 'codespectra', type: 'hackathon' }),
      doc('old', { published_at: '2026-10-01T00:00:00Z', source: 'codespectra' }), doc('learn', { type: 'learn', source: 'codespectra' }),
    ]
    expect(pickRoundup(items, 3, NOW).map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
  it('weeklyPostCounts groups marks by ISO week and platform', () => {
    const rows = weeklyPostCounts([
      { posts: { linkedin: { at: '2026-10-22T10:00:00Z', by: 'u' }, x: { at: '2026-10-21T10:00:00Z', by: 'u' } } },
      { posts: { linkedin: { at: '2026-10-14T10:00:00Z', by: 'u' } } },
    ], 3, NOW)
    expect(rows[0].week).toBe(isoWeekKey(NOW))
    expect(rows[0].counts.linkedin).toBe(1)
    expect(rows[0].counts.x).toBe(1)
    expect(rows[1].counts.linkedin).toBe(1)
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })
  it('AI caps', () => {
    const s = mergeSocialSettings({ daily_ai_cap: 2, junk: true })
    expect(s).toEqual(DEFAULT_SOCIAL_SETTINGS) // invalid patch → defaults
    const s2 = mergeSocialSettings({ daily_ai_cap: 2 })
    expect(aiBlocked(s2, 1, 0)).toBeNull()
    expect(aiBlocked(s2, 2, 0)).toBe('daily_cap')
    expect(aiBlocked(s2, 0, 5)).toBe('monthly_cap')
    expect(aiBlocked({ ...s2, ai_enabled: false }, 0, 0)).toBe('off')
  })
})
