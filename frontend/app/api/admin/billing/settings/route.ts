import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { billingSettingsPatch, getBillingSettings, saveBillingSettings } from '@/lib/billing/settings'
import { GST_STATES } from '@/lib/billing/gst'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    return NextResponse.json({ settings: await getBillingSettings({ fresh: true }), states: GST_STATES })
  } catch (e) {
    console.error('[admin/billing/settings] GET', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

export async function PUT(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = billingSettingsPatch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid settings', code: 'invalid_request' }, { status: 400 })
  try {
    const settings = await saveBillingSettings(parsed.data, gate.user.id)
    await auditAdmin(gate.user, 'admin.billing.settings', 'billing', 'billing/settings', Object.keys(parsed.data).join(','))
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('[admin/billing/settings] PUT', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
