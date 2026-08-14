import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()

    const submissions = await db.collection('exam_submissions')
      .find({ max_score: { $gt: 0 } })
      .project({ score: 1, max_score: 1 })
      .toArray()

    const buckets: Record<string, number> = {
      '0-20': 0,
      '20-40': 0,
      '40-60': 0,
      '60-80': 0,
      '80-100': 0,
    }

    let totalScore = 0

    for (const sub of submissions) {
      const pct = Math.round(((sub.score || 0) / (sub.max_score || 1)) * 100)
      totalScore += pct
      if (pct < 20) buckets['0-20']++
      else if (pct < 40) buckets['20-40']++
      else if (pct < 60) buckets['40-60']++
      else if (pct < 80) buckets['60-80']++
      else buckets['80-100']++
    }

    const distribution = Object.entries(buckets).map(([range, count]) => ({ range, count }))
    const total = submissions.length
    const avgScore = total > 0 ? Math.round(totalScore / total) : 0

    return NextResponse.json({ distribution, total, avgScore })
  } catch (e) {
    console.error('[analytics scores] error:', e)
    return NextResponse.json({ error: 'Failed to compute score distribution' }, { status: 500 })
  }
}
