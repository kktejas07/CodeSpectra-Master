/**
 * Fill the social queue from the existing collections (server only).
 *
 *   syncSocialQueue(now)          every source, last BACKFILL_DAYS days (the
 *                                 "social-queue" system automation runs it, and
 *                                 the studio's "Check for new items" button)
 *   enqueueFromEvent(type, payload) the publish hooks' automation events
 *                                 (learn.post.published, events_feed.new_event)
 *
 * Each source is read on its own (one failing never blocks the others) and
 * every write is an idempotent upsert keyed by `${type}:${ref_id}`.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import {
  BACKFILL_DAYS, dedupeQueueInputs, fromCompanyPattern, fromContest, fromFeedEvent, fromLearnPost, fromNewsPost, fromOwnEvent, fromProgram, fromTeamPost, inWindow,
  type BlogRow, type ContestRow, type FeedRow, type LearnRow, type PatternRow, type ProgramRow,
} from './queue'
import { upsertQueueItems } from './store'
import type { QueueInput } from './types'

const LIMIT = 300

export interface SyncReport { seen: number; created: number; failed: string[] }

export async function collectRecent(now: Date, days = BACKFILL_DAYS): Promise<{ items: QueueInput[]; failed: string[] }> {
  const origin = getAppOrigin()
  const since = new Date(now.getTime() - days * 86_400_000)
  const sinceIso = since.toISOString()
  const db = await getMongoDb()
  const failed: string[] = []
  const all: (QueueInput | null)[] = []
  const source = async (name: string, fn: () => Promise<(QueueInput | null)[]>) => {
    try {
      all.push(...(await fn()))
    } catch (e) {
      failed.push(name)
      console.error(`[social] sync ${name}:`, (e as Error)?.message)
    }
  }

  await source('events', async () => {
    const rows = await db.collection('events_feed').find({ status: 'published', internal: { $ne: true }, first_seen_at: { $gte: sinceIso } }, { projection: { _id: 0 } }).sort({ first_seen_at: -1 }).limit(LIMIT).toArray()
    return rows.map((r) => fromFeedEvent(r as unknown as FeedRow, origin, now))
  })
  await source('blog', async () => {
    const rows = (await db.collection('blog_posts').find({ status: 'published', published_at: { $gte: sinceIso } }, { projection: { _id: 0, body: 0 } }).sort({ published_at: -1 }).limit(LIMIT).toArray()) as unknown as BlogRow[]
    const { isNewsPost } = await import('@/lib/learn/team-posts')
    const { teamPublicPaths } = await import('@/lib/learn/team-queries')
    const paths = await teamPublicPaths(rows as never)
    return rows.map((p) => (isNewsPost(p) ? fromNewsPost(p, origin) : fromTeamPost(p, paths.get(p.slug) || '', origin)))
  })
  await source('learn', async () => {
    const rows = await db.collection('learn_posts').find({ status: 'published', published_at: { $gte: sinceIso } }, { projection: { _id: 0, body: 0 } }).sort({ published_at: -1 }).limit(LIMIT).toArray()
    return rows.map((r) => fromLearnPost(r as unknown as LearnRow, origin))
  })
  await source('contests', async () => {
    const rows = await db.collection('contests').find({ status: 'published', visibility: 'public', published_at: { $gte: sinceIso } }, { projection: { _id: 0 } }).limit(LIMIT).toArray()
    return rows.map((r) => fromContest(r as unknown as ContestRow, origin, now))
  })
  await source('own-events', async () => {
    // Open / upcoming hackathons and codeathons (their listing has no publish time: queued when first seen).
    const { listPublicEvents } = await import('@/lib/hackathons/public-events')
    return (await listPublicEvents(now)).map((e) => fromOwnEvent(e, origin, now))
  })
  await source('certifications', async () => {
    const rows = await db.collection('pro_cert_programs').find({ status: 'published', published_at: { $gte: sinceIso } }, { projection: { _id: 0 } }).limit(LIMIT).toArray()
    return rows.map((r) => fromProgram(r as unknown as ProgramRow, origin))
  })
  await source('company-tests', async () => {
    const rows = await db.collection('company_exam_patterns').find({ active: true, verified: true, createdAt: { $gte: sinceIso } }, { projection: { _id: 0 } }).limit(LIMIT).toArray()
    const { COMPANY_CATALOG } = await import('@/lib/companies/company-catalog')
    const slugs = new Set(COMPANY_CATALOG.map((c) => c.slug))
    return rows.map((r) => fromCompanyPattern(r as unknown as PatternRow, origin, slugs))
  })

  return { items: dedupeQueueInputs(all).filter((it) => inWindow(it, since)), failed }
}

export async function syncSocialQueue(now = new Date(), days = BACKFILL_DAYS): Promise<SyncReport> {
  const { items, failed } = await collectRecent(now, days)
  const created = await upsertQueueItems(items, now)
  return { seen: items.length, created, failed }
}

/** One item straight from a publish hook's automation event. Never throws. */
export async function enqueueFromEvent(type: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const db = await getMongoDb()
    const origin = getAppOrigin()
    const now = new Date()
    let it: QueueInput | null = null
    if (type === 'learn.post.published' && typeof payload.post_id === 'string') {
      const row = await db.collection('learn_posts').findOne({ id: payload.post_id }, { projection: { _id: 0, body: 0 } })
      it = row ? fromLearnPost(row as unknown as LearnRow, origin) : null
    } else if (type === 'events_feed.new_event' && typeof payload.event_id === 'string') {
      const row = await db.collection('events_feed').findOne({ id: payload.event_id }, { projection: { _id: 0 } })
      it = row ? fromFeedEvent(row as unknown as FeedRow, origin, now) : null
    }
    if (!it) return false
    return (await upsertQueueItems([it], now)) > 0
  } catch (e) {
    console.error('[social] enqueue:', (e as Error)?.message)
    return false
  }
}
