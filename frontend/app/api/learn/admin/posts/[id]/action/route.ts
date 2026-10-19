/**
 * POST /api/learn/admin/posts/[id]/action (superadmin)
 * Body: { action: approve|schedule|unschedule|publish|reject|reopen|unpublish, reason?, publish_at? (ISO) }
 * Transitions are validated by lib/learn/state.ts (reject needs a reason, schedule a future time).
 */
import { NextRequest, NextResponse } from 'next/server'
import { applyPostAction } from '@/lib/learn/posts'
import { allowedActions, isLearnAction } from '@/lib/learn/state'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { id } = await ctx.params
    const body = await readJson(req)
    if (!isLearnAction(body.action)) return fail('Unknown action.')
    const r = await applyPostAction(id, body.action, { reason: body.reason, publishAt: body.publish_at, actorId: g.user.id })
    if (r.error) return fail(r.error, r.status ?? 400)
    return NextResponse.json({ post: r.post, actions: allowedActions(r.post!.status) })
  } catch (e) {
    return serverError('admin action', e)
  }
}
