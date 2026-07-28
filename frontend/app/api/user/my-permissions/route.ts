import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const roleDoc = await db.collection('roles').findOne({ role: user.role })
    const perms = (roleDoc?.permissions || []) as Array<{ resource: string; actions: string[] }>

    const pagePerms = perms.filter(
      p => p.resource === '/dashboard' || p.resource.startsWith('/dashboard/')
    )

    const readable = pagePerms
      .filter(p => p.actions.includes('read') || p.actions.includes('manage'))
      .map(p => p.resource)

    const denied = pagePerms
      .filter(p => !p.actions.includes('read') && !p.actions.includes('manage'))
      .map(p => p.resource)

    return NextResponse.json({ readable, denied })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
