import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_ENGINES, AI_SOURCE_VALUES, aiEngineOf, aiLandingsPipeline, summarizeAiReferrals } from '@/lib/seo/ai-referrals'
import { PUBLIC_ROUTES } from '@/lib/seo/public-routes'

describe('aiEngineOf', () => {
  it('recognises assistants by referrer host, subdomain and utm_source', () => {
    expect(aiEngineOf('chatgpt.com')).toBe('chatgpt')
    expect(aiEngineOf('chat.openai.com')).toBe('chatgpt')
    expect(aiEngineOf('www.perplexity.ai')).toBe('perplexity')
    expect(aiEngineOf('labs.perplexity.ai')).toBe('perplexity')
    expect(aiEngineOf('gemini.google.com')).toBe('gemini')
    expect(aiEngineOf('claude.ai')).toBe('claude')
    expect(aiEngineOf('copilot.microsoft.com')).toBe('copilot')
    expect(aiEngineOf('ChatGPT')).toBe('chatgpt')
  })
  it('does not claim search, social, direct or look-alike hosts', () => {
    for (const s of ['google.com', 'bing.com', 'direct', '', null, 'notchatgpt.com', 'claude.ai.evil.example', 'linkedin.com', 'x.com', 'microsoft.com', 'newsletter'])
      expect(aiEngineOf(s as string)).toBeNull()
  })
  it('every value we query the database with maps back to an assistant', () => {
    for (const v of AI_SOURCE_VALUES) expect(aiEngineOf(v)).not.toBeNull()
    expect(new Set(AI_ENGINES.map((e) => e.id)).size).toBe(AI_ENGINES.length)
  })
})

describe('summarizeAiReferrals', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03']
  const rollups: Array<{ day?: string; _id?: string; sessions: number; sources: Record<string, number> }> = [
    // Stored keys have '.' replaced (Mongo field names) — see analytics/rollup inc().
    { day: '2026-11-01', sessions: 100, sources: { direct: 60, 'google．com': 30, 'chatgpt．com': 8, 'perplexity．ai': 2 } },
    { _id: '2026-11-03', sessions: 50, sources: { 'chatgpt．com': 5, chatgpt: 1, 'claude．ai': 4, direct: 40 } },
  ]
  const r = summarizeAiReferrals(rollups, days)
  it('totals sessions and AI sessions, with a one-decimal share', () => {
    expect(r.total_sessions).toBe(150)
    expect(r.ai_sessions).toBe(20)
    expect(r.share_pct).toBe(13.3)
    expect(r.days).toBe(3)
  })
  it('ranks assistants and merges host + utm forms', () => {
    expect(r.engines).toEqual([
      { id: 'chatgpt', label: 'ChatGPT', sessions: 14 },
      { id: 'claude', label: 'Claude', sessions: 4 },
      { id: 'perplexity', label: 'Perplexity', sessions: 2 },
    ])
  })
  it('fills days without a rollup with zeros', () => {
    expect(r.series).toEqual([
      { day: '2026-11-01', sessions: 100, ai_sessions: 10 },
      { day: '2026-11-02', sessions: 0, ai_sessions: 0 },
      { day: '2026-11-03', sessions: 50, ai_sessions: 10 },
    ])
  })
  it('no traffic → zero share, no engines', () => {
    const e = summarizeAiReferrals([], days)
    expect(e.share_pct).toBe(0)
    expect(e.engines).toEqual([])
  })
})

describe('aiLandingsPipeline', () => {
  it('only reads public page views from assistant sources in the range', () => {
    const [match] = aiLandingsPipeline('2026-11-01', '2026-11-30') as Array<{ $match: Record<string, any> }>
    expect(match.$match.day).toEqual({ $gte: '2026-11-01', $lte: '2026-11-30' })
    expect(match.$match.private).toEqual({ $ne: true })
    expect(match.$match.source.$in).toContain('chatgpt.com')
  })
})

describe('answer-first copy on hub pages', () => {
  const HUBS = ['/jobs', '/hackathons', '/contests', '/events', '/learn', '/marketplace', '/mentors', '/community', '/certifications', '/leagues', '/companies', '/news', '/digest']
  const load = (l: string) => JSON.parse(readFileSync(join(process.cwd(), 'lib/i18n/messages', l, 'seo.json'), 'utf8')) as Record<string, string>
  it.each(['en', 'hi', 'te'])('%s has a one-to-two sentence answer for every hub', (l) => {
    const cat = load(l)
    for (const p of HUBS) {
      const a = cat[`answer:${p}`]
      expect(a, `${l} answer:${p}`).toBeTruthy()
      expect(a.length, `${l} answer:${p} length`).toBeGreaterThan(60)
      expect(a.length, `${l} answer:${p} length`).toBeLessThan(320)
      expect(PUBLIC_ROUTES.some((r) => r.path === p)).toBe(true)
    }
    expect(cat.answerCompany).toContain('{company}')
    expect(cat.answerCompany).toContain('{count}')
  })
  it('each hub view renders the answer block', () => {
    const files: Record<string, string> = {
      '/jobs': 'app/jobs/page.tsx', '/hackathons': 'app/hackathons/page.tsx', '/contests': 'app/contests/contests-view.tsx', '/events': 'app/events/events-view.tsx',
      '/learn': 'app/learn/learn-view.tsx', '/marketplace': 'app/marketplace/marketplace-view.tsx', '/mentors': 'app/mentors/mentors-view.tsx', '/community': 'app/community/community-view.tsx',
      '/certifications': 'app/certifications/certifications-view.tsx', '/leagues': 'app/leagues/leagues-view.tsx', '/companies': 'app/companies/companies-view.tsx', '/news': 'app/news/news-view.tsx', '/digest': 'app/digest/digest-view.tsx',
    }
    for (const p of HUBS) expect(readFileSync(join(process.cwd(), files[p]), 'utf8'), p).toContain(`<PageAnswer path="${p}"`)
    expect(readFileSync(join(process.cwd(), 'app/companies/[slug]/company-view.tsx'), 'utf8')).toContain("t('seo.answerCompany'")
  })
})
