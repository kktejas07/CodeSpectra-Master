/**
 * SEO / content gap loop (server only) — weekly, read-only.
 * Proposes new Learn topics (the Learn writer then drafts them for review) and
 * Hindi / Telugu translations of posts that already answer a query.
 * AI (optional, capped) only turns a cluster of queries into an English topic
 * title + category; without it the title comes from the query itself.
 */
import 'server-only'
import type { LoopContext } from '../runner'
import type { FindingInput, LoopResult } from '../types'
import { findGaps, queryTokens, type CoverageDoc, type Gap, type QueryLocale } from '../pure/seo-gap'
import { findingKey } from '../pure/content-qa'

const LOOP = 'seo-gap'

const SYSTEM = `You plan articles for CodeSpectra Learn, a programming and careers blog for students in India.
For each numbered search query give a short English article title (max 80 characters, sentence case) and the best category id.
Categories: dsa, system-design, design-patterns, architecture, methodologies, testing, security, databases, cloud, ai-ml, interview-prep, career, languages, technologies, competitions-careers.
Levels: beginner, intermediate, advanced.
Answer JSON: {"topics":[{"n":1,"title":"...","category":"dsa","level":"beginner"}]}`

export async function runSeoGap(ctx: LoopContext): Promise<LoopResult> {
  const [{ recentQueryStats }, { learnPosts, learnTopics }, { isLearnCategory, isLearnLevel }] = await Promise.all([
    import('../search-log'), import('@/lib/learn/store'), import('@/lib/learn/types'),
  ])
  const stats = await recentQueryStats(30, 2000, ctx.now)
  const [topics, posts] = await Promise.all([
    (await learnTopics()).find({}, { projection: { _id: 0, id: 1, title: 1, tags: 1 } }).limit(5000).toArray(),
    (await learnPosts()).find({ status: 'published' }, { projection: { _id: 0, id: 1, slug: 1, title: 1, tags: 1, locale: 1, translation_of: 1 } }).limit(5000).toArray(),
  ])
  // English posts with the languages they are already translated into.
  const locales = new Map<string, QueryLocale[]>()
  for (const p of posts) if (p.translation_of && p.locale && p.locale !== 'en') locales.set(p.translation_of, [...(locales.get(p.translation_of) || []), p.locale])
  const cover: { topics: CoverageDoc[]; posts: CoverageDoc[] } = {
    topics: topics.map((t) => ({ id: t.id, title: t.title, tags: t.tags })),
    posts: posts.filter((p) => !p.locale || p.locale === 'en').map((p) => ({ id: p.id, title: p.title, tags: p.tags, slug: p.slug, locales: ['en', ...(locales.get(p.id) || [])] as QueryLocale[] })),
  }
  const gaps = findGaps(stats, cover, { max: ctx.settings.max_items })

  // Optional AI pass: English titles + categories for the new-topic gaps.
  const fresh = gaps.filter((g): g is Extract<Gap, { kind: 'new_topic' }> => g.kind === 'new_topic')
  const refined = new Map<number, { title: string; category: string; level: string }>()
  if (fresh.length && ctx.settings.use_ai) {
    const { loopAi } = await import('../ai')
    const list = fresh.map((g, i) => `${i + 1}. ${g.queries.join(' | ')}`).join('\n')
    const json = await loopAi('seo-gap', ctx.settings, ctx.ai, { system: SYSTEM, trusted: 'Search queries (data):', untrusted: { data: list } }) as { topics?: unknown } | null
    for (const t of Array.isArray(json?.topics) ? json!.topics as Record<string, unknown>[] : []) {
      const n = Number(t.n)
      const title = typeof t.title === 'string' ? t.title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
      if (Number.isInteger(n) && n >= 1 && n <= fresh.length && title.length >= 4 && isLearnCategory(t.category)) refined.set(n - 1, { title, category: t.category as string, level: isLearnLevel(t.level) ? (t.level as string) : 'beginner' })
    }
  }

  const findings: FindingInput[] = gaps.map((g): FindingInput => {
    if (g.kind === 'translate') {
      return {
        key: findingKey(LOOP, 'translate', 'learn', `${g.post_id}:${g.locale}`), kind: 'seo_translate', severity: 'info',
        target: { type: 'learn_post', id: g.post_id, label: g.post_title.slice(0, 160), url: null },
        params: { count: g.count, locale: g.locale, query: g.q.slice(0, 100) },
        proposal: { action: 'learn_translate', args: { post_id: g.post_id, locale: g.locale } },
      }
    }
    const r = refined.get(fresh.indexOf(g))
    const title = r?.title ?? g.title
    return {
      key: findingKey(LOOP, 'topic', 'query', g.key), kind: 'seo_new_topic', severity: 'info',
      target: { type: 'query', id: g.key, label: g.q.slice(0, 160), url: null },
      params: { count: g.count, locale: g.locale, title: title.slice(0, 120), category: r?.category ?? g.category },
      detail: g.queries.join('\n'),
      proposal: { action: 'learn_add_topic', args: { title, category: r?.category ?? g.category, level: r?.level ?? 'beginner', tags: queryTokens(g.q).slice(0, 4) } },
    }
  })
  return { summary: { queries: stats.length, gaps: gaps.length, new_topics: fresh.length, translations: gaps.length - fresh.length }, findings, notes: stats.length ? [] : ['no_search_data'] }
}
