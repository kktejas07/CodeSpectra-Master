/**
 * The digest agents' tools, backed by the database (server only).
 *
 *   list_candidates   lib/digest/collect (Social studio queue + open events, enriched)
 *   get_item          the item re-read from its own collection
 *   score_items       lib/digest/rank (admin weights)
 *   check_duplicate   near-duplicates in this digest + items featured in recent digests
 *   verify_item       evidence (get_item, link check, check_duplicate, prompt guard) → rules
 *   draft_summary     lib/digest/ai (AI within caps, else template text)
 *   compose_digest / publish_digest live in lib/digest/service (they write).
 *
 * Link checks use the SSRF-guarded fetch (lib/url-safety) with a timeout,
 * HEAD first then a ranged GET; when nothing answers at all for several links
 * in a row the checker is treated as unavailable for the run (no outbound
 * network) instead of rejecting every item.
 */
import 'server-only'
import { collectCandidates, currentItem } from './collect'
import { draftSummaries, isFlagged } from './ai'
import { scoreAll } from './rank'
import type { DigestSettings } from './settings'
import { linkCheckerUnavailable, verifyItem, type LinkCheck } from './verify'
import type { LoopTools } from './loop'
import type { DigestCandidate, TraceStep } from './types'

const UA = 'CodeSpectraDigestBot/1.0 (+https://codespectra.ai/digest; link check)'

export async function checkLink(url: string, timeoutMs = 6000): Promise<LinkCheck> {
  const { safeFetch } = await import('@/lib/url-safety')
  const attempt = async (method: 'HEAD' | 'GET'): Promise<LinkCheck> => {
    const res = await safeFetch(url, { method, headers: { 'user-agent': UA, ...(method === 'GET' ? { range: 'bytes=0-1023' } : {}) }, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' })
    await res.body?.cancel().catch(() => {})
    return { ok: res.status < 400, status: res.status }
  }
  try {
    const head = await attempt('HEAD')
    // Many sites refuse HEAD (403 / 405 / 501): try a tiny GET before calling it broken.
    if (head.ok || ![403, 405, 501].includes(head.status ?? 0)) return head
    return await attempt('GET')
  } catch (e) {
    return { ok: false, error: ((e as Error)?.name || 'error').slice(0, 40) }
  }
}

export interface ToolsContext {
  settings: DigestSettings
  now: Date
  date: string
  recentKeys: Set<string>
  useAi: boolean
  userId?: string
  /** Extra verifier sub-steps (get_item / check_duplicate / link) for the run trace. */
  trace: TraceStep[]
  /** Injected for tests. */
  linkChecker?: (url: string) => Promise<LinkCheck>
  collect?: () => Promise<DigestCandidate[]>
  getItem?: typeof currentItem
}

export function dbTools(ctx: ToolsContext): LoopTools & { linkChecks: LinkCheck[] } {
  const linkChecks: LinkCheck[] = []
  let linksOff = !ctx.settings.check_links
  const note = (agent: TraceStep['agent'], tool: string, n: string) => ctx.trace.push({ agent, tool, note: n.slice(0, 300), at: new Date().toISOString() })
  return {
    linkChecks,
    async list_candidates() {
      if (ctx.collect) return ctx.collect()
      const r = await collectCandidates(ctx.now)
      if (r.failed.length) note('curator', 'list_candidates', `sources unavailable: ${r.failed.join(', ')}`)
      return r.candidates
    },
    score_items(c) {
      return scoreAll(c, ctx.settings.weights, ctx.now)
    },
    async draft_summary(items, langs) {
      return draftSummaries(items, langs, ctx.settings, { useAi: ctx.useAi, userId: ctx.userId })
    },
    async verify_item(item, summaries, verified) {
      type Cur = Awaited<ReturnType<typeof currentItem>>
      const cur: Cur = await (ctx.getItem ?? currentItem)(item).catch((): Cur => ({ status: 'ok' }))
      note('verifier', 'get_item', `${item.key}: ${cur ? 'published' : 'gone'}`)
      const current = cur ? { title: item.title, url: item.url, group: item.group, published_at: item.published_at, deadline: cur.deadline ?? item.deadline, ends_at: cur.ends_at ?? item.ends_at, starts_at: cur.starts_at ?? item.starts_at } : null
      let link: LinkCheck | undefined
      if (!linksOff && item.source_url) {
        link = await (ctx.linkChecker ?? checkLink)(item.source_url)
        linkChecks.push(link)
        // A network error only counts once the checker has proven it can reach the web this run.
        if (link.status === undefined && !linkChecks.some((l) => l.status !== undefined)) link = undefined
        if (linkCheckerUnavailable(linkChecks)) {
          linksOff = true
          note('verifier', 'verify_item', 'link checker unavailable (no answers): link checks skipped for this run')
        }
      }
      note('verifier', 'check_duplicate', `${item.key}: ${ctx.recentKeys.has(item.key) ? 'in a recent digest' : 'new'}`)
      return verifyItem(item, summaries, {
        now: ctx.now, current, link, verified, recentKeys: ctx.recentKeys, maxAgeDays: ctx.settings.max_age_days, flagged: await isFlagged(item),
      })
    },
  }
}
