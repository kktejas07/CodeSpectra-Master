/**
 * POST /api/events-feed/admin/test — superadmin. Body: { kind: 'digest'|'alert'|'reminder', email?, phone? }
 * Sends one test message built from current events (not recorded as a subscriber send).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { toE164 } from '@/lib/ats/phone'
import { sendTest } from '@/lib/events-feed/notify'
import { getEventsFeedSettings } from '@/lib/events-feed/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind = b.kind === 'alert' || b.kind === 'reminder' ? b.kind : 'digest'
  const email = typeof b.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ? b.email.trim().toLowerCase() : undefined
  const phone = typeof b.phone === 'string' && b.phone.trim() ? toE164(b.phone) || undefined : undefined
  if (!email && !phone) return NextResponse.json({ error: 'Enter a test email or WhatsApp number' }, { status: 400 })
  const result = await sendTest(kind, { email, phone }, await getEventsFeedSettings())
  return NextResponse.json({ ok: true, result })
}
