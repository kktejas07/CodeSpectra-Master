/**
 * POST /api/newsletter/admin/send-test-whatsapp — send a test WhatsApp message.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { sendWhatsAppText, isWhatsAppConfigured } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as {
    phone?: string
    message?: string
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (!phone) {
    return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : 'Test message from CodeSpectra'

  if (!(await isWhatsAppConfigured())) {
    return NextResponse.json({ error: 'WhatsApp not configured. Add OpenWA credentials in Settings > WhatsApp.' }, { status: 400 })
  }

  try {
    const result = await sendWhatsAppText(phone, message)
    if (result.success) {
      return NextResponse.json({ ok: true, messageId: result.messageId })
    } else {
      return NextResponse.json({ error: result.error || 'Failed to send' }, { status: 500 })
    }
  } catch (e) {
    console.error('[newsletter] whatsapp test error:', e)
    return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 })
  }
}
