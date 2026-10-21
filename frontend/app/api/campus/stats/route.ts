/** GET /api/campus/stats — placement statistics per graduation year (placement team only). */
import { NextResponse } from 'next/server'
import { guarded, withStaff } from '@/lib/campus/access'
import { collegeStats } from '@/lib/campus/drives'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('stats GET', () => withStaff(req, async (ctx) => NextResponse.json({ years: await collegeStats(ctx) }, { headers: { 'Cache-Control': 'no-store' } })))
}
