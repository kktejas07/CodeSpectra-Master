import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    if (process.env.NODE_ENV === 'production') return false
    return true
  }
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('secret') || ''
  const fromHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return fromQuery === expected || fromHeader === expected
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()

    // Find pending invites created within the last 23 hours
    const since = new Date(Date.now() - 23 * 3600_000).toISOString()
    const pendingInvites = await db.collection('candidate_invites')
      .find({ status: 'pending', created_at: { $gte: since } })
      .toArray()

    let reminded = 0
    for (const invite of pendingInvites) {
      if (!invite.phone) continue
      try {
        await sendWhatsAppText(
          invite.phone,
          `Hi ${invite.full_name || 'there'}! Reminder: You have a pending assessment invitation from CodeSpectra. Please complete it before the deadline. Check your email for the link.`
        )
        reminded++
      } catch {
        // Best-effort — continue with next invite
      }
    }

    return NextResponse.json({ reminded })
  } catch (e) {
    console.error('[exam-reminders] error:', e)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
