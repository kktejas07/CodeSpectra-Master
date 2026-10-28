/**
 * GET  /api/contests/[id]/entry — my entry, my submissions and my certificate (signed in).
 * POST /api/contests/[id]/entry — { action: register | join | leave | github, team_name?, join_code?, github_login? }.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { entryView, myEntry, mySubmissions, registerForContest } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  action: z.enum(['register', 'join', 'leave', 'github']),
  team_name: z.string().max(80).optional(),
  join_code: z.string().max(20).optional(),
  github_login: z.string().max(40).optional(),
})

export async function GET(_req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  return guarded('entry', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const e = await myEntry(c.id, user.id)
    if (!e) return NextResponse.json({ entry: null, submissions: [], certificate_url: null })
    let certificate_url: string | null = null
    if (c.results_released) {
      const { codeathonCertificateToken } = await import('@/lib/db/certifications')
      const token = await codeathonCertificateToken(`contest-${c.id}`, user.id)
      certificate_url = token ? `/cert/verify/${token}` : null
    }
    return NextResponse.json({ entry: entryView(e, user.id), submissions: await mySubmissions(c, e.id), certificate_url })
  })
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const limited = await limitRequest(req, 'contest-entry', user.id, 20, 60_000)
  if (limited) return limited
  const { id } = await ctx.params
  const parsed = bodySchema.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  return guarded('register', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    return respond(await registerForContest(user, c, parsed.data))
  })
}
