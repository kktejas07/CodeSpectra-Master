import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getAiUsageSummary, type AiUsageDoc } from '@/lib/ai/cost-tracking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const days = Number(new URL(req.url).searchParams.get('days')) || 30
    const summary = await getAiUsageSummary({ days })

    // Latest flagged prompts (injectionFlags non-empty). Docs carry flags +
    // metadata only — prompt text is never stored, so this is safe to return.
    let flagged: unknown[] = []
    try {
      const { getMongoDb } = await import('@/lib/mongodb')
      const col = (await getMongoDb()).collection<AiUsageDoc>('ai_usage')
      const docs = await col
        .find({ injectionFlags: { $exists: true, $ne: [] } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()
      flagged = JSON.parse(JSON.stringify(docs))
    } catch {
      flagged = []
    }

    return NextResponse.json({ summary, flagged })
  } catch (e: unknown) {
    console.error('[CodeSpectra] /api/admin/platform/ai-usage GET:', e)
    return NextResponse.json({ error: 'Failed to fetch AI usage data' }, { status: 500 })
  }
}
