import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonClaims, hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'

export const runtime = 'nodejs'

const CLAIM_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function resolveHackathon(idOrSlug: string) {
  const col = await hackathons()
  return col.findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] })
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ items: [] })

  const claims = await hackathonClaims()
  const items = (await claims
    .find({ hackathon_id: hk.id, team_id: team.id }, { projection: { _id: 0 } })
    .toArray())
    // TTL runs about once a minute; hide anything already past its expiry.
    .filter((c) => new Date(c.expires_at).getTime() > Date.now())
    .map((c) => ({ ...c, expires_at: new Date(c.expires_at).toISOString() }))
  return NextResponse.json({ items })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  if (hk.status !== 'live') return NextResponse.json({ error: 'claims only allowed during the live event' }, { status: 409 })

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'you must be on a team to claim problems' }, { status: 403 })

  let body: { problem_slug?: string } = {}
  try {
    body = (await req.json()) as { problem_slug?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const problem_slug = typeof body.problem_slug === 'string' ? body.problem_slug.trim() : ''
  if (!problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })
  if (!(hk.tasks || []).some((t) => t.problem_slug === problem_slug)) {
    return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })
  }

  const now = nowIso()
  const claims = await hackathonClaims()

  // Check if claim already exists in this team and is still active (not expired)
  const existing = await claims.findOne({ hackathon_id: hk.id, team_id: team.id, problem_slug })
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: `Problem already claimed by ${existing.user_name}` }, { status: 409 })
    }
  }

  const expires_at = new Date(Date.now() + CLAIM_TTL_MS)
  await claims.updateOne(
    { hackathon_id: hk.id, team_id: team.id, problem_slug },
    {
      $set: {
        hackathon_id: hk.id,
        team_id: team.id,
        problem_slug,
        user_id: user.id,
        user_name: user.name || user.email || 'Anonymous',
        claimed_at: now,
        expires_at,
      },
    },
    { upsert: true },
  ).catch((e: unknown) => {
    // A teammate claimed it in the same instant.
    if ((e as { code?: number })?.code === 11000) return null
    throw e
  })

  return NextResponse.json({ ok: true, expires_at: expires_at.toISOString() })
}