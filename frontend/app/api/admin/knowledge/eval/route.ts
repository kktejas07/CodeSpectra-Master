/**
 * Knowledge retrieval evaluation (superadmin only).
 *
 *   GET  /api/admin/knowledge/eval   → { runs, latest, health }  past runs (newest first) + index health
 *   POST /api/admin/knowledge/eval   → { run }                    run the golden set against the live index
 *
 * A run searches ~60 golden questions with real embeddings (one embedding call
 * each) plus a few ACL probes, so it is rate limited.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { callerFromUser } from '@/lib/rag/admin'
import { indexHealth } from '@/lib/rag/eval/health'
import { listEvalRuns, runLiveEval } from '@/lib/rag/eval/live'
import { knowledgeError, knowledgeLimit } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function gate() {
  const g = await requireSuperAdmin()
  if ('error' in g) return { response: NextResponse.json({ error: g.error }, { status: g.status }) }
  const caller = callerFromUser(g.user)
  if (!caller || caller.role !== 'superadmin') return { response: NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 }) }
  return { caller }
}

export async function GET() {
  const g = await gate()
  if ('response' in g) return g.response
  try {
    const [{ runs, latest }, health] = await Promise.all([listEvalRuns(20), indexHealth()])
    return NextResponse.json({ runs, latest, health })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/eval GET')
  }
}

export async function POST() {
  const g = await gate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'eval', 3, 10 * 60_000)
  if (limited) return limited
  try {
    const run = await runLiveEval(g.caller)
    return NextResponse.json({ run })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/eval POST')
  }
}
