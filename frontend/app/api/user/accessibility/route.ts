/**
 * The signed-in user's accessibility settings (lib/accessibility.ts).
 * GET → { settings } · PUT { text_size?, contrast?, motion?, font? } → { settings }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { normalizeA11y } from '@/lib/accessibility'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
let indexed = false

async function col() {
  const db = await getMongoDb()
  const c = db.collection('accessibility_settings')
  if (!indexed) { indexed = true; await c.createIndex({ user_id: 1 }, { unique: true, name: 'a11y_user' }).catch(() => { indexed = false }) }
  return c
}

export async function GET() {
  const a = await requireAuth()
  if ('error' in a) return NextResponse.json({ error: a.error, code: 'unauthorized' }, { status: a.status })
  const row = await (await col()).findOne({ user_id: a.user.id }, { projection: { _id: 0 } })
  return NextResponse.json({ settings: normalizeA11y(row) }, { headers: NO_STORE })
}

export async function PUT(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return NextResponse.json({ error: a.error, code: 'unauthorized' }, { status: a.status })
  const limited = await limitRequest(req, 'a11y-settings', a.user.id, 60, 60_000)
  if (limited) return limited
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json(apiErrorBody('Invalid JSON', 'invalid_json'), { status: 400 })
  const c = await col()
  const current = normalizeA11y(await c.findOne({ user_id: a.user.id }, { projection: { _id: 0 } }))
  const settings = normalizeA11y({ ...current, ...(body as Record<string, unknown>) })
  await c.updateOne({ user_id: a.user.id }, { $set: { ...settings, user_id: a.user.id, updated_at: new Date().toISOString() } }, { upsert: true })
  return NextResponse.json({ settings }, { headers: NO_STORE })
}
