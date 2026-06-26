import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  mergeGeneralPlatformSettings,
  normalizeAdminNewUserEmailDelivery,
} from '@/lib/platform-general-settings'
import { getMongoDb } from '@/lib/mongodb'
import type { Collection } from 'mongodb'

const GENERAL_KEY = 'general'

interface PlatformSettingDoc {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

async function settingsCol(): Promise<Collection<PlatformSettingDoc>> {
  return (await getMongoDb()).collection<PlatformSettingDoc>('platform_settings')
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await settingsCol()
    const doc = await col.findOne({ key: GENERAL_KEY })
    const merged = mergeGeneralPlatformSettings(doc?.value)
    return NextResponse.json({ settings: merged })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

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

  try {
    const col = await settingsCol()
    const existing = await col.findOne({ key: GENERAL_KEY })
    const prev = mergeGeneralPlatformSettings(existing?.value)
    const next: Record<string, unknown> = { ...prev }

    for (const k of allowedKeys) {
      if (!(k in body)) continue
      const v = body[k]
      if (
        k === 'allow_registration' ||
        k === 'email_notifications' ||
        k === 'maintenance_mode' ||
        k === 'require_email_verification' ||
        k === 'show_public_leaderboard'
      ) {
        next[k] = Boolean(v)
        continue
      }
      if (k === 'admin_new_user_email_delivery') {
        next[k] = normalizeAdminNewUserEmailDelivery(v)
        continue
      }
      if (typeof v === 'string') next[k] = v
    }

    const mergedNext = mergeGeneralPlatformSettings(next)
    await col.updateOne(
      { key: GENERAL_KEY },
      { $set: { value: mergedNext as Record<string, unknown>, updated_at: new Date().toISOString() } },
      { upsert: true },
    )
    return NextResponse.json({ settings: mergedNext })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
