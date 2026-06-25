import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { orgInvitations, users, newId, nowIso } from '@/lib/db/admin'
import type { Filter } from 'mongodb'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const userCol = await users()
    const me = await userCol.findOne({
      $or: [{ _id: gate.user.id }, { id: gate.user.id }],
    } as Filter<Record<string, unknown>>)
    const orgId = (me?.organizationId as string | undefined) ?? null
    if (!orgId) {
      return NextResponse.json(
        { error: 'You must belong to an organization to invite members.' },
        { status: 400 },
      )
    }

    const { email, role } = (await request.json()) as { email?: string; role?: string }
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const invCol = await orgInvitations()
    await invCol.insertOne({
      id: newId(),
      organization_id: orgId,
      email: email.trim().toLowerCase(),
      invited_by: gate.user.id,
      role: role || 'user',
      token: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      created_at: nowIso(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error inviting member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
