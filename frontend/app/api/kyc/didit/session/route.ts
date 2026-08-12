import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

const DIDIT_API_KEY = process.env.DIDIT_API_KEY || ''
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID || ''

interface DiditSessionRequest {
  workflow_id: string
  vendor_data: string
}

interface DiditSessionResponse {
  session_id?: string
  session_url?: string
  error?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!DIDIT_API_KEY) {
    return NextResponse.json({ error: 'Didit API key not configured' }, { status: 500 })
  }

  if (!DIDIT_WORKFLOW_ID) {
    return NextResponse.json({ error: 'Didit workflow ID not configured' }, { status: 500 })
  }

  try {
    // Create session with Didit
    const res = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: user.id,
      } as DiditSessionRequest),
    })

    const data = await res.json() as DiditSessionResponse

    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to create Didit session' }, { status: res.status })
    }

    // Store session in MongoDB
    const db = await getMongoDb()
    await db.collection('kyc_sessions').insertOne({
      id: data.session_id,
      user_id: user.id,
      provider: 'didit',
      status: 'pending',
      session_url: data.session_url,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({
      session_id: data.session_id,
      session_url: data.session_url,
    })
  } catch (e) {
    console.error('[Didit session]', e)
    return NextResponse.json({ error: 'Failed to create verification session' }, { status: 500 })
  }
}
