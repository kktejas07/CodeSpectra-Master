/**
 * PUT { provider: 'slack' | 'teams', … } — connect / update (secrets encrypted at rest).
 * POST { provider } — send a test message. DELETE ?provider= — disconnect.
 */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errJson, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
  try {
    const body = await bodyOf(req)
    const { validateSlack, validateTeams, cleanEvents } = await import('@/lib/integrations/chat')
    const { saveIntegration, getIntegration } = await import('@/lib/integrations/store')
    const provider = body.provider === 'teams' ? 'teams' : body.provider === 'slack' ? 'slack' : null
    if (!provider) return errJson(400, 'Pick Slack or Teams.', 'chat_provider')
    // Changing only the event list keeps the stored secret.
    const existing = await getIntegration(tenant, provider)
    if (existing && body.events_only === true) {
      await saveIntegration({ tenantId: tenant, provider, userId: g.user.id, config: { ...existing.config, events: cleanEvents(body.events) } })
      return json({ ok: true })
    }
    const v = provider === 'slack' ? validateSlack(body) : validateTeams(body)
    if (!v.ok) return errJson(400, v.error, 'chat_invalid', { detail: v.error })
    await saveIntegration({ tenantId: tenant, provider, userId: g.user.id, secret: v.secret, config: v.config as unknown as Record<string, unknown>, label: provider === 'slack' ? (v.config as { mode: string }).mode : 'webhook' })
    return json({ ok: true })
  } catch (e) { return errorResponse(e, 'integrations chat save') }
}

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
  try {
    const body = await bodyOf(req)
    const { sendChatMessage } = await import('@/lib/integrations/chat-send')
    const { getAppOrigin } = await import('@/lib/app-origin')
    const r = await sendChatMessage(tenant, { event: 'application', title: 'CodeSpectra test message: hiring alerts are connected', lines: [{ label: 'Sent by', value: g.user.email }], url: `${getAppOrigin()}/dashboard/hiring` }, { force: true })
    const want = body.provider === 'teams' ? r.teams : r.slack
    if (!want) return errJson(409, 'Nothing was sent. Connect the app first.', 'chat_not_connected')
    return json({ ok: true })
  } catch (e) {
    return errJson(502, `The message could not be sent: ${(e as Error).message}`.slice(0, 300), 'chat_send_failed')
  }
}

export async function DELETE(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const p = new URL(req.url).searchParams.get('provider')
  const provider = p === 'slack' || p === 'teams' || p === 'google_classroom' ? p : null
  if (!provider) return errJson(400, 'Pick Slack or Teams.', 'chat_provider')
  try {
    const { removeIntegration } = await import('@/lib/integrations/store')
    await removeIntegration(tenantOf(g.user)!, provider)
    return json({ ok: true })
  } catch (e) { return errorResponse(e, 'integrations disconnect') }
}
