/**
 * POST /api/newsletter/unsubscribe — public (used by the email footer link).
 * Supports ?email= query param OR JSON body so the unsubscribe link in
 * newsletter emails works without JS.
 * Supports optional HMAC token (t=) for secure unsubscribe links.
 */
import { NextRequest, NextResponse } from 'next/server'
import { newsletterSubscribers, nowIso } from '@/lib/db/newsletter'
import { createHmac } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifyHmacToken(email: string, token: string): boolean {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'codespectra-default-secret'
  const expected = createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 16)
  return token === expected
}

function generateHmacToken(email: string): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'codespectra-default-secret'
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 16)
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = (url.searchParams.get('email') || body.email || '').trim().toLowerCase()
  const token = url.searchParams.get('t') || ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  // If token is provided, verify it
  if (token && !verifyHmacToken(email, token)) {
    return NextResponse.json({ error: 'Invalid unsubscribe token' }, { status: 403 })
  }

  try {
    const col = await newsletterSubscribers()
    const res = await col.updateMany(
      { email, status: 'subscribed' },
      { $set: { status: 'unsubscribed', unsubscribed_at: nowIso() } },
    )
    return NextResponse.json({ ok: true, unsubscribed: res.modifiedCount })
  } catch (e) {
    console.error('[newsletter] unsubscribe error:', e)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}

/** Allow a plain GET from an email link (best-effort UX). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = (url.searchParams.get('email') || '').trim().toLowerCase()
  const token = url.searchParams.get('t') || ''

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // If token is provided, verify it
  if (token && !verifyHmacToken(email, token)) {
    return NextResponse.json({ error: 'Invalid unsubscribe token' }, { status: 403 })
  }

  try {
    const col = await newsletterSubscribers()
    await col.updateMany(
      { email, status: 'subscribed' },
      { $set: { status: 'unsubscribed', unsubscribed_at: nowIso() } },
    )
    return NextResponse.json({ ok: true, message: 'Unsubscribed. You will no longer receive CodeSpectra newsletters.' })
  } catch {
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
