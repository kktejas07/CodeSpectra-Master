import { NextResponse } from 'next/server'
import { hackathons } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const items: any[] = []

  // Get hackathons (non-draft, non-closed)
  try {
    const col = await hackathons()
    const hEvents = await col
      .find({ status: { $in: ['open', 'live'] } }, { projection: { _id: 0 } })
      .sort({ starts_at: -1 })
      .toArray()

    for (const h of hEvents) {
      items.push({
        type: 'hackathon',
        id: h.id,
        slug: h.slug,
        title: h.name,
        description: h.description || '',
        status: h.status,
        starts_at: h.starts_at,
        ends_at: h.ends_at,
        duration: `${h.timeout_minutes} min`,
        participants: h.num_teams,
        tasks_count: h.tasks?.length || 0,
        banner_url: h.banner_url || '',
      })
    }
  } catch { /* ignore */ }

  // Get codeathons (live only)
  try {
    const db = await getMongoDb()
    const cEvents = await db
      .collection('codeathons')
      .find({ status: { $in: ['upcoming', 'live'] } })
      .sort({ startDate: -1 })
      .toArray()

    for (const c of cEvents) {
      const startMs = new Date(c.startDate).getTime()
      const endMs = new Date(c.endDate).getTime()
      const durationMs = endMs - startMs
      const hours = Math.round(durationMs / 3600000)
      items.push({
        type: 'codeathon',
        id: c._id?.toString() || c.id,
        title: c.title,
        description: c.description || '',
        status: c.status,
        starts_at: c.startDate,
        ends_at: c.endDate,
        duration: `${hours}h`,
        participants: c.participants || 0,
        tasks_count: c.problems?.length || 0,
        banner_url: '',
      })
    }
  } catch { /* ignore */ }

  items.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  return NextResponse.json({ items })
}
