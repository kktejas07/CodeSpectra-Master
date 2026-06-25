import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { userRoles, orgInvitations, users, newId, nowIso } from '@/lib/db/admin'
import type { Filter } from 'mongodb'

export async function GET() {
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
      // No org yet — return an empty roster (was previously a hard 500 on user_metadata access).
      return NextResponse.json([])
    }

    const rolesCol = await userRoles()
    const memberships = await rolesCol.find({ organization_id: orgId }).toArray()
    if (memberships.length === 0) return NextResponse.json([])

    const memberIds = memberships.map((m) => m.user_id)
    const profiles = await userCol
      .find({
        $or: [{ _id: { $in: memberIds } }, { id: { $in: memberIds } }],
      } as Filter<Record<string, unknown>>)
      .toArray()

    const byId = new Map<string, (typeof profiles)[number]>()
    for (const p of profiles) {
      const id = (p._id as unknown as string) ?? (p.id as unknown as string)
      if (id) byId.set(id, p)
    }

    const result = memberships.map((m) => {
      const p = byId.get(m.user_id) as
        | { email?: string; fullName?: string | null; name?: string | null }
        | undefined
      return {
        id: m.user_id,
        email: p?.email ?? '',
        name: p?.fullName ?? p?.name ?? 'Unknown',
        role: m.role,
        joinedAt: m.joined_at,
        status: m.is_active ? 'active' : 'inactive',
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching team members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const body = (await request.json()) as { email?: string; role?: string }
    const email = body.email?.trim().toLowerCase()
    const role = body.role || 'user'
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const invCol = await orgInvitations()
    await invCol.insertOne({
      id: newId(),
      organization_id: orgId,
      email,
      invited_by: gate.user.id,
      role,
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
