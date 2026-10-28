/** GET /api/admin/seo/health — SEO health report (superadmin). */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { buildHealthReport } from '@/lib/seo/health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    return NextResponse.json(await buildHealthReport())
  } catch (e) {
    console.error('[admin/seo] health failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Failed to build the SEO report' }, { status: 500 })
  }
}
