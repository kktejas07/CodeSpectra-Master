import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { updateUserById } from '@/lib/db/admin'
import { invalidateAuthProfile } from '@/lib/session'

/** PATCH /api/user/profile — { name } updates the display name. */
export async function PATCH(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown }
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
      if (!name) return NextResponse.json({ error: 'Enter a name' }, { status: 400 })
      await updateUserById(user.id, { fullName: name })
      invalidateAuthProfile(user.id)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[user/profile] PATCH:', e)
    return NextResponse.json({ error: 'Your profile couldn’t be saved. Try again.' }, { status: 500 })
  }
}
