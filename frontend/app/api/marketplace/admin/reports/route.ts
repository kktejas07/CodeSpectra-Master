import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { adminGate, errorResponse, json } from '@/lib/marketplace/seller-api'

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv&kind=summary|sellers|products|orders] */
export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const { buildReport, parseRange, reportCsv } = await import('@/lib/marketplace/reports')
    const range = parseRange(sp.get('from'), sp.get('to'))
    if (sp.get('format') === 'csv') {
      const kind = (['summary', 'sellers', 'products', 'orders'] as const).find((k) => k === sp.get('kind')) ?? 'summary'
      const csv = await reportCsv(range, kind)
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="marketplace-${kind}-${range.from.slice(0, 10)}-${range.to.slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store' } })
    }
    return json(await buildReport(range))
  } catch (e) {
    return errorResponse(e, 'reports')
  }
}
