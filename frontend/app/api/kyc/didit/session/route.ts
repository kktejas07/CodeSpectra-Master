import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// Per-session config, NOT a secret. Get from Workflows in Didit console.
const WORKFLOW_ID = 'b4c4c9b0-7b86-4a7a-a156-e2db3896bca5'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.DIDIT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Didit API key not configured' }, { status: 500 })
  }

  try {
    const res = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: WORKFLOW_ID,
        vendor_data: user.id,
        callback: `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/dashboard/identity-verify`,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('[Didit session] Failed:', res.status, detail)
      return NextResponse.json({ error: 'session_create_failed', detail }, { status: 502 })
    }

    const session = await res.json() as {
      session_id: string
      session_token: string
      url: string
      status: string
    }

    // Store session in MongoDB
    const db = await getMongoDb()
    await db.collection('kyc_sessions').insertOne({
      id: session.session_id,
      user_id: user.id,
      provider: 'didit',
      status: 'pending',
      session_url: session.url,
      created_at: new Date().toISOString(),
    })

    // Return ONLY what the client needs
    return NextResponse.json({
      url: session.url,
      session_id: session.session_id,
    })
  } catch (e) {
    console.error('[Didit session]', e)
    return NextResponse.json({ error: 'Failed to create verification session' }, { status: 500 })
  }
}
