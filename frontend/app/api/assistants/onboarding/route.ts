/**
 * /api/assistants/onboarding — the organisation setup checklist (lib/assistants/onboarding).
 * GET   → { enabled, checklist, dismissed, org_name } for the caller's own organisation
 *         (organisation admins; a superadmin passes ?tenant=<id>).
 * PATCH { dismissed: boolean } → hide / show the checklist for the organisation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/route-auth'
import { apiErrorBody, apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function gate(req: NextRequest) {
  const g = await requireAdmin()
  if ('error' in g) return { res: NextResponse.json(apiErrorBody(String(g.error), 'code' in g ? (g.code as string) : undefined), { status: g.status }) }
  const requested = req.nextUrl.searchParams.get('tenant')
  const tenantId = g.user.role === 'superadmin' ? (requested && /^[A-Za-z0-9_-]{1,128}$/.test(requested) ? requested : null) : g.user.tenantId ?? null
  if (!tenantId) return { res: NextResponse.json(apiErrorBody('Pick an organisation first.', 'invalid_request'), { status: 400 }) }
  return { user: g.user, tenantId }
}

export async function GET(req: NextRequest) {
  const g = await gate(req)
  if ('res' in g) return g.res
  const { getAssistantSettings } = await import('@/lib/assistants/store')
  if (!(await getAssistantSettings('org_onboarding')).enabled) return NextResponse.json({ enabled: false })
  try {
    const { getOnboarding } = await import('@/lib/assistants/onboarding/service')
    return NextResponse.json({ enabled: true, ...(await getOnboarding(g.tenantId)) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[onboarding]:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const Patch = z.object({ dismissed: z.boolean() }).strict()

export async function PATCH(req: NextRequest) {
  const g = await gate(req)
  if ('res' in g) return g.res
  const p = Patch.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const { setDismissed } = await import('@/lib/assistants/onboarding/service')
  await setDismissed(g.tenantId, p.data.dismissed)
  return NextResponse.json({ ok: true, dismissed: p.data.dismissed })
}
