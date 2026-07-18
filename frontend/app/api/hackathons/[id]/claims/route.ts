import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonClaims, hackathons, nowIso } from '@/lib/db/qr-events'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })

  const claims = await hackathonClaims()
  const items = await claims
    .find({ hackathon_id: hk.id }, { projection: { _id: 0 } })
    .toArray()
  return NextResponse.json({ items })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })

  let body: { problem_slug?: string } = {}
  try {
    body = (await req.json()) as { problem_slug?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { problem_slug } = body
  if (!problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })

  const now = nowIso()
  const claims = await hackathonClaims()

  // Check if claim already exists and is still active (not expired)
  const existing = await claims.findOne({ hackathon_id: hk.id, problem_slug })
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Problem already claimed by another team' }, { status: 409 })
    }
    // Same user re-claiming — extend the TTL
  }

  const expires_at = new Date(Date.now() + CLAIM_TTL_MS).toISOString()
  await claims.updateOne(
    { hackathon_id: hk.id, problem_slug },
    {
      $set: {
        hackathon_id: hk.id,
        problem_slug,
        user_id: user.id,
        user_name: user.name || user.email || 'Anonymous',
        claimed_at: now,
        expires_at,
      },
    },
    { upsert: true },
  )

  return NextResponse.json({ ok: true })
}