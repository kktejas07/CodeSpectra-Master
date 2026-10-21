/**
 * GET /api/contests/[id]/leaderboard — public board (respects visibility and the
 * end-of-contest freeze; staff always see the live board). Names only, never emails.
 */
import { contestLeaderboard } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, respond, withUser } from '@/lib/contests/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await withUser()
  const limited = await limitRequest(req, 'contest-board', user?.id || null, 60, 60_000)
  if (limited) return limited
  const { id } = await ctx.params
  return guarded('leaderboard', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    return respond(await contestLeaderboard(user, c))
  })
}
