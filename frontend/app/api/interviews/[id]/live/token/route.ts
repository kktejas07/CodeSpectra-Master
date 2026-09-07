import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions } from '@/lib/db/interviews'
import { AccessToken } from 'livekit-server-sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_KEY = process.env.LIVEKIT_API_KEY || 'devkey'
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'dev-secret-match-compose'
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { identity?: string; name?: string }

  if (!body.identity) {
    return NextResponse.json({ error: 'identity required' }, { status: 400 })
  }

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })

  const userId = gate.user.id
  const role = gate.user.role
  const isParticipant = session.interviewer_id === userId || session.candidate_id === userId
  if (!isParticipant && role !== 'superadmin' && role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Not authorized to join this interview' }, { status: 403 })
  }

  const roomName = `interview-${id}`
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: body.identity,
    name: body.name,
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
