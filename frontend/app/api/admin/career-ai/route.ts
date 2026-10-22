/**
 * Career AI caps (superadmin): résumé writing help on/off, platform daily
 * calls, per-learner daily calls, monthly cost cap, estimated cost per call.
 *   GET -> { settings, usage }     PUT { …patch } -> { settings }
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getCareerAi, saveCareerAi } from '@/lib/career-ai/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await requireSuperAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    const { usage, ...settings } = await getCareerAi()
    return NextResponse.json({ settings, usage }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[admin/career-ai] GET', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the settings' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const g = await requireSuperAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  try {
    return NextResponse.json({ settings: await saveCareerAi(await req.json().catch(() => null), g.user.id) })
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 400) return NextResponse.json({ error: (e as Error).message }, { status })
    console.error('[admin/career-ai] PUT', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the settings' }, { status: 500 })
  }
}
