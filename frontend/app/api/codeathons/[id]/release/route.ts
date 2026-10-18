/**
 * /api/codeathons/[id]/release — staff only (superadmin, or the owning
 * tenant's admin; a tenant admin without a tenant owns nothing).
 *
 *   GET   → preview: final standings as they would be released, warnings
 *           (not ended / submissions still being graded), current state.
 *   POST  → release. Body: { force?: boolean, certificate_policy?: {...} }.
 *           Without force, warnings come back as 409 { code: 'confirm_release' }.
 *           On a released codeathon, { reissue: true } re-runs certificates +
 *           XP from the frozen snapshot (idempotent; notifies only new certs).
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { previewCodeathonRelease, releaseCodeathonResults } from '@/lib/services/codeathons'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// Staff check, standings, guard rails, snapshot, certificates and XP live in
// lib/services/codeathons (shared with the admin agent).

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const r = await previewCodeathonRelease(user, id)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    return NextResponse.json(r.data)
  } catch (e) {
    console.error('[codeathon release] preview failed:', e)
    return NextResponse.json({ error: 'Could not load the results preview' }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { force?: unknown; reissue?: unknown; certificate_policy?: unknown }
  try {
    const r = await releaseCodeathonResults(user, id, body)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    return NextResponse.json(r.data)
  } catch (e) {
    console.error('[codeathon release] failed:', id, e)
    return NextResponse.json({ error: 'Could not release results' }, { status: 500 })
  }
}
