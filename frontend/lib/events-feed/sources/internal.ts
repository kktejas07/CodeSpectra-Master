/**
 * Our own hackathons and codeathons (lib/hackathons/public-events), always on
 * and always featured. Links point at our pages (no UTM).
 */
import { getAppOrigin } from '@/lib/app-origin'
import type { ExternalEvent } from '../types'
import { buildEvent, type Connector } from './base'

export interface InternalEventRow { type: 'hackathon' | 'codeathon'; id: string; slug?: string; title: string; description: string; starts_at: string; ends_at: string; banner_url: string }

export function mapInternal(rows: InternalEventRow[], origin: string): ExternalEvent[] {
  return rows.map((e) => buildEvent({
    source: 'codespectra', source_id: `${e.type}:${e.id}`, title: e.title,
    url: e.type === 'hackathon' && e.slug ? `${origin}/hackathons/${e.slug}` : `${origin}/dashboard/codeathons/${e.id}`,
    organiser: 'CodeSpectra', kind: e.type, mode: 'online', starts_at: e.starts_at, ends_at: e.ends_at,
    registration_deadline: e.ends_at, image: e.banner_url || null, raw_description: e.description,
    featured: true, internal: true,
  }))
}

export const internal: Connector = {
  id: 'codespectra', label: 'CodeSpectra events', homepage: '/hackathons', access: 'internal',
  terms: 'Our own events.', defaultEnabled: true, needsPermission: false,
  async fetch() {
    const { listPublicEvents } = await import('@/lib/hackathons/public-events')
    const own = mapInternal(await listPublicEvents(), getAppOrigin())
    // Hosted contests (lib/contests) publish with their format's kind.
    const contests = await import('@/lib/contests/feed').then((m) => m.listFeedContests()).catch(() => [] as ExternalEvent[])
    return [...own, ...contests]
  },
}
