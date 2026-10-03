import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { detectPlagiarism } from '@/lib/proctoring/plagiarism-detector'
import { detectLeaks } from '@/lib/proctoring/leak-detector'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ponytail: on-demand only (button in results header). This used to run
// inside GET results on every page load — two sequential LLM batches with
// unbounded parallelism — stalling the page up to ~30s for data no UI read.
// Cap the whole run; partial (deterministic pairs found before the cap) is
// still returned rather than failing the check outright.
const MAX_RUN_MS = 120000

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await params

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

    const run = (async () => {
      const [plagiarism, leaks] = await Promise.all([detectPlagiarism(examId), detectLeaks(examId)])
      return { plagiarism, leaks }
    })()
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), MAX_RUN_MS))
    const result = await Promise.race([run, timeout])
    if (!result) {
      return NextResponse.json({ error: 'Plagiarism check timed out after 120s — try again with fewer submissions' }, { status: 504 })
    }

    // Resolve user ids to names for display.
    const ids = new Set<string>()
    for (const p of result.plagiarism.suspiciousPairs) {
      ids.add(p.userId1)
      ids.add(p.userId2)
    }
    for (const f of result.plagiarism.aiGeneratedFlags) ids.add(f.userId)
    for (const m of result.plagiarism.questionBankMatches) ids.add(m.userId)
    const users = ids.size
      ? await db.collection('user').find({ id: { $in: [...ids] } }).project({ id: 1, fullName: 1, name: 1, email: 1 }).toArray()
      : []
    const byId = new Map(users.map((u: any) => [u.id, u]))

    const nameOf = (uid: string) => {
      const u: any = byId.get(uid)
      return u ? u.fullName || u.name || u.email || uid : uid
    }

    // Persist the latest report on the exam so the results header can badge
    // it without re-running the (expensive) check on every page load.
    const checkedAt = new Date().toISOString()
    const report = {
      score: result.plagiarism.score,
      pairs: result.plagiarism.suspiciousPairs.length,
      aiFlags: result.plagiarism.aiGeneratedFlags.length,
      bankMatches: result.plagiarism.questionBankMatches.length,
      leaks: result.leaks.totalFlagged,
      checked_at: checkedAt,
    }
    await db.collection('exams').updateOne({ id: examId }, { $set: { plagiarism_report: report } })

    return NextResponse.json({
      score: result.plagiarism.score,
      checked_at: checkedAt,
      suspiciousPairs: result.plagiarism.suspiciousPairs.map((p) => ({
        ...p,
        name1: nameOf(p.userId1),
        name2: nameOf(p.userId2),
      })),
      aiGeneratedFlags: result.plagiarism.aiGeneratedFlags.map((f) => ({ ...f, name: nameOf(f.userId) })),
      questionBankMatches: result.plagiarism.questionBankMatches.map((m) => ({ ...m, name: nameOf(m.userId) })),
      leaks: result.leaks,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Plagiarism check failed'
    console.error('[CodeSpectra] plagiarism POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
