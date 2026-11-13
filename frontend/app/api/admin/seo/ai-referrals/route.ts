/** GET /api/admin/seo/ai-referrals?preset=30d — visits referred by AI assistants (superadmin). */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { dayKeys, parseRange } from '@/lib/analytics/range'
import { loadAiReferrals } from '@/lib/seo/ai-referrals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const preset = req.nextUrl.searchParams.get('preset')
    const range = parseRange({ preset: preset === '7d' || preset === '90d' ? preset : '30d' })
    return NextResponse.json(await loadAiReferrals(dayKeys(range)), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[admin/seo] ai referrals failed:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
