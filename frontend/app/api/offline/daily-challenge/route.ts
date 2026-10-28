/**
 * GET /api/offline/daily-challenge — today's daily challenge as an offline
 * pack (lib/pwa/offline-payload.ts): statement, samples, starter code; no
 * hidden tests or solutions. Signed-in only, same access rules as the
 * problem page (problem packs), never cached (private, no-store; the
 * service worker never caches /api). Submissions made offline are queued on
 * the device and POSTed to /api/submissions later, validated as usual.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { problems } from '@/lib/db/problems'
import { checkProblemAccess } from '@/lib/entitlements'
import { buildOfflinePack, dailyIndex, todayKey } from '@/lib/pwa/offline-payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'offline-daily', gate.user.id, 20, 60 * 60_000)
  if (limited) return limited
  try {
    // Offline packs are a plan feature (lib/billing/entitlement-features.ts).
    const { hasEntitlement, entitlementError } = await import('@/lib/entitlements')
    const ent = await hasEntitlement(gate.user, 'offline_packs')
    if (!ent.allowed) return NextResponse.json(entitlementError('offline_packs', ent.planKey), { status: 402, headers: NO_STORE })
    const col = await problems()
    const list = await col
      .find({ is_published: true, hackathon_id: null, visibility: { $ne: 'hackathon_only' } }, { projection: { id: 1 } })
      .sort({ id: 1 })
      .toArray()
    const day = todayKey()
    const idx = dailyIndex(day, list.length)
    if (idx < 0) return NextResponse.json({ error: 'No daily challenge today' }, { status: 404, headers: NO_STORE })
    const doc = await col.findOne({ id: list[idx].id })
    if (!doc) return NextResponse.json({ error: 'No daily challenge today' }, { status: 404, headers: NO_STORE })
    const isOwner = !!doc.created_by && doc.created_by === gate.user.id
    const access = await checkProblemAccess(gate.user, doc, isOwner)
    if (access.locked) return NextResponse.json({ error: 'This problem is part of a pack you have not unlocked' }, { status: 402, headers: NO_STORE })
    return NextResponse.json(buildOfflinePack(doc, day), { headers: NO_STORE })
  } catch (e) {
    console.error('[offline/daily-challenge] failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not prepare the offline copy. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
