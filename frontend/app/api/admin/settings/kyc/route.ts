import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: Get KYC settings
export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const db = await getMongoDb()
    const settings = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    return NextResponse.json(settings?.value || {})
  } catch (e) {
    console.error('[KYC settings GET]', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// POST: Save KYC settings
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const db = await getMongoDb()

    await db.collection('platform_settings').updateOne(
      { key: 'kyc_providers' },
      { $set: { value: body, updated_at: new Date().toISOString() } },
      { upsert: true }
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[KYC settings POST]', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
