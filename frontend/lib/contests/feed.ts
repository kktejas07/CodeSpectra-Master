/**
 * Public contests → events feed rows (the `codespectra` internal source).
 * Kind comes from the format (datathon, ctf, promptathon…).
 */
import type { ExternalEvent } from '@/lib/events-feed/types'
import { buildEvent } from '@/lib/events-feed/sources/base'
import { FORMATS } from './formats'
import type { ContestDoc } from './types'

export function mapContests(rows: Pick<ContestDoc, 'id' | 'slug' | 'title' | 'summary' | 'description' | 'format' | 'schedule' | 'banner_url'>[], origin: string): ExternalEvent[] {
  return rows.map((c) => buildEvent({
    source: 'codespectra', source_id: `contest:${c.id}`, title: c.title, url: `${origin}/contests/${c.slug}`,
    organiser: 'CodeSpectra', kind: FORMATS[c.format].feedKind, mode: 'online',
    starts_at: c.schedule.starts_at, ends_at: c.schedule.ends_at,
    registration_deadline: c.schedule.registration_closes_at || c.schedule.ends_at,
    image: c.banner_url || null, raw_description: `${c.summary} ${c.description}`.slice(0, 4000),
    tags: [FORMATS[c.format].label],
    featured: true, internal: true,
  }))
}

/** Published public contests that have not ended (server). */
export async function listFeedContests(): Promise<ExternalEvent[]> {
  const { listPublicContests } = await import('./participation')
  const { getAppOrigin } = await import('@/lib/app-origin')
  const rows = (await listPublicContests()).filter((c) => c.status === 'published')
  return mapContests(rows, getAppOrigin())
}
