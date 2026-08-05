/**
 * POST /api/newsletter/unsubscribe — public (used by the email footer link).
 * Supports ?email= query param OR JSON body so the unsubscribe link in
 * newsletter emails works without JS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { newsletterSubscribers, nowIso } from '@/lib/db/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = (url.searchParams.get('email') || body.email || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
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
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
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
