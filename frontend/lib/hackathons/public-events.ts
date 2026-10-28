/**
 * Public event listing (hackathons + codeathons) shared by GET
 * /api/public/events and the /events server page — the page calls this
 * directly instead of fetching its own API (a relative fetch fails on the
 * server).
 *
 * Status fields are only refreshed when an event is read, so the listing
 * filters on dates: an event shows until its end time unless it is a draft
 * or was closed by hand.
 */
import { hackathons } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'

export interface PublicEvent {
  type: 'hackathon' | 'codeathon'
  id: string
  slug?: string
  title: string
  description: string
  status: string
  starts_at: string
  ends_at: string
  duration: string
  participants: number
  tasks_count: number
  banner_url: string
}

export async function listPublicEvents(now = new Date()): Promise<PublicEvent[]> {
  const items: PublicEvent[] = []
  const nowIso = now.toISOString()

  try {
    const hEvents = await (await hackathons())
      .find({ status: { $in: ['open', 'live'] }, ends_at: { $gt: nowIso } }, { projection: { _id: 0 } })
      .sort({ starts_at: -1 })
      .limit(200)
      .toArray()
    for (const h of hEvents) {
      items.push({
        type: 'hackathon',
        id: h.id,
        slug: h.slug,
        title: h.name,
        description: h.description || '',
        status: new Date(h.starts_at).getTime() <= now.getTime() ? 'live' : 'open',
        starts_at: h.starts_at,
        ends_at: h.ends_at,
        duration: `${h.timeout_minutes} min`,
        participants: h.num_teams,
        tasks_count: h.tasks?.length || 0,
        banner_url: h.banner_url || '',
      })
    }
  } catch { /* listing is best-effort per source */ }

  try {
    const db = await getMongoDb()
    // Admins set `upcoming` / `active` (older docs may say `live`).
    const cEvents = await db
      .collection('codeathons')
      .find({ status: { $in: ['upcoming', 'active', 'live'] } })
      .sort({ startDate: -1 })
      .limit(200)
      .toArray()
    for (const c of cEvents) {
      const startMs = new Date(c.startDate).getTime()
      const endMs = new Date(c.endDate).getTime()
      if (Number.isFinite(endMs) && endMs < now.getTime()) continue
      const hours = Number.isFinite(endMs - startMs) ? Math.round((endMs - startMs) / 3600000) : 0
      items.push({
        type: 'codeathon',
        id: c._id?.toString() || String(c.id),
        title: String(c.title || 'Codeathon'),
        description: String(c.description || ''),
        status: startMs <= now.getTime() ? 'live' : 'upcoming',
        starts_at: String(c.startDate),
        ends_at: String(c.endDate),
        duration: `${hours}h`,
        participants: Array.isArray(c.participants) ? c.participants.length : Number(c.participants) || 0,
        tasks_count: c.problems?.length || 0,
        banner_url: '',
      })
    }
  } catch { /* ignore */ }

  items.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  return items
}
