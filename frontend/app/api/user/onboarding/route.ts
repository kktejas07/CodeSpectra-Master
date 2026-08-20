import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { ObjectId } from 'mongodb'

export async function POST(req: Request) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { onboardingGoal } = body

    if (!onboardingGoal) {
      return NextResponse.json({ error: 'onboardingGoal is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    
    // Update the user document
    await db.collection('users').updateOne(
      { _id: user.id as any },
      { $set: { onboardingGoal: onboardingGoal } }
    )

    return NextResponse.json({ success: true, onboardingGoal })
  } catch (error) {
    console.error('Onboarding API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
