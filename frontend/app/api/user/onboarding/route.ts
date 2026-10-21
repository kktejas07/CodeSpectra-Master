import { NextResponse } from 'next/server'
import { users } from '@/lib/db/admin'
import { getAPIUser } from '@/lib/route-auth'

export async function POST(req: Request) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const raw = (body as { onboardingGoal?: unknown }).onboardingGoal
    const onboardingGoal = typeof raw === 'string' ? raw.trim().slice(0, 80) : ''

    if (!onboardingGoal) {
      return NextResponse.json({ error: 'onboardingGoal is required' }, { status: 400 })
    }

    // The user collection is `user` (lib/db/admin `users()`), not `users`.
    const col = await users()
    await col.updateOne(
      { $or: [{ id: user.id }, { _id: user.id }] } as never,
      { $set: { onboardingGoal, updatedAt: new Date() } },
    )

    return NextResponse.json({ success: true, onboardingGoal })
  } catch (error) {
    console.error('Onboarding API Error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
