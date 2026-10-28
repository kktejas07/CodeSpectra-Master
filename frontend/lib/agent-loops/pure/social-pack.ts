/**
 * Social pack loop — pure picks and posting times (client-safe, tested).
 *
 * Each day the loop picks the best not-yet-posted items from the Social studio
 * queue, makes sure each has captions per network and language, and suggests
 * a posting time per network. The owner reviews the pack and posts himself
 * with the studio's share buttons: nothing is ever posted automatically.
 */
import type { CardSize, SocialItemType, SocialPlatform, SocialQueueDoc } from '@/lib/social/types'

const TYPE_WEIGHT: Partial<Record<SocialItemType, number>> = {
  hackathon: 3, contest: 3, codeathon: 3, event: 2.5, news: 2, learn: 2, certification: 1.5, company_test: 1.5, roundup: 1,
}

type PackCandidate = Pick<SocialQueueDoc, 'id' | 'type' | 'title' | 'published_at' | 'facts' | 'image_own' | 'posted_count'>

/** Score an item for today's pack, or null when it should not go in. */
export function scorePackItem(it: PackCandidate, now: Date): { score: number; reasons: string[] } | null {
  if (it.posted_count > 0 || it.type === 'digest') return null
  const weight = TYPE_WEIGHT[it.type]
  if (!weight) return null
  const reasons: string[] = [`type:${it.type}`]
  const ageDays = (now.getTime() - Date.parse(it.published_at)) / 86_400_000
  if (!Number.isFinite(ageDays) || ageDays > 7) return null
  let score = weight + Math.max(0, 1 - ageDays / 7) * 2
  if (ageDays <= 1) reasons.push('fresh')
  const due = [it.facts?.deadline, it.facts?.ends_at, it.facts?.starts_at].map((d) => (d ? Date.parse(d) : NaN)).find((t) => Number.isFinite(t))
  if (due !== undefined) {
    const days = (due - now.getTime()) / 86_400_000
    if (it.facts?.deadline && days < 0) return null // registration closed
    if (days >= 0 && days <= 10) { score += 2 - days / 10; reasons.push('soon') }
  }
  if (it.image_own) { score += 0.5; reasons.push('own_card') }
  return { score: Math.round(score * 100) / 100, reasons }
}

/** Top `n`, at most one per type (variety), skipping items packed recently. */
export function pickPack<T extends PackCandidate>(items: readonly T[], n: number, now: Date, recentlyPacked: ReadonlySet<string> = new Set()): (T & { score: number; reasons: string[] })[] {
  const scored = items
    .filter((it) => !recentlyPacked.has(it.id))
    .map((it) => ({ it, s: scorePackItem(it, now) }))
    .filter((x): x is { it: T; s: { score: number; reasons: string[] } } => !!x.s)
    .sort((a, b) => b.s.score - a.s.score || b.it.published_at.localeCompare(a.it.published_at))
  const out: (T & { score: number; reasons: string[] })[] = []
  const types = new Set<string>()
  for (const { it, s } of scored) {
    if (types.has(it.type)) continue
    types.add(it.type)
    out.push({ ...it, ...s })
    if (out.length >= n) break
  }
  return out
}

/**
 * Good posting slots per network in India time (IST, UTC+05:30), as minutes
 * after midnight. Item k gets slot k (wrapping, +1 day per wrap is avoided by
 * spacing within the day), so two pack items never share a slot.
 */
export const PLATFORM_SLOTS_IST: Record<SocialPlatform, readonly number[]> = {
  linkedin: [9 * 60, 12 * 60 + 30, 17 * 60 + 30],
  x: [10 * 60, 13 * 60, 19 * 60],
  instagram: [11 * 60, 19 * 60, 21 * 60],
  facebook: [13 * 60, 15 * 60, 20 * 60],
  whatsapp: [8 * 60 + 30, 18 * 60, 20 * 60 + 30],
  telegram: [9 * 60 + 30, 18 * 60 + 30, 21 * 60 + 30],
}
const IST_OFFSET_MIN = 330

/** Suggested posting time (UTC ISO) per network for the item at `index` on `day` (YYYY-MM-DD, India date). */
export function suggestTimes(day: string, index: number, platforms: readonly SocialPlatform[]): Record<SocialPlatform, string> {
  const [y, m, d] = day.split('-').map(Number)
  const midnightUtc = Date.UTC(y, m - 1, d) - IST_OFFSET_MIN * 60_000
  const out = {} as Record<SocialPlatform, string>
  for (const p of platforms) {
    const slots = PLATFORM_SLOTS_IST[p]
    const slot = slots[index % slots.length] + Math.floor(index / slots.length) * 30
    out[p] = new Date(midnightUtc + slot * 60_000).toISOString()
  }
  return out
}

/** Card size per network: square for Instagram posts, vertical for WhatsApp status, landscape elsewhere. */
export function cardSizeFor(p: SocialPlatform): CardSize {
  return p === 'instagram' ? 'square' : p === 'whatsapp' ? 'story' : 'landscape'
}

/** The India date of `now` (the pack's day). */
export function packDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10)
}
