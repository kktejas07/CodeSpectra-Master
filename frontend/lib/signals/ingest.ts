/**
 * Signals ingest (server only): enabled feeds (least recently run first) →
 * newest items → dedupe by source URL → AI research / draft / humanise →
 * `signal_drafts`. Items from TRUSTED feeds are published at once (owner's
 * decision) unless the AI pass failed or the source text tripped the prompt
 * guard; everything else waits for an admin.
 *
 * AI spend is capped (lib/signals/settings: daily count + monthly cost). Each
 * feed is isolated: one failing feed is recorded on its state row and the run
 * moves on. Shared by the cron route and the admin "Run now" button.
 */
import { escapeHtml, safeHttpUrl, sanitizeArticleHtml } from '@/lib/safe-html'
import type { SignalDraftDoc } from '@/lib/db/signal-drafts'
import { newSignalId } from '@/lib/db/signal-drafts'
import { effectiveFeeds } from './feeds'
import { aiBudget, dayKey, monthKey, shouldAutoPublish } from './settings'
import type { RssItem } from './rss'
import type { SignalDraftResult } from './rewrite'

export interface IngestReport {
  created: number
  published: number
  skipped: number
  errors: string[]
  blocked?: string
  ids: string[]
}

export interface IngestDeps {
  fetchItems?: (url: string, limit: number) => Promise<RssItem[]>
  rewrite?: (a: { title: string; summary: string; sourceUrl: string; category: SignalDraftDoc['category'] }) => Promise<SignalDraftResult | null>
  og?: (url: string) => Promise<{ image?: string; description?: string; title?: string }>
}

function fallbackBody(text: string, link: string): string {
  const href = safeHttpUrl(link)
  return `<p>${escapeHtml(text || '')}</p>` + (href ? `<p><a href="${escapeHtml(href)}" rel="noopener noreferrer">Source</a></p>` : '')
}

export async function runSignalsIngest(opts: { now?: Date; maxFeeds?: number; deps?: IngestDeps } = {}): Promise<IngestReport> {
  const now = opts.now || new Date()
  const rep: IngestReport = { created: 0, published: 0, skipped: 0, errors: [], ids: [] }
  const store = await import('./store')
  const settings = await store.getSignalSettings()
  // Local mirror of the usage counters so the cap is re-checked after every item.
  const usage = { day: null as string | null, day_count: 0, month: null as string | null, month_cost_usd: 0, ...(settings.usage || {}) }
  if (usage.day !== dayKey(now)) Object.assign(usage, { day: dayKey(now), day_count: 0 })
  if (usage.month !== monthKey(now)) Object.assign(usage, { month: monthKey(now), month_cost_usd: 0 })
  // Cap source: own counter or the platform-recorded cost, whichever is higher.
  usage.month_cost_usd = await (await import('@/lib/ai/usage-record')).capSpendFor(['signals-*'], usage.month_cost_usd, now).catch(() => usage.month_cost_usd)
  let budget = aiBudget(settings, usage, now)
  const fetchItems = opts.deps?.fetchItems || (async (u: string, n: number) => (await import('./rss')).fetchFeedItems(u, n))
  const rewrite = opts.deps?.rewrite || (async (a: Parameters<NonNullable<IngestDeps['rewrite']>>[0]) => (await import('./rewrite')).rewriteSignal(a))
  const og = opts.deps?.og || (async (u: string) => (await import('./og-scraper')).scrapeOgData(u))
  const { withUsageMeter, meteredUsd } = await import('@/lib/ai/usage-meter')
  const { estimateAiCost } = await import('@/lib/db/analytics')
  const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
  const { publishDraft } = await import('./publish')
  const drafts = await store.draftsCol()
  const states = await store.feedStateCol()

  const feeds = effectiveFeeds(await store.listFeedStates()).filter((f) => f.enabled).slice(0, opts.maxFeeds ?? 100)
  for (const feed of feeds) {
    if (budget.items <= 0) { rep.blocked = budget.blocked; break }
    const at = new Date().toISOString()
    let created = 0
    try {
      const items = await fetchItems(feed.url, settings.items_per_feed)
      for (const item of items) {
        if (await drafts.findOne({ source_url: item.link })) { rep.skipped++; continue }
        if (budget.items <= 0) { rep.blocked = budget.blocked || 'AI cap reached'; break }
        const page = await og(item.link).catch(() => ({} as { image?: string; description?: string; title?: string }))
        const summary = page.description || page.title || item.summary
        let cost = 0
        const rewritten = await withUsageMeter(
          // Recorded per-call cost (lib/ai/usage-record); token estimate only when none was recorded.
          (u) => { cost += meteredUsd(u, () => estimateAiCost(u.model, u.inputTokens, u.outputTokens)) },
          () => rewrite({ title: page.title || item.title, summary, sourceUrl: item.link, category: feed.category }),
        ).catch(() => null)
        await store.recordAiUse(cost, now)
        usage.day_count += 1
        usage.month_cost_usd += Math.max(0, cost)
        budget = aiBudget(settings, usage, now)
        const flags = [...new Set([...(rewritten?.flags || []), ...scanUntrusted(`${item.title}\n${summary}`).reasons])]
        const sourceUrls = (rewritten?.source_urls?.length ? rewritten.source_urls : [item.link])
          .map((u) => safeHttpUrl(u)).filter((u): u is string => !!u && /^https?:/i.test(u))
        const ts = new Date().toISOString()
        const doc: SignalDraftDoc = {
          id: newSignalId(),
          title: rewritten?.title || item.title,
          excerpt: rewritten?.excerpt || item.summary.slice(0, 220) || item.title,
          // Untrusted (feed + LLM): sanitise on save (E13).
          body: sanitizeArticleHtml(rewritten?.body || fallbackBody(item.summary || item.title, item.link)),
          category: feed.category,
          source_url: item.link,
          source_title: item.title,
          source_feed: feed.id,
          angle: rewritten?.angle,
          facts: rewritten?.facts,
          source_urls: sourceUrls,
          // Publisher's og:image only — no AI-generated images.
          ...(page.image && safeHttpUrl(page.image) ? { cover_image: safeHttpUrl(page.image)! } : {}),
          status: 'pending',
          topic: feed.topic,
          trusted: feed.trusted,
          ai_rewritten: Boolean(rewritten),
          flags,
          created_at: ts,
          updated_at: ts,
        }
        await drafts.insertOne(doc)
        rep.created++
        created++
        rep.ids.push(doc.id)
        if (shouldAutoPublish({ trusted: feed.trusted, autoPublishTrusted: settings.auto_publish_trusted, aiRewritten: Boolean(rewritten), flagged: flags.length > 0 })) {
          await publishDraft(doc, { by: 'signals-bot', auto: true })
          rep.published++
        }
      }
      await states.updateOne({ id: feed.id }, { $set: { last_run_at: at, last_ok_at: at, last_error: null, last_created: created }, $setOnInsert: { id: feed.id, trusted: null, enabled: true } }, { upsert: true })
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 300)
      rep.errors.push(`${feed.id}: ${msg}`)
      await states.updateOne({ id: feed.id }, { $set: { last_run_at: at, last_error: msg }, $setOnInsert: { id: feed.id, trusted: null, enabled: true } }, { upsert: true }).catch(() => undefined)
    }
  }
  return rep
}
