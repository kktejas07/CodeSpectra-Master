/** GET /api/campus/readiness?department&batch&format=csv — batch readiness (placement team). */
import { NextResponse } from 'next/server'
import { guarded, withStaff } from '@/lib/campus/access'
import { batchReadiness } from '@/lib/campus/drives'
import { readinessCsv } from '@/lib/campus/export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('readiness GET', () => withStaff(req, async (ctx) => {
    const p = new URL(req.url).searchParams
    const r = await batchReadiness(ctx, { department: p.get('department'), batch: p.get('batch') })
    if (p.get('format') === 'csv') {
      return new Response(readinessCsv(r.students, r.groups, ctx.college), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="readiness-${ctx.college.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  }))
}
