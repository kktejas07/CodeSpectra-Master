import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'security_scans'
const KEEP = 20

interface ImageResult {
  image: string
  highCritical: number
  critical: number
  topCrit: string[]
}

interface ScanReport {
  ranAt: string
  durationSec?: number
  images: ImageResult[]
  clamav: { infected: string[]; scanned?: number | null }
  freshclam?: string
}

/** POST /api/cron/security-scan?secret=CRON_SECRET — ingest weekly scan report (server cron). */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const expected = process.env.CRON_SECRET?.trim() || ''
    const fromQuery = url.searchParams.get('secret') || ''
    if (!expected || fromQuery !== expected) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as Partial<ScanReport>
    if (!Array.isArray(body.images)) {
      return NextResponse.json({ error: 'images[] required' }, { status: 400 })
    }
    const db = await getMongoDb()
    const col = db.collection(COL)
    const doc = {
      ranAt: typeof body.ranAt === 'string' ? body.ranAt : new Date().toISOString(),
      durationSec: typeof body.durationSec === 'number' ? body.durationSec : null,
      images: body.images.slice(0, 100).map((i) => ({
        image: String(i.image || '').slice(0, 200),
        highCritical: Number(i.highCritical) || 0,
        critical: Number(i.critical) || 0,
        topCrit: Array.isArray(i.topCrit) ? i.topCrit.map(String).slice(0, 15) : [],
      })),
      clamav: {
        infected: Array.isArray(body.clamav?.infected)
          ? body.clamav.infected.map(String).slice(0, 100)
          : [],
        scanned: typeof body.clamav?.scanned === 'number' ? body.clamav.scanned : null,
      },
      freshclam: typeof body.freshclam === 'string' ? body.freshclam.slice(0, 120) : null,
      createdAt: new Date().toISOString(),
    }
    await col.insertOne(doc as never)
    // Keep only the newest KEEP reports.
    const extras = await col
      .find({})
      .sort({ createdAt: -1 })
      .skip(KEEP)
      .project({ _id: 1 })
      .toArray()
    if (extras.length > 0) {
      await col.deleteMany({ _id: { $in: extras.map((e) => e._id) } })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cron/security-scan] ingest error:', e)
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}

/** GET — latest report + lightweight history (superadmin). */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const db = await getMongoDb()
  const col = db.collection(COL)
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(KEEP).toArray()
  const [latest, ...rest] = docs.map((d: any) => ({ ...d, _id: String(d._id) }))
  return NextResponse.json({
    latest: latest || null,
    history: rest.map((d: any) => ({
      ranAt: d.ranAt,
      createdAt: d.createdAt,
      images: (d.images || []).length,
      critical: (d.images || []).reduce((n: number, i: any) => n + (i.critical || 0), 0),
      infected: (d.clamav?.infected || []).length,
    })),
  })
}
