/**
 * WhatsApp practice settings (superadmin): on/off, quiet hours, daily cap, mock day + size,
 * XP, inbound rate limit and the Meta template names (docs/whatsapp/practice-and-guardian-templates.md).
 * GET → settings · PUT settings → saved (validated onto the defaults)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { apiErrorBody } from '@/lib/api-errors'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const a = await requireSuperAdmin()
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { getPracticeSettings } = await import('@/lib/wa-practice/store')
  return NextResponse.json({ settings: await getPracticeSettings(true) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest) {
  const a = await requireSuperAdmin()
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json(apiErrorBody('Invalid JSON', 'invalid_json'), { status: 400 })
  const { savePracticeSettings } = await import('@/lib/wa-practice/store')
  const settings = await savePracticeSettings(sanitizeMongoInput(body as Record<string, unknown>), a.user.id)
  await auditAdmin(a.user, 'wa_practice.settings', 'settings', 'wa_practice', JSON.stringify({ enabled: settings.enabled, max_daily_cap: settings.max_daily_cap }))
  return NextResponse.json({ settings })
}
