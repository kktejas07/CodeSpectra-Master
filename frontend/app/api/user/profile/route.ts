import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { updateUserById } from '@/lib/db/admin'

export async function PATCH(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (body.name !== undefined) {
      await updateUserById(user.id, { fullName: body.name.trim() } as any)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
