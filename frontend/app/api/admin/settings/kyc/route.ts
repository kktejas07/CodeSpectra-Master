import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'

const STRING_KEYS = [
  'didit_api_key', 'didit_sandbox_api_key', 'didit_webhook_secret', 'didit_workflow_id',
  'digilocker_client_id', 'digilocker_client_secret', 'apisetu_client_id', 'apisetu_client_secret',
  'anon_aadhaar_nullifier_seed',
] as const
const ENUM_KEYS: Record<string, string[]> = {
  identity_kyc: ['didit', 'digilocker', 'off'],
  exam_aadhaar: ['anon_aadhaar', 'ocr_face', 'off'],
  profile_aadhaar: ['anon_aadhaar', 'off'],
}

// GET: Get KYC settings
export async function GET(): Promise<NextResponse> {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  try {
    const db = await getMongoDb()
    const settings = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    return NextResponse.json(settings?.value || {})
  } catch (e) {
    console.error('[KYC settings GET]', e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// POST: Save KYC settings
export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user

  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
    // Whitelist: only known provider fields are stored (strings capped, enums checked).
    const value: Record<string, unknown> = {}
    for (const k of STRING_KEYS) if (typeof raw[k] === 'string') value[k] = (raw[k] as string).trim().slice(0, 2000)
    for (const [k, allowed] of Object.entries(ENUM_KEYS)) if (allowed.includes(String(raw[k]))) value[k] = raw[k]
    if (typeof raw.anon_aadhaar_test_mode === 'boolean') value.anon_aadhaar_test_mode = raw.anon_aadhaar_test_mode
    const db = await getMongoDb()
    const prev = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })

    await db.collection('platform_settings').updateOne(
      { key: 'kyc_providers' },
      { $set: { value: { ...(prev?.value || {}), ...value }, updated_at: new Date().toISOString() } },
      { upsert: true }
    )
    await auditAdmin(user, 'admin.settings.kyc_update', 'platform_settings', 'section/kyc', Object.keys(value).join(','), 'warning')

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[KYC settings POST]', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
