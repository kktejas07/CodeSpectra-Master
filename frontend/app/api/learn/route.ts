/**
 * GET /api/learn — published Learn posts (public).
 * Query: q, category, level, tag, series, featured=1, page, limit (≤ 48).
 */
import { NextRequest, NextResponse } from 'next/server'
import { listPublished, parseListParams, publishedSeries } from '@/lib/learn/queries'
import { serverError } from '@/lib/learn/http'
import { LEARN_CATEGORIES, LEARN_LEVELS } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const params = parseListParams(req.nextUrl.searchParams)
    const [list, series] = await Promise.all([listPublished(params), req.nextUrl.searchParams.get('facets') === '1' ? publishedSeries() : Promise.resolve(undefined)])
    return NextResponse.json(
      { ...list, ...(series ? { series, categories: LEARN_CATEGORIES, levels: LEARN_LEVELS } : {}) },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (e) {
    return serverError('list', e)
  }
}
