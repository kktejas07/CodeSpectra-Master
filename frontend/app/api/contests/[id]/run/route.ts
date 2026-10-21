/**
 * POST /api/contests/[id]/run — { mode: 'samples', task_id, language, code } runs the
 * public sample tests; { mode: 'blackbox', task_id, input } runs the reverse-coding
 * black box (rate limited per person per hour). Signed-in entrants only, while live.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runForContest } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  mode: z.enum(['samples', 'blackbox']),
  task_id: z.string().max(60).optional(),
  language: z.string().max(30).optional(),
  code: z.string().max(70_000).optional(),
  input: z.string().max(5000).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  const parsed = schema.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  return guarded('run', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    return respond(await runForContest(user, c, parsed.data))
  })
}
