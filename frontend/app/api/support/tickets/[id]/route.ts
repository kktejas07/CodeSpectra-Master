import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const db = await getMongoDb()
  const filter: any = { id }
  if (user.role !== 'superadmin') filter.user_id = user.id
  const ticket = await db.collection('support_tickets').findOne(filter)
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const replies = await db.collection('support_replies').find({ ticket_id: id }).sort({ created_at: 1 }).toArray()
  return NextResponse.json({ ticket, replies })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  let message = ''
  try { const body = await req.json(); message = String(body.message || '').trim() }
  catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const db = await getMongoDb()
  const filter: any = { id }
  if (user.role !== 'superadmin') filter.user_id = user.id
  const ticket = await db.collection('support_tickets').findOne(filter)
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if (ticket.status === 'closed') return NextResponse.json({ error: 'Ticket is closed' }, { status: 400 })

  const reply = {
    id: crypto.randomUUID(),
    ticket_id: id,
    user_id: user.id,
    user_email: user.email,
    message,
    created_at: new Date().toISOString(),
  }
  await db.collection('support_replies').insertOne(reply)
  await db.collection('support_tickets').updateOne({ id }, { $set: { status: 'open', updated_at: new Date().toISOString() } })
  return NextResponse.json({ reply })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  let status = ''
  try { const body = await req.json(); status = String(body.status || '').trim() }
  catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!status || !['open', 'closed'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const db = await getMongoDb()
  await db.collection('support_tickets').updateOne({ id }, { $set: { status, updated_at: new Date().toISOString() } })
  return NextResponse.json({ ok: true, status })
}
