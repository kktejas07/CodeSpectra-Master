import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions } from '@/lib/db/interviews'
import { AccessToken } from 'livekit-server-sdk'
import { interviewRole } from '@/lib/interview-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isProd = process.env.NODE_ENV === 'production'
const API_KEY = process.env.LIVEKIT_API_KEY || (isProd ? '' : 'devkey')
const API_SECRET = process.env.LIVEKIT_API_SECRET || (isProd ? '' : 'dev-secret-match-compose')
const LIVEKIT_URL = process.env.LIVEKIT_URL || (isProd ? '' : 'ws://localhost:7880')

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { name?: string }

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  // Participants, superadmin, or a tenant_admin of this session's tenant only.
  if (!interviewRole(gate.user, session as unknown as Record<string, unknown>)) {
    return NextResponse.json({ error: 'Not authorized to join this interview' }, { status: 403 })
  }

  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json(
      { error: 'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in the environment.' },
      { status: 503 }
    )
  }

  const roomName = `interview-${id}`
  // Identity is the signed-in account, never the request body (no impersonation in the room).
  const displayName = (gate.user.fullName || gate.user.name || (typeof body.name === 'string' ? body.name : '') || gate.user.email || 'Participant').slice(0, 100)
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: gate.user.id,
    name: displayName,
    ttl: 7200,
  })
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  })

  const token = await at.toJwt()

  return NextResponse.json({ token, url: LIVEKIT_URL })
}
