/**
 * POST /api/workflows/[id]/secret — create / rotate the workflow's signing
 * secret. The secret is returned ONCE (store it in the calling system); it is
 * kept encrypted and used to verify inbound webhooks and sign outbound ones.
 */
import { NextRequest, NextResponse } from 'next/server'
import { nowIso } from '@/lib/db/leaderboard'
import { loadWorkflow, requireWorkflowAdmin } from '@/lib/automation/access'
import { col } from '@/lib/automation/store'
import { maskSecret, newWebhookSecret } from '@/lib/automation/hmac'
import { encryptValue } from '@/lib/automation/settings'
import { auditAdmin } from '@/lib/admin-audit'
import { getAppOrigin } from '@/lib/app-origin'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const limited = await limitRequest(req, 'workflows:secret', g.user.id, 10, 60 * 60_000)
  if (limited) return limited
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 })
  const secret = newWebhookSecret()
  await (await col('workflows')).updateOne({ id: wf.id }, { $set: { webhook_secret_enc: await encryptValue(secret), webhook_secret_hint: maskSecret(secret), updated_at: nowIso(), updated_by: g.user.id } })
  await auditAdmin(g.user, wf.webhook_secret_enc ? 'workflow.rotate_secret' : 'workflow.create_secret', 'workflow', wf.id, wf.name, 'warning')
  return NextResponse.json({ secret, hint: maskSecret(secret), hook_url: `${getAppOrigin()}/api/workflows/hooks/${wf.id}` })
}
