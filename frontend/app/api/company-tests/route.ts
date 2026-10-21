/**
 * Public: the practice tests for a company page — each active pattern's
 * sections and which of Easy / Moderate / Tough are ready. No questions or
 * question ids. GET ?company=<slug> or ?pattern=<id>
 */
import { NextResponse, type NextRequest } from 'next/server'
import { getPattern, listPatterns, versions } from '@/lib/company-tests/db'
import { PRACTICE_LEVELS, patternTotals, versionSummary, type CompanyTestVersion } from '@/lib/company-tests/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const company = (sp.get('company') || '').trim().toLowerCase()
  const patternId = (sp.get('pattern') || '').trim().toLowerCase()
  const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/
  if (!SLUG.test(company) && !SLUG.test(patternId)) return NextResponse.json({ error: 'Give a company or a pattern' }, { status: 400 })
  try {
    const list = SLUG.test(patternId)
      ? [await getPattern(patternId)].filter((p): p is NonNullable<typeof p> => !!p && p.active)
      : await listPatterns({ companySlug: company, activeOnly: true })
    const vs = list.length
      ? await (await versions()).find({ patternId: { $in: list.map((p) => p.id) } }, { projection: { _id: 0 } }).toArray()
      : []
    const byId = new Map<string, CompanyTestVersion>(vs.map((v) => [v.id, v]))
    const items = list.map((p) => ({
      id: p.id,
      examName: p.examName,
      companyName: p.companyName,
      companySlug: p.companySlug,
      verified: p.verified,
      lastReviewed: p.lastReviewed ?? null,
      sourceUrl: p.sourceUrl ?? null,
      negativeMarking: p.negativeMarking,
      cutoffPercent: p.cutoffPercent,
      totals: patternTotals(p),
      sections: p.sections.map((s) => ({ name: s.name, questionCount: s.questionCount, timeMinutes: s.timeMinutes, categories: s.categories })),
      levels: PRACTICE_LEVELS.map((l) => {
        const s = versionSummary(p, l, byId.get(`${p.id}:${l}`))
        return { level: l, ready: s.questions > 0, complete: s.complete }
      }),
    }))
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (e) {
    console.error('[company-tests] GET:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load practice tests.' }, { status: 500 })
  }
}
