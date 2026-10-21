/**
 * Daily tech news digest to subscribers of topic 'news' (lib/subscriptions).
 *
 *  - Opt-in only: email needs double opt-in (active), WhatsApp needs consent +
 *    YES (active); each subscriber's topic filter (filters.news.topics) applies.
 *  - Runs once per local day at settings.digest_hour in settings.digest_timezone
 *    (scheduler content lane, leased per day so replicas run it once).
 *  - Idempotent per (subscriber, day, channel) through the delivery ledger
 *    (type 'news_digest', ref = YYYY-MM-DD). Emails carry manage + one-click
 *    unsubscribe; WhatsApp ends with "Reply STOP" and respects quiet hours /
 *    the 24 h window (template outside it, else skipped).
 *  - Nothing is sent to a subscriber on a day with no matching items.
 */
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { localHourMinute } from '@/lib/subscriptions/filters'
import type { SubscriberDoc } from '@/lib/subscriptions/types'
import { newsTopicLabel } from './feeds'
import { NEWS_TAG, newsTopicOf } from './news'

const DAY_MS = 24 * 3600_000
export const NEWS_DIGEST_MAX = 8

export interface NewsDigestItem { slug: string; title: string; excerpt: string; tags: string[]; published_at?: string | null }

/** Local calendar day (YYYY-MM-DD) of `now` in `tz`. */
export function localDay(now: Date, tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) } catch { return now.toISOString().slice(0, 10) }
}

/** Pure: is it digest time? Returns the day key to run for, or null. */
export function digestDayIfDue(now: Date, s: { digest_enabled: boolean; digest_hour: number; digest_timezone: string; last_digest_day?: string | null }): string | null {
  if (!s.digest_enabled) return null
  if (localHourMinute(now, s.digest_timezone).h !== s.digest_hour) return null
  const day = localDay(now, s.digest_timezone)
  return s.last_digest_day === day ? null : day
}

/** Pure: items published in the 24 h before `now`, in the subscriber's topics (none = all), newest first. */
export function selectNewsDigest(items: readonly NewsDigestItem[], sub: Pick<SubscriberDoc, 'filters'>, now: Date): NewsDigestItem[] {
  const want = sub.filters?.news?.topics ?? []
  const from = now.getTime() - DAY_MS
  return items
    .filter((p) => p.published_at && Date.parse(p.published_at) > from && Date.parse(p.published_at) <= now.getTime())
    .filter((p) => !want.length || want.includes(newsTopicOf(p.tags)))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, NEWS_DIGEST_MAX)
}

const link = (origin: string, slug: string, medium: string) => `${origin}/news/${encodeURIComponent(slug)}?utm_source=digest&utm_medium=${medium}&utm_campaign=news_daily`

export function newsDigestHtml(items: readonly NewsDigestItem[], origin: string): string {
  const rows = items.map((p) => `<tr><td style="padding:14px 0;border-top:1px solid #e3e7f1">
  <div style="font-size:12px;color:#4b5563">${escapeHtml(newsTopicLabel(newsTopicOf(p.tags)))}</div>
  <a href="${escapeHtml(link(origin, p.slug, 'email'))}" style="display:block;margin:4px 0;font-size:16px;font-weight:600;color:#2F5BE7;text-decoration:none">${escapeHtml(p.title)}</a>
  <div style="font-size:14px;line-height:1.5;color:#0f1729">${escapeHtml(p.excerpt)}</div>
</td></tr>`).join('')
  return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Today’s tech news for builders, each with links to the original sources.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:16px 0 0"><a href="${escapeHtml(origin)}/news" style="color:#2F5BE7">All news</a></p>`
}

export function newsDigestText(items: readonly NewsDigestItem[], origin: string): string {
  const rows = items.slice(0, 5).map((p) => `• ${p.title}\n${link(origin, p.slug, 'whatsapp')}`)
  return `Today’s tech news on CodeSpectra:\n${rows.join('\n')}\n\nReply STOP to stop these messages.`
}

export interface NewsDigestReport { day: string; items: number; sent: number; failed: number; skipped: number; duplicate: number; deferred: number }

/** The day key to run now, or null (reads settings). */
export async function newsDigestDue(now: Date): Promise<string | null> {
  const { getSignalSettings } = await import('./store')
  return digestDayIfDue(now, await getSignalSettings())
}

export async function runNewsDigest(now: Date, day: string): Promise<NewsDigestReport> {
  const rep: NewsDigestReport = { day, items: 0, sent: 0, failed: 0, skipped: 0, duplicate: 0, deferred: 0 }
  const store = await import('./store')
  const settings = await store.getSignalSettings()
  const items = (await (await store.newsPostsCol())
    .find({ status: 'published', tags: NEWS_TAG, published_at: { $gt: new Date(now.getTime() - DAY_MS).toISOString() } }, { projection: { _id: 0, slug: 1, title: 1, excerpt: 1, tags: 1, published_at: 1 } })
    .sort({ published_at: -1 }).limit(200).toArray()) as NewsDigestItem[]
  rep.items = items.length
  if (items.length) {
    const { recipientsFor, sendSubscriberEmail, sendSubscriberWhatsApp } = await import('@/lib/subscriptions')
    const { getSubscriptionSettings } = await import('@/lib/subscriptions/settings')
    const origin = getAppOrigin()
    for (const sub of await recipientsFor('news', 'email')) {
      const mine = selectNewsDigest(items, sub, now)
      if (!mine.length) { rep.skipped++; continue }
      rep[await sendSubscriberEmail(sub, {
        type: 'news_digest', ref: day, topic: 'news',
        subject: mine.length === 1 ? `Tech news: ${mine[0].title}` : `${mine.length} tech news stories for today`,
        heading: 'Today’s tech news', preheader: mine.map((p) => p.title).slice(0, 3).join(' · '),
        bodyHtml: newsDigestHtml(mine, origin),
        reason: 'You get this daily email because you subscribed to CodeSpectra tech news.',
      })]++
    }
    const language = settings.whatsapp_template_digest ? (await getSubscriptionSettings()).whatsapp_template_language : 'en'
    for (const sub of await recipientsFor('news', 'whatsapp')) {
      const mine = selectNewsDigest(items, sub, now)
      if (!mine.length) { rep.skipped++; continue }
      rep[await sendSubscriberWhatsApp(sub, {
        type: 'news_digest', ref: day, topic: 'news', now,
        text: newsDigestText(mine, origin),
        template: settings.whatsapp_template_digest ? { name: settings.whatsapp_template_digest, language, params: [mine.slice(0, 3).map((p) => p.title).join(' · ').slice(0, 900), `${origin}/news`] } : null,
      })]++
    }
  }
  await store.claimDigestDay(day).catch(() => false)
  return rep
}
