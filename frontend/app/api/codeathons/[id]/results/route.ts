/**
 * GET /api/codeathons/[id]/results — public final results of a released
 * codeathon (works signed out). Returns names, ranks and totals only: no
 * emails, user ids or code. A signed-in participant also gets `me` (their
 * own placing and certificate link). Rate-limited per IP.
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { codeathonResults } from '@/lib/codeathon-release'
import { codeathonCertificateToken } from '@/lib/db/certifications'
import { certificateKindFor } from '@/lib/codeathon-results'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rl = await rateLimitRedis(`codeathon-results:${clientLimiterKeyFromRequest(req, null)}`, 60, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }
  const { id } = await ctx.params
  if (!id || !ID_RE.test(id)) return NextResponse.json({ error: 'Results not found' }, { status: 404 })

  try {
    const db = await getMongoDb()
    const codeathon = await db.collection('codeathons').findOne(
      { id },
      { projection: { _id: 0, id: 1, title: 1, description: 1, startDate: 1, endDate: 1, event_type: 1, results_released: 1, released_at: 1, status: 1 } },
    )
    // Unreleased and unknown codeathons look the same from outside.
    if (!codeathon || codeathon.status === 'draft') return NextResponse.json({ error: 'Results not found' }, { status: 404 })
    if (codeathon.results_released !== true) {
      return NextResponse.json({
        released: false,
        codeathon: { id: codeathon.id, title: codeathon.title || 'Codeathon', endDate: codeathon.endDate || null },
      })
    }
    const snap = await (await codeathonResults(db)).findOne({ codeathon_id: id }, { projection: { _id: 0 } })
    if (!snap) return NextResponse.json({ error: 'Results are being prepared. Try again shortly.' }, { status: 503 })

    const standings = snap.standings.map((s) => ({
      rank: s.rank,
      tied: s.tied,
      name: s.name,
      kind: s.kind,
      total_score: s.total_score,
      problems_solved: s.problems_solved,
      ...(s.kind === 'team' ? { members: (s.member_names || []).slice(0, 20) } : {}),
    }))

    let me: Record<string, unknown> | null = null
    const user = await getAPIUser().catch(() => null)
    if (user) {
      const mine = snap.standings.find((s) => s.member_ids.includes(user.id))
      if (mine) {
        const token = await codeathonCertificateToken(id, user.id).catch(() => null)
        me = {
          name: mine.name,
          kind: mine.kind,
          rank: mine.rank,
          tied: mine.tied,
          total_score: mine.total_score,
          problems_solved: mine.problems_solved,
          certificate: certificateKindFor(mine, snap.certificate_policy),
          certificate_url: token ? `/cert/verify/${token}` : null,
        }
      }
    }

    return NextResponse.json(
      {
        released: true,
        codeathon: {
          id: codeathon.id,
          title: codeathon.title || snap.title,
          description: typeof codeathon.description === 'string' ? codeathon.description.slice(0, 2000) : '',
          startDate: codeathon.startDate || null,
          endDate: codeathon.endDate || null,
          event_type: snap.event_type,
        },
        released_at: snap.released_at,
        ranked_count: snap.ranked_count,
        participant_count: snap.participant_count,
        certificate_policy: snap.certificate_policy,
        standings,
        me,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[codeathon results] error:', e)
    return NextResponse.json({ error: 'Could not load results' }, { status: 500 })
  }
}
