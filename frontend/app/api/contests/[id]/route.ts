/**
 * GET   /api/contests/[id]            public detail (no secrets). `?view=admin` (staff): full doc + editor config.
 * PATCH /api/contests/[id]            edit (staff).
 * POST  /api/contests/[id]            { action: publish | unpublish | close | preview_release | release, force? } (staff).
 */
import { NextResponse } from 'next/server'
import { contestPhase, editorConfig } from '@/lib/contests/config'
import {
  isContestJudge, isContestStaff, loadSecret, previewContestRelease, publicContest, releaseContestResults, setContestStatus, updateContest,
} from '@/lib/contests/service'
import { guarded, loadVisible, notFound, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return guarded('detail', async () => {
    const user = await withUser()
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const staff = isContestStaff(user, c)
    if (new URL(req.url).searchParams.get('view') === 'admin') {
      if (!staff && !isContestJudge(user, c)) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
      const secret = staff ? await loadSecret(c.id) : null
      return NextResponse.json({ contest: c, editor_config: staff ? editorConfig(c.format, c.config, secret) : null, staff, phase: contestPhase(c) })
    }
    return NextResponse.json({ contest: publicContest(c, { staff }), phase: contestPhase(c), staff })
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  return guarded('update', async () => respond(await updateContest(user, id, await readJson(req))))
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const body = await readJson(req)
  return guarded('action', async () => {
    switch (body.action) {
      case 'publish': case 'unpublish': case 'close':
        return respond(await setContestStatus(user, id, body.action))
      case 'preview_release':
        return respond(await previewContestRelease(user, id))
      case 'release':
        return respond(await releaseContestResults(user, id, { force: body.force === true }))
      default:
        return NextResponse.json({ error: 'Unknown action', code: 'unknown_action' }, { status: 400 })
    }
  })
}
