import { NextRequest, NextResponse } from 'next/server'
import { candidateInvites } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  try {
    const col = await candidateInvites()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Candidate invitation link invalid or expired.' }, { status: 404 })
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await col.updateOne({ token }, { $set: { status: 'expired' } })
      return NextResponse.json({ error: 'This candidate assessment link has expired.' }, { status: 410 })
    }

    return NextResponse.json({
      ok: true,
      email: invite.email,
      full_name: invite.full_name,
      target_url: invite.target_url || '/assessment',
      status: invite.status,
      created_at: invite.created_at,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to verify invite token'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
