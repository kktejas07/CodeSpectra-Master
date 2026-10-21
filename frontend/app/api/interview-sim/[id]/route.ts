/**
 * /api/interview-sim/[id] (owner only)
 * GET    — the session (current question, turns, report).
 * PATCH  — { share: boolean } turn the share link on (new token) or off.
 * DELETE — delete the session, its recording and its share link.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SESSION_ID_RE, readJson, serverError, simUser } from '@/lib/interview-sim/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  try {
    const { getOwnSession } = await import('@/lib/interview-sim/store')
    const { toView } = await import('@/lib/interview-sim/engine')
    const s = await getOwnSession(id, g.user.id)
    if (!s) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
    return NextResponse.json({ session: await toView(s) })
  } catch (e) {
    return serverError('get', e)
  }
}

const patchSchema = z.object({ share: z.boolean() }).strict()

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  const parsed = patchSchema.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  try {
    const { getOwnSession, newShareToken, sessions } = await import('@/lib/interview-sim/store')
    const s = await getOwnSession(id, g.user.id)
    if (!s) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
    if (parsed.data.share && (s.status !== 'completed' || !s.report)) return NextResponse.json({ error: 'Finish the interview before sharing the report.' }, { status: 409 })
    // Turning sharing on again issues a new link, so an old link stays dead.
    const token = parsed.data.share ? newShareToken() : null
    await (await sessions()).updateOne({ id, user_id: g.user.id }, { $set: { share_token: token, updated_at: new Date().toISOString() } })
    return NextResponse.json({ share_url: token ? `/interview-report/${token}` : null })
  } catch (e) {
    return serverError('share', e)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  try {
    const { deleteSession } = await import('@/lib/interview-sim/store')
    const ok = await deleteSession(id, g.user.id)
    if (!ok) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('delete', e)
  }
}
