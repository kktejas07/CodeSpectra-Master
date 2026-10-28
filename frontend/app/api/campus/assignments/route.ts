/** GET /api/campus/assignments — the college's company-practice assignments with completion (placement team, CORE-048). */
import { NextResponse } from 'next/server'
import { guarded, withStaff } from '@/lib/campus/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('assignments GET', () => withStaff(req, async (ctx) => {
    const { listAssignments } = await import('@/lib/assistants/placement/service')
    const items = await listAssignments(ctx, 20)
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  }))
}
