/** GET /api/events-feed/admin/deliveries?type=&status= — superadmin delivery log (latest 200). */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { listDeliveries } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const p = new URL(req.url).searchParams
  const rows = await listDeliveries({ limit: 200, type: p.get('type')?.slice(0, 30) || undefined, status: p.get('status')?.slice(0, 20) || undefined })
  return NextResponse.json({ deliveries: rows })
}
