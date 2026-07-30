import { NextRequest, NextResponse } from 'next/server'
import { candidateInvites } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
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
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invite.status === 'used') {
      return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 409 })
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await col.updateOne({ token }, { $set: { status: 'expired' } })
      return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 })
    }

    const body = await req.json().catch(() => ({}))
    if (body.email && body.email.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json({ error: 'Email mismatch — this invitation belongs to a different candidate.' }, { status: 403 })
    }

    await col.updateOne({ token }, { $set: { status: 'used' } })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to use invite token'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

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
    const db = await getMongoDb()
    const invite = await col.findOne({ token })

    if (!invite) {
      return NextResponse.json({ error: 'Candidate invitation link invalid or expired.' }, { status: 404 })
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await col.updateOne({ token }, { $set: { status: 'expired' } })
      return NextResponse.json({ error: 'This candidate assessment link has expired.', is_expired: true }, { status: 410 })
    }

    const registeredUser = await db.collection('user').findOne({ email: invite.email })

    return NextResponse.json({
      ok: true,
      email: invite.email,
      full_name: invite.full_name,
      target_url: invite.target_url || '/assessment',
      is_registered: !!registeredUser,
      assigned_assessments: invite.assigned_assessments || [
        {
          id: 'step-1',
          title: 'Assigned Assessment',
          target_url: invite.target_url || '/assessment',
          type: invite.target_url?.includes('cad') ? 'cad' : invite.target_url?.includes('identity') ? 'identity' : invite.target_url?.includes('problems') ? 'coding' : 'general',
          allowed_languages: invite.allowed_languages || [],
          status: 'pending',
        },
      ],
      allowed_languages: invite.allowed_languages || [],
      status: invite.status,
      created_at: invite.created_at,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to verify invite token'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
