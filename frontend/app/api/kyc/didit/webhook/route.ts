import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { createHmac } from 'crypto'

export const runtime = 'nodejs'

const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET || ''

interface DiditWebhookPayload {
  session_id: string
  status: 'Approved' | 'Declined' | 'In Review' | 'Expired' | 'Not Finished'
  vendor_data: string
  id_verification?: {
    status: string
    document_type: string
    full_name: string
    date_of_birth: string
    document_number: string
    issuing_country: string
  }
  liveness?: {
    status: string
    score: number
  }
  face_match?: {
    status: string
    similarity: number
  }
  ip_analysis?: {
    status: string
    vpn: boolean
    proxy: boolean
    tor: boolean
  }
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) return true // Skip verification if no secret configured
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return signature === expected
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text()
  const signature = request.headers.get('x-signature-v2') || ''

  // Verify webhook signature
  if (!verifySignature(body, signature, DIDIT_WEBHOOK_SECRET)) {
    console.error('[Didit webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body) as DiditWebhookPayload

  try {
    const db = await getMongoDb()

    // Determine verification status
    let status: string = 'pending'
    if (payload.status === 'Approved') status = 'approved'
    else if (payload.status === 'Declined') status = 'rejected'
    else if (payload.status === 'In Review') status = 'manual_review'

    // Update KYC session
    await db.collection('kyc_sessions').updateOne(
      { id: payload.session_id },
      {
        $set: {
          status,
          result: payload,
          updated_at: new Date().toISOString(),
        },
      }
    )

    // Update identity verification record for the user
    if (payload.vendor_data) {
      await db.collection('identity_verifications').insertOne({
        id: crypto.randomUUID(),
        user_id: payload.vendor_data,
        provider: 'didit',
        session_id: payload.session_id,
        status,
        result: {
          document_type: payload.id_verification?.document_type,
          full_name: payload.id_verification?.full_name,
          date_of_birth: payload.id_verification?.date_of_birth,
          liveness_score: payload.liveness?.score,
          face_match_similarity: payload.face_match?.similarity,
          vpn_detected: payload.ip_analysis?.vpn,
        },
        created_at: new Date().toISOString(),
      })
    }

    console.log(`[Didit webhook] Session ${payload.session_id} → ${status}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Didit webhook]', e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
