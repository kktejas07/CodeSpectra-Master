/**
 * POST /api/admin/assistants/[id]/run (superadmin) — run a scheduled assistant now
 * (revenue scan, onboarding check, weekly placement report, mentor follow-ups).
 * Ignores the schedule, never the on/off and messaging switches. 2 per minute.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorBody, apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { assistantMeta, isAssistantId } from '@/lib/assistants/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireSuperAdmin()
  if ('error' in g) return NextResponse.json(apiErrorBody(String(g.error), 'code' in g ? (g.code as string) : undefined), { status: g.status })
  const { id } = await params
  if (!isAssistantId(id) || !assistantMeta(id).job_id) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
  const limited = await limitRequest(req, 'assistant-run', g.user.id, 2, 60_000)
  if (limited) return limited
  try {
    const { runAssistantNow } = await import('@/lib/assistants/tick')
    const run = await runAssistantNow(id)
    const { auditAdmin } = await import('@/lib/admin-audit')
    await auditAdmin({ id: g.user.id }, 'assistant.run', 'assistant', id, 'Run now', 'info').catch(() => undefined)
    return NextResponse.json({ run })
  } catch (e) {
    console.error('[assistants] run now:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
