/** GET /api/marketplace/products?q&kind&category&currency&min&max&rating&seller&sort&page — public catalog. */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { browseProducts, parseBrowseParams } from '@/lib/marketplace/catalog'
import { errorResponse } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'mkt-browse', null, 120, 60_000)
  if (limited) return limited
  try {
    return NextResponse.json(await browseProducts(parseBrowseParams(Object.fromEntries(req.nextUrl.searchParams))))
  } catch (e) {
    return errorResponse(e, 'browse')
  }
}
