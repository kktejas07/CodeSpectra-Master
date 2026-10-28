/**
 * POST /api/learn/[slug]/track — count a view or a share (public, rate limited).
 * Body: { type: 'view' } | { type: 'share', channel: ShareChannel }
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { trackPostEvent } from '@/lib/learn/posts'
import { fail, readJson, serverError } from '@/lib/learn/http'
import { isShareChannel } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params
    if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/.test(slug)) return fail('Not found', 404)
    const body = await readJson(req)
    const type = body.type
    if (type !== 'view' && type !== 'share') return fail('Unknown event')
    if (type === 'share' && !isShareChannel(body.channel)) return fail('Unknown channel')
    const limited = await limitRequest(req, `learn-${type}`, null, type === 'view' ? 30 : 20, 60_000)
    if (limited) return limited
    const ok = await trackPostEvent(slug, type === 'view' ? { type } : { type, channel: body.channel as never })
    return ok ? NextResponse.json({ ok: true }) : fail('Not found', 404)
  } catch (e) {
    return serverError('track', e)
  }
}
