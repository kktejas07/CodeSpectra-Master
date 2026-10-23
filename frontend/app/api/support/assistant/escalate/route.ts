/**
 * POST /api/support/assistant/escalate { q, answer?, category? } — turn a help-assistant
 * question into a support ticket in the caller's own name (3 per minute, like tickets).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { SupportEscalateSchema } from '@/lib/assistants/support/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getAPIUser().catch(() => null)
  if (!user) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const parsed = SupportEscalateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const limited = await limitRequest(req, 'support:ticket', user.id, 3, 60_000)
  if (limited) return limited
  try {
    const { escalateToTicket } = await import('@/lib/assistants/support/service')
    const r = await escalateToTicket({ id: user.id, email: user.email, role: user.role, tenantId: user.tenantId ?? null }, parsed.data)
    return NextResponse.json({ ticket: r })
  } catch (e) {
    console.error('[support-assistant] escalate:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
