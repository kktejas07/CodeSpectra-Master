import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions } from '@/lib/db/interviews'
import { livekitConfig, mintLivekitToken, LIVEKIT_NOT_CONFIGURED } from '@/lib/ats/interviews/livekit'
import { interviewRole } from '@/lib/interview-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  // Admin → Settings → Hiring integrations first, then env, then dev defaults.
  const cfg = await livekitConfig()
  if (!cfg) return NextResponse.json({ error: LIVEKIT_NOT_CONFIGURED }, { status: 503 })

  const roomName = `interview-${id}`
  // Identity is the signed-in account, never the request body (no impersonation in the room).
  const displayName = (gate.user.fullName || gate.user.name || (typeof body.name === 'string' ? body.name : '') || gate.user.email || 'Participant').slice(0, 100)
  const token = await mintLivekitToken(cfg, roomName, gate.user.id, displayName, 7200)

  return NextResponse.json({ token, url: cfg.url })
}
