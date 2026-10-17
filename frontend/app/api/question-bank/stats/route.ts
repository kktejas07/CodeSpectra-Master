import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { questionBank } from '@/lib/question-bank'
import { BRANCHES, DEGREE_TYPES } from '@/lib/engineering-catalog'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Bank docs carry answer keys and test cases — staff only (exams sample from here).
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const col = await questionBank()
    const branchParam = new URL(request.url).searchParams.get('branch')?.trim().toLowerCase() || ''

    const base: Record<string, unknown> = {}
    if (branchParam) base.branch = branchParam

    const [total, byDifficulty, byType, byBranch, byDegree] = await Promise.all([
      col.countDocuments(base),
      col.aggregate<{ _id: string; count: number }>([
        { $match: base },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]).toArray(),
      col.aggregate<{ _id: string; count: number }>([
        { $match: base },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]).toArray(),
      col.aggregate<{ _id: string; count: number }>([
        { $match: { ...base, branch: { $ne: '', $exists: true } } },
        { $group: { _id: '$branch', count: { $sum: 1 } } },
      ]).toArray(),
      col.aggregate<{ _id: string; count: number }>([
        { $match: { ...base, degree_type: { $ne: '', $exists: true } } },
        { $group: { _id: '$degree_type', count: { $sum: 1 } } },
      ]).toArray(),
    ])

    const toMap = (rows: { _id: string; count: number }[]) => {
      const m: Record<string, number> = {}
      for (const r of rows) if (r._id) m[r._id] = r.count
      return m
    }

    return NextResponse.json({
      total,
      byDifficulty: toMap(byDifficulty),
      byType: toMap(byType),
      byBranch: toMap(byBranch),
      byDegree: toMap(byDegree),
      branchCatalog: BRANCHES.map((b) => ({ id: b.id, label: b.label, short: b.short })),
      degreeCatalog: DEGREE_TYPES.map((d) => ({ id: d.id, label: d.label })),
    })
  } catch (e) {
    console.error('[question-bank/stats] error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
