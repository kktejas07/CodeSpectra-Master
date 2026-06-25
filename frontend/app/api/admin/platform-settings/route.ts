import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import {
  mergeGeneralPlatformSettings,
  normalizeAdminNewUserEmailDelivery,
} from '@/lib/platform-general-settings'

const GENERAL_KEY = 'general'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY' },
      { status: 503 }
    )
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', GENERAL_KEY)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const merged = mergeGeneralPlatformSettings(data?.value as Record<string, unknown> | undefined)
  return NextResponse.json({ settings: merged })
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY' },
      { status: 503 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { data: existing, error: readErr } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', GENERAL_KEY)
    .maybeSingle()

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }

  const prev = mergeGeneralPlatformSettings(existing?.value as Record<string, unknown> | undefined)
  const next: Record<string, unknown> = { ...prev }

  const allowedKeys = [
    'platform_name',
    'platform_tagline',
    'support_email',
    'support_link_url',
    'timezone',
    'default_locale',
    'allow_registration',
    'email_notifications',
    'maintenance_mode',
    'require_email_verification',
    'show_public_leaderboard',
    'admin_new_user_email_delivery',
  ] as const

  for (const k of allowedKeys) {
    if (!(k in body)) continue
    const v = body[k]
    if (k === 'allow_registration' || k === 'email_notifications' || k === 'maintenance_mode') {
      next[k] = Boolean(v)
      continue
    }
    if (k === 'require_email_verification' || k === 'show_public_leaderboard') {
      next[k] = Boolean(v)
      continue
    }
    if (k === 'admin_new_user_email_delivery') {
      next[k] = normalizeAdminNewUserEmailDelivery(v)
      continue
    }
    if (typeof v === 'string') {
      next[k] = v
    }
  }

  const mergedNext = mergeGeneralPlatformSettings(next)

  const { error: writeErr } = await supabase.from('platform_settings').upsert(
    {
      key: GENERAL_KEY,
      value: mergedNext as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 })
  }

  return NextResponse.json({ settings: mergedNext })
}
