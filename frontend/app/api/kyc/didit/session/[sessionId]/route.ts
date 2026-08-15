import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: Fetch full session details from Didit API (FREE - doesn't count toward quota)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sessionId } = await params

  // Get API key from settings
  let apiKey = process.env.DIDIT_API_KEY
  try {
    const db = await getMongoDb()
    const settings = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    if (settings?.value?.didit_api_key) {
      apiKey = settings.value.didit_api_key
    }
  } catch { /* use env fallback */ }

  if (!apiKey) {
    return NextResponse.json({ error: 'Didit API key not configured' }, { status: 500 })
  }

  try {
    // Fetch full session details from Didit API (FREE endpoint)
    const res = await fetch(`https://verification.didit.me/v3/session/${sessionId}/`, {
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      const detail = await res.text()
      return NextResponse.json({ error: `Didit API error: ${detail}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[Didit session fetch]', e)
    return NextResponse.json({ error: 'Failed to fetch session details' }, { status: 500 })
  }
}
