import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { userRoles, users } from '@/lib/db/admin'
import type { IdRouteContext } from '@/lib/app-route-context'
import type { Filter } from 'mongodb'

async function getMyOrgId(userId: string): Promise<string | null> {
  const userCol = await users()
  const me = await userCol.findOne({
    $or: [{ _id: userId }, { id: userId }],
  } as Filter<Record<string, unknown>>)
  return (me?.organizationId as string | undefined) ?? null
}

export async function DELETE(_request: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const orgId = await getMyOrgId(gate.user.id)
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

    const col = await userRoles()
    await col.deleteOne({ user_id: id, organization_id: orgId })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const orgId = await getMyOrgId(gate.user.id)
    if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

    const { role } = (await request.json()) as { role?: string }
    if (!role) return NextResponse.json({ error: 'role is required' }, { status: 400 })

    const col = await userRoles()
    await col.updateOne(
      { user_id: id, organization_id: orgId },
      { $set: { role } },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating member role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
