/**
 * Content QA loop (server only) — weekly, read-only, no AI.
 * See lib/agent-loops/pure/content-qa.ts for the checks.
 */
import 'server-only'
import type { LoopContext } from '../runner'
import type { FindingInput, LoopResult } from '../types'
import { extractLinks, findingKey, lowEngagement, outdatedReason, rotatingBatch, staleNewsReason } from '../pure/content-qa'

const LOOP = 'content-qa'
const LINKS_PER_POST = 5
const MAX_LINKS = 40
const QUESTIONS_PER_RUN = 5

type LinkResult = { ok: boolean; status?: number }
/** Gone or broken for readers (403 / 401 / 429 are often bot blocks, not dead links). */
const isBroken = (r: LinkResult) => !r.ok && typeof r.status === 'number' && r.status >= 400 && ![401, 403, 429].includes(r.status)

export async function runContentQa(ctx: LoopContext): Promise<LoopResult> {
  const findings: FindingInput[] = []
  const notes: string[] = []
  const summary: Record<string, number> = { learn_checked: 0, links_checked: 0, news_checked: 0, questions_checked: 0 }
  const { checkLink } = await import('@/lib/digest/tools')
  const check = ctx.deps?.checkLink ?? checkLink
  let linkErrors = 0
  let linksLeft = MAX_LINKS
  const tryLink = async (url: string): Promise<LinkResult | null> => {
    if (linksLeft <= 0 || linkErrors >= 5 || ctx.timeUp()) return null
    linksLeft--
    summary.links_checked++
    const r = await check(url).catch(() => ({ ok: false }) as LinkResult)
    // Nothing answering at all several times in a row = no outbound network: stop checking.
    if (!r.ok && r.status === undefined) linkErrors++
    else linkErrors = 0
    return r
  }

  // ── Learn posts ─────────────────────────────────────────────────────────
  const { learnPosts } = await import('@/lib/learn/store')
  const posts = await (await learnPosts()).find({ status: 'published' }, { projection: { _id: 0, id: 1, slug: 1, title: 1, body: 1, sources: 1, published_at: 1, updated_at: 1, stats: 1, locale: 1 } }).sort({ id: 1 }).limit(3000).toArray()
  for (const p of posts) {
    const target = { type: 'learn_post' as const, id: p.id, label: String(p.title).slice(0, 160), url: `/learn/${p.slug}` }
    const old = outdatedReason(p, ctx.now)
    if (old.outdated) findings.push({ key: findingKey(LOOP, 'outdated', 'learn', p.id), kind: 'learn_outdated', severity: 'info', target, params: { year: old.year ?? 0 }, proposal: { action: 'learn_to_draft', args: { post_id: p.id } } })
    if (lowEngagement(p, ctx.now)) findings.push({ key: findingKey(LOOP, 'low_engagement', 'learn', p.id), kind: 'learn_low_engagement', severity: 'info', target, params: { views: p.stats?.views ?? 0 }, proposal: { action: 'learn_unpublish', args: { post_id: p.id } } })
  }
  const learnBatch = rotatingBatch(posts, ctx.state.learn_cursor as string | undefined, ctx.settings.max_items)
  for (const p of learnBatch.batch) {
    if (ctx.timeUp()) break
    summary.learn_checked++
    const urls = [...new Set([...(p.sources || []).map((s) => s.url), ...extractLinks(p.body)])].slice(0, LINKS_PER_POST)
    const broken: string[] = []
    for (const u of urls) {
      const r = await tryLink(u)
      if (r && isBroken(r)) broken.push(u)
    }
    if (broken.length) findings.push({
      key: findingKey(LOOP, 'broken_link', 'learn', p.id), kind: 'learn_broken_link', severity: 'warning',
      target: { type: 'learn_post', id: p.id, label: String(p.title).slice(0, 160), url: `/learn/${p.slug}` },
      params: { count: broken.length }, detail: broken.join('\n'), proposal: { action: 'learn_to_draft', args: { post_id: p.id } },
    })
  }

  // ── Tech news ───────────────────────────────────────────────────────────
  const [{ signalDrafts }, { blogPosts }] = await Promise.all([import('@/lib/db/signal-drafts'), import('@/lib/db/blog-posts')])
  const drafts = await (await signalDrafts()).find({ status: 'published', blog_slug: { $exists: true } } as never, { projection: { _id: 0, id: 1, title: 1, excerpt: 1, source_url: 1, blog_slug: 1, created_at: 1 } }).sort({ id: 1 }).limit(3000).toArray()
  const slugs = drafts.map((d) => d.blog_slug).filter(Boolean) as string[]
  const live = new Map((await (await blogPosts()).find({ slug: { $in: slugs } }, { projection: { _id: 0, slug: 1, published_at: 1 } }).toArray()).map((b) => [b.slug, b.published_at]))
  for (const d of drafts) {
    if (!d.blog_slug || !live.has(d.blog_slug)) continue
    const stale = staleNewsReason({ title: d.title, excerpt: d.excerpt, published_at: live.get(d.blog_slug) || d.created_at }, ctx.now)
    if (stale.stale) findings.push({ key: findingKey(LOOP, 'stale', 'news', d.id), kind: 'news_stale', severity: 'warning', target: { type: 'news', id: d.id, label: d.title.slice(0, 160), url: `/news/${d.blog_slug}` }, params: { date: stale.last_date || '' }, proposal: { action: 'news_unpublish', args: { draft_id: d.id } } })
  }
  const newsBatch = rotatingBatch(drafts.filter((d) => d.blog_slug && live.has(d.blog_slug)), ctx.state.news_cursor as string | undefined, Math.ceil(ctx.settings.max_items / 2))
  for (const d of newsBatch.batch) {
    if (ctx.timeUp()) break
    summary.news_checked++
    const r = d.source_url ? await tryLink(d.source_url) : null
    if (r && isBroken(r)) findings.push({ key: findingKey(LOOP, 'broken_source', 'news', d.id), kind: 'news_broken_source', severity: 'warning', target: { type: 'news', id: d.id, label: d.title.slice(0, 160), url: `/news/${d.blog_slug}` }, params: { status: r.status ?? 0 }, detail: d.source_url, proposal: { action: 'news_unpublish', args: { draft_id: d.id } } })
  }
  if (linkErrors >= 5) notes.push('link_checker_unavailable')

  // ── Coding questions: re-run the reference solution ─────────────────────
  const [{ questionBank }, { verifyReferenceSolution }] = await Promise.all([import('@/lib/question-bank'), import('@/lib/question-bot/quality')])
  const qs = await (await questionBank()).find(
    { is_active: true, review_status: { $ne: 'draft' }, 'reference_solution.code': { $exists: true }, 'test_cases.0': { $exists: true } } as never,
    { projection: { _id: 0, id: 1, title: 1, question: 1, reference_solution: 1, test_cases: 1, language: 1 } },
  ).sort({ id: 1 }).limit(5000).toArray() as unknown as Array<{ id: string; title?: string; question?: string; language?: string; reference_solution: { language: string; code: string }; test_cases: { input: string; output: string }[] }>
  const qBatch = rotatingBatch(qs, ctx.state.question_cursor as string | undefined, QUESTIONS_PER_RUN)
  const exec = ctx.deps?.exec ?? (async ({ language, source, stdin }: { language: string; source: string; stdin: string }) => {
    const { executeOnce } = await import('@/lib/piston')
    const r = await executeOnce({ language, source, stdin })
    if (r.compile && typeof r.compile.code === 'number' && r.compile.code !== 0) return { stdout: '', code: r.compile.code, stderr: r.compile.stderr }
    return { stdout: r.run.stdout || '', code: r.run.code, stderr: r.run.stderr }
  })
  for (const q of qBatch.batch) {
    if (ctx.timeUp()) break
    summary.questions_checked++
    const v = await verifyReferenceSolution({ language: q.reference_solution.language || q.language, reference_solution: q.reference_solution.code, test_cases: q.test_cases }, exec)
    // "Could not run" = the sandbox is down, not a broken question: stop and say so.
    if (!v.ok && v.reason === 'Could not run the reference solution') { notes.push('sandbox_unavailable'); break }
    if (!v.ok) findings.push({
      key: findingKey(LOOP, 'failing_reference', 'question', q.id), kind: 'question_failing_reference', severity: 'critical',
      target: { type: 'question', id: q.id, label: String(q.title || q.question || q.id).slice(0, 160), url: '/dashboard/admin/question-bank' },
      params: { passed: v.passed, total: v.total }, proposal: { action: 'question_deactivate', args: { question_id: q.id } },
    })
  }

  await ctx.saveState({ learn_cursor: learnBatch.cursor, news_cursor: newsBatch.cursor, question_cursor: qBatch.cursor })
  summary.flagged = findings.length
  return { summary, findings, notes }
}
