/** GET / PUT — forum settings: profanity list + action, link limits for new accounts, rate limits, AI moderation caps, XP (superadmin). */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req, { superOnly: true })
  if ('res' in g) return g.res
  try {
    const { getSettings, aiUsageNow } = await import('@/lib/community/moderation')
    return json({ settings: await getSettings(), ai_usage: await aiUsageNow() })
  } catch (e) { return errorResponse(e, 'community settings') }
}

export async function PUT(req: NextRequest) {
  const g = await adminGate(req, { superOnly: true, write: true })
  if ('res' in g) return g.res
  try {
    const { saveSettings } = await import('@/lib/community/moderation')
    return json({ settings: await saveSettings(g.user.id, await bodyOf(req)) })
  } catch (e) { return errorResponse(e, 'community settings save') }
}
