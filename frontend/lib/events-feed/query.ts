/**
 * Server-side reads for the public pages and APIs. Our own hackathons /
 * codeathons are always included as featured — straight from their source if
 * the pipeline hasn't stored them yet, so a new event shows up immediately.
 */
import { feedCol } from './store'
import { mapInternal } from './sources/internal'
import { toPublic, sortEvents } from './public'
import type { FeedEventDoc, PublicFeedEvent } from './types'
import { getAppOrigin } from '@/lib/app-origin'
import { feedId } from './pipeline'
import { canonicalUrl } from './normalize'

/** `strict`: a failed feed read throws instead of returning [] (cached callers must not cache an outage as "no events"). */
export async function listPublishedFeed(now = new Date(), limit = 1000, opts: { strict?: boolean } = {}): Promise<PublicFeedEvent[]> {
  let stored: FeedEventDoc[] = []
  try {
    stored = (await (await feedCol()).find({ status: 'published' }, { projection: { _id: 0 } }).sort({ starts_at: 1 }).limit(limit).toArray()) as FeedEventDoc[]
  } catch (e) {
    if (opts.strict) throw e
    console.error('[events-feed] list failed:', (e as Error).message)
  }
  const nowIso = now.toISOString()
  const out = stored.filter((d) => !d.ends_at || d.ends_at >= nowIso).map(toPublic)
  // Our own events not yet in the feed collection (or hidden there → skipped).
  try {
    const { listPublicEvents } = await import('@/lib/hackathons/public-events')
    const internal = mapInternal(await listPublicEvents(now), getAppOrigin())
    const known = new Set(stored.map((d) => d.url_key))
    let hidden = new Set<string>()
    const ids = internal.map((e) => feedId(canonicalUrl(e.url)))
    const rows = (await (await feedCol()).find({ id: { $in: ids }, status: { $ne: 'published' } }, { projection: { _id: 0, url_key: 1 } }).toArray()) as FeedEventDoc[]
    hidden = new Set(rows.map((r) => r.url_key))
    for (const e of internal) {
      const key = canonicalUrl(e.url)
      if (known.has(key) || hidden.has(key)) continue
      out.push({
        id: feedId(key), title: e.title, url: e.url, organiser: e.organiser, kind: e.kind, mode: e.mode, city: null, country: null,
        starts_at: e.starts_at, ends_at: e.ends_at, registration_deadline: e.registration_deadline, prize_text: null, prize_usd_minor: null,
        themes: e.themes, image: e.image, summary: e.description_summary, featured: true, internal: true, source: 'codespectra', student_friendly: true,
      })
    }
  } catch { /* our own listing is best-effort here */ }
  return sortEvents(out)
}

export async function getFeedEvent(id: string): Promise<FeedEventDoc | null> {
  if (!/^ef_[a-f0-9]{16}$/.test(id)) return null
  return (await (await feedCol()).findOne({ id }, { projection: { _id: 0 } })) as FeedEventDoc | null
}
