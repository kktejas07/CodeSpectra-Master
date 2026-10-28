/**
 * Cached public league data for /leagues and /leagues/colleges/[slug]
 * (unstable_cache with a tag, same rules as lib/cache/public-data.ts: a DB
 * error throws so nothing bad is cached; unknown slugs are not cached).
 * Public shapes never carry user ids or emails.
 */
import 'server-only'
import { unstable_cache } from 'next/cache'
import { hitOnly } from '@/lib/cache/public-data'
import { listSeasons, pickCurrent, seasonBoards } from './service'
import { seasonPhase, type SeasonDoc } from './types'

export const LEAGUES_TAG = 'public:leagues'
const TTL = 600

export interface PublicSeason { id: string; slug: string; name: string; starts_at: string; ends_at: string; phase: ReturnType<typeof seasonPhase> }
export interface PublicBoards {
  season: PublicSeason
  computed_at: string
  events: number
  colleges: Array<{ rank: number; name: string; slug: string | null; points: number; scoring_students: number }>
  teams: Array<{ rank: number; name: string; points: number; events: number; members: number; college: string | null }>
  individuals: Array<{ rank: number; name: string; points: number; events: number; college: string | null }>
}

const pubSeason = (s: SeasonDoc): PublicSeason => ({ id: s.id, slug: s.slug, name: s.name, starts_at: s.starts_at, ends_at: s.ends_at, phase: seasonPhase(s) })

async function boardsFor(s: SeasonDoc): Promise<PublicBoards> {
  const snap = await seasonBoards(s)
  const cName = new Map(snap.colleges.map((c) => [c.college_id, c.name]))
  return {
    season: pubSeason(s),
    computed_at: snap.computed_at,
    events: snap.events,
    colleges: snap.colleges.slice(0, 200).map((c) => ({ rank: c.rank, name: c.name, slug: c.slug, points: c.points, scoring_students: c.scoring_students })),
    teams: snap.teams.slice(0, 100).map((t) => ({ rank: t.rank, name: t.name, points: t.points, events: t.events, members: t.members, college: t.college_id ? cName.get(t.college_id) ?? null : null })),
    individuals: snap.individual.slice(0, 100).map((r) => ({ rank: r.rank, name: r.name, points: r.points, events: r.events, college: r.college_id ? cName.get(r.college_id) ?? null : null })),
  }
}

/** Season list + the boards of the requested (or current) season. */
export const leaguesOverviewCached = unstable_cache(async (seasonSlug: string | null) => {
  const seasons = await listSeasons({ publicOnly: true })
  const chosen = (seasonSlug ? seasons.find((s) => s.slug === seasonSlug) : null) ?? pickCurrent(seasons)
  return { seasons: seasons.map(pubSeason), boards: chosen ? await boardsFor(chosen) : null }
}, ['public-leagues-overview-v1'], { revalidate: TTL, tags: [LEAGUES_TAG] })

/** One college across the current season (null = unknown or not on the public league). */
export const collegeLeagueCached = hitOnly(async (slug: string) => {
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const college = await db.collection('campus_colleges').findOne({ slug, league_public: { $ne: false } }, { projection: { _id: 0, tenant_id: 1, name: 1, slug: 1, city: 1, state: 1 } })
  if (!college) return null
  const seasons = await listSeasons({ publicOnly: true })
  const current = pickCurrent(seasons)
  if (!current) return { college: { name: String(college.name), slug: String(college.slug), city: college.city ?? null, state: college.state ?? null }, season: null, standing: null, members: [], teams: [] }
  const snap = await seasonBoards(current)
  const id = String(college.tenant_id)
  const standing = snap.colleges.find((c) => c.college_id === id) ?? null
  return {
    college: { name: String(college.name), slug: String(college.slug), city: college.city ?? null, state: college.state ?? null },
    season: pubSeason(current),
    standing: standing ? { rank: standing.rank, points: standing.points, scoring_students: standing.scoring_students, of: snap.colleges.length } : null,
    members: snap.individual.filter((r) => r.college_id === id).slice(0, 25).map((r) => ({ rank: r.rank, name: r.name, points: r.points, events: r.events })),
    teams: snap.teams.filter((t) => t.college_id === id).slice(0, 25).map((t) => ({ rank: t.rank, name: t.name, points: t.points, members: t.members })),
  }
}, 'public-leagues-college-v1', [LEAGUES_TAG], TTL)

/** Purge the cached league pages (admin edits, recompute, finalise). Never throws. */
export async function revalidateLeagues(): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import('next/cache')
    revalidateTag(LEAGUES_TAG, 'max')
    revalidatePath('/leagues')
    revalidatePath('/leagues/colleges/[slug]', 'page')
  } catch { /* outside a request: TTL refresh */ }
}
