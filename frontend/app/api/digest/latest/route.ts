/**
 * GET /api/digest/latest — the newest published daily digest, trimmed for the
 * learner home card: date, item count, section counts and the top 5 picks
 * (title, category, on-site path). Public data only; cached (lib/digest/cached).
 */
import { NextResponse } from 'next/server'
import { latestDigestCached } from '@/lib/digest/cached'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, '') || '/'

export async function GET() {
  try {
    const d = await latestDigestCached()
    if (!d) return NextResponse.json({ digest: null }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
    const items = [...d.items].sort((a, b) => a.rank - b.rank).slice(0, 5).map((i) => ({ key: i.key, title: i.title, category: i.category, path: pathOf(i.url), deadline: i.deadline }))
    return NextResponse.json(
      { digest: { date: d.date, count: d.items.length, sections: d.sections, items, path: `/digest/${d.date}` } },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
    )
  } catch (e) {
    console.error('[digest] latest:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
