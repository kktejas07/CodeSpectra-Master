/**
 * Weekly "new on Learn" email to subscribers of topic 'blog' (lib/subscriptions).
 *
 *  - Runs from runLearnTick on Mondays from 09:00 UTC; the ISO week is claimed
 *    once in learn_settings, so replicas / overlapping ticks run it once.
 *  - Only active (double opt-in confirmed) email subscribers get it; each
 *    subscriber's category filter (filters.blog.categories) is respected.
 *  - Idempotent per (subscriber, week) through the subscriptions delivery
 *    ledger (type 'blog_digest', ref = ISO week); sendSubscriberEmail adds the
 *    manage + one-click unsubscribe footer.
 *  - Nothing is sent to a subscriber when there are no new matching posts.
 */
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { isoWeekKey } from '@/lib/events-feed/notify'
import type { SubscriberDoc } from '@/lib/subscriptions/types'
import { LEARN_CATEGORIES, type LearnPostDoc } from './types'

export const DIGEST_DOW_UTC = 1 // Monday
export const DIGEST_HOUR_UTC = 9
export const DIGEST_MAX_POSTS = 8
const WEEK_MS = 7 * 24 * 3600_000

export type DigestPost = Pick<LearnPostDoc, 'id' | 'slug' | 'title' | 'summary' | 'category' | 'reading_minutes' | 'published_at'>

/** Pure: is it digest time? */
export function isDigestTime(now: Date): boolean {
  return now.getUTCDay() === DIGEST_DOW_UTC && now.getUTCHours() >= DIGEST_HOUR_UTC
}

/** Pure: posts published in the 7 days before `now`, in the subscriber's categories (none = all), newest first. */
export function selectDigestPosts(posts: readonly DigestPost[], sub: Pick<SubscriberDoc, 'filters'>, now: Date): DigestPost[] {
  const cats = sub.filters?.blog?.categories ?? []
  const from = now.getTime() - WEEK_MS
  return posts
    .filter((p) => p.published_at && Date.parse(p.published_at) > from && Date.parse(p.published_at) <= now.getTime())
    .filter((p) => !cats.length || cats.includes(p.category))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, DIGEST_MAX_POSTS)
}

const categoryLabel = (id: string) => LEARN_CATEGORIES.find((c) => c.id === id)?.label ?? id

/** Pure: email body (the shell + unsubscribe footer are added by sendSubscriberEmail). */
export function learnDigestHtml(posts: readonly DigestPost[], origin: string): string {
  const items = posts.map((p) => {
    const url = `${origin}/learn/${encodeURIComponent(p.slug)}?utm_source=digest&utm_medium=email&utm_campaign=learn_weekly`
    return `<tr><td style="padding:14px 0;border-top:1px solid #e3e7f1">
  <div style="font-size:12px;color:#4b5563">${escapeHtml(categoryLabel(p.category))} · ${p.reading_minutes} min read</div>
  <a href="${escapeHtml(url)}" style="display:block;margin:4px 0;font-size:16px;font-weight:600;color:#2F5BE7;text-decoration:none">${escapeHtml(p.title)}</a>
  <div style="font-size:14px;line-height:1.5;color:#0f1729">${escapeHtml(p.summary)}</div>
</td></tr>`
  }).join('')
  return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Here is what we published on Learn this week.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
<p style="margin:16px 0 0"><a href="${escapeHtml(origin)}/learn" style="color:#2F5BE7">Browse all posts</a></p>`
}

export interface DigestReport { week: string; posts: number; sent: number; failed: number; skipped: number; duplicate: number; deferred: number }

export async function runLearnDigest(now: Date, week = isoWeekKey(now, 'UTC')): Promise<DigestReport> {
  const rep: DigestReport = { week, posts: 0, sent: 0, failed: 0, skipped: 0, duplicate: 0, deferred: 0 }
  const { learnPosts } = await import('./store')
  const posts = (await (await learnPosts())
    .find({ status: 'published', published_at: { $gt: new Date(now.getTime() - WEEK_MS).toISOString() } }, { projection: { _id: 0, id: 1, slug: 1, title: 1, summary: 1, category: 1, reading_minutes: 1, published_at: 1 } })
    .sort({ published_at: -1 }).limit(200).toArray()) as DigestPost[]
  rep.posts = posts.length
  if (!posts.length) return rep
  const { recipientsFor, sendSubscriberEmail } = await import('@/lib/subscriptions')
  const origin = getAppOrigin()
  for (const sub of await recipientsFor('blog', 'email')) {
    const mine = selectDigestPosts(posts, sub, now)
    if (!mine.length) { rep.skipped++; continue }
    const out = await sendSubscriberEmail(sub, {
      type: 'blog_digest', ref: week, topic: 'blog',
      subject: mine.length === 1 ? `New on CodeSpectra Learn: ${mine[0].title}` : `${mine.length} new posts on CodeSpectra Learn`,
      heading: 'New on Learn this week',
      preheader: mine.map((p) => p.title).slice(0, 3).join(' · '),
      bodyHtml: learnDigestHtml(mine, origin),
      reason: 'You get this weekly email because you subscribed to new posts on CodeSpectra Learn.',
    })
    rep[out]++
  }
  return rep
}
