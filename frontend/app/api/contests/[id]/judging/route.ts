/**
 * GET  /api/contests/[id]/judging — latest submission per entry, for judges and staff.
 * POST /api/contests/[id]/judging — { submission_id, scores: [{ name, score }], comment? }
 *      Each criterion out of its rubric weight; the submission score is the judges' mean.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listForJudging, scoreSubmission } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  submission_id: z.string().max(60),
  scores: z.array(z.object({ name: z.string().max(80), score: z.number() })).max(12),
  comment: z.string().max(2000).optional(),
})

export async function GET(_req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  return guarded('judging-list', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const r = await listForJudging(user, c)
    if (!r.ok) return respond(r)
    return NextResponse.json({ items: r.data, rubric: c.judging.rubric })
  })
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const parsed = schema.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  return guarded('judging-score', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    return respond(await scoreSubmission(user, c, parsed.data))
  })
}
