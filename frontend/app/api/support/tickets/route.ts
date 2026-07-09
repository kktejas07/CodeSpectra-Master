import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function newId() { return crypto.randomUUID() }
function nowIso() { return new Date().toISOString() }

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getMongoDb()
  const tickets = await db
    .collection('support_tickets')
    .find({ user_id: user.id })
    .sort({ created_at: -1 })
    .limit(50)
    .toArray()

  return NextResponse.json({ tickets })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ipKey = clientLimiterKeyFromRequest(req, user.id)
  const ipCheck = rateLimitSlidingWindow(`support:ticket:${ipKey}`, 3, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json({ error: `Too many requests. Try in ${ipCheck.retryAfterSec}s.` }, { status: 429 })
  }

  let subject = '', message = '', category = 'general'
  try {
    const body = await req.json()
    subject = String(body.subject || '').trim()
    message = String(body.message || '').trim()
    category = String(body.category || 'general').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const ticket = {
    id: newId(),
    user_id: user.id,
    user_email: user.email,
    subject,
    message,
    category,
    status: 'open',
    created_at: nowIso(),
    updated_at: nowIso(),
  }

  await db.collection('support_tickets').insertOne(ticket)
  return NextResponse.json({ ticket })
}
