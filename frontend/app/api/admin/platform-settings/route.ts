import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  mergeGeneralPlatformSettings,
  normalizeAdminNewUserEmailDelivery,
} from '@/lib/platform-general-settings'
import { getMongoDb } from '@/lib/mongodb'
import { invalidateCurrencyCache } from '@/lib/server-currency'
import type { Collection } from 'mongodb'

const GENERAL_KEY = 'general'
const GAMIFICATION_KEY = 'gamification'

const GAMIFICATION_DEFAULTS: Record<string, unknown> = {
  xp_submission_easy: 10,
  xp_submission_medium: 25,
  xp_submission_hard: 50,
  xp_first_blood: 25,
  xp_exam_pass: 50,
  xp_cert_pass: 100,
  xp_codeathon: 20,
  xp_hackathon: 100,
  xp_daily_login: 5,
  xp_streak_7day: 25,
  xp_streak_30day: 100,
  level_2_xp: 100,
  level_5_xp: 500,
  level_10_xp: 2000,
  level_20_xp: 8000,
  level_50_xp: 50000,
  streak_multiplier: 1.5,
  streak_freeze_enabled: true,
  referral_xp_bonus: 500,
  referral_commission_percent: 10,
  badge_hackathon_enabled: true,
  badge_exam_enabled: true,
  badge_cert_enabled: true,
  badge_streak_enabled: true,
}

interface PlatformSettingDoc {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

async function settingsCol(): Promise<Collection<PlatformSettingDoc>> {
  return (await getMongoDb()).collection<PlatformSettingDoc>('platform_settings')
}

export async function GET(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section') || 'general'
    const col = await settingsCol()
    if (section === 'gamification') {
      const doc = await col.findOne({ key: GAMIFICATION_KEY })
      const merged: Record<string, unknown> = { ...GAMIFICATION_DEFAULTS, ...(doc?.value || {}) }
      return NextResponse.json({ settings: merged })
    }
    const doc = await col.findOne({ key: GENERAL_KEY })
    const merged = mergeGeneralPlatformSettings(doc?.value)
    return NextResponse.json({ settings: merged })
  } catch (e) {
    console.error('[CodeSpectra] admin/platform-settings:', e)
    return NextResponse.json({ error: 'Platform settings request failed' }, { status: 500 })
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

  const section = (body.section as string) || 'general'

  if (section === 'gamification') {
    try {
      const col = await settingsCol()
      const existing = await col.findOne({ key: GAMIFICATION_KEY })
      const prev: Record<string, unknown> = { ...GAMIFICATION_DEFAULTS, ...(existing?.value || {}) }
      const next: Record<string, unknown> = { ...prev }
      for (const [k, v] of Object.entries(body)) {
        if (k === 'section') continue
        if (!(k in GAMIFICATION_DEFAULTS)) continue
        if (typeof GAMIFICATION_DEFAULTS[k] === 'boolean') {
          next[k] = Boolean(v)
        } else if (typeof GAMIFICATION_DEFAULTS[k] === 'number') {
          const n = Number(v)
          next[k] = Number.isFinite(n) ? n : GAMIFICATION_DEFAULTS[k]
        } else {
          next[k] = v
        }
      }
      await col.updateOne(
        { key: GAMIFICATION_KEY },
        { $set: { value: next, updated_at: new Date().toISOString() } },
        { upsert: true },
      )
      return NextResponse.json({ settings: next })
    } catch (e) {
      console.error('[CodeSpectra] admin/platform-settings:', e)
      return NextResponse.json({ error: 'Platform settings request failed' }, { status: 500 })
    }
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
    'enable_sso_login',
    'enable_chatbot',
    'admin_new_user_email_delivery',
    'platform_currency',
    'locked_pages',
    'locked_features',
    'company_name',
    'copyright_text',
    'company_address',
    'website_url',
    'privacy_policy_url',
    'terms_of_service_url',
    'certificate_template',
    'video_player_primary_color',
    'video_player_autoplay',
    'video_player_muted',
    'video_player_captions_default',
    'video_player_logo_url',
    'video_player_logo_link_url',
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
        k === 'show_public_leaderboard' ||
        k === 'enable_sso_login' ||
        k === 'enable_chatbot' ||
        k === 'video_player_autoplay' ||
        k === 'video_player_muted' ||
        k === 'video_player_captions_default'
      ) {
        next[k] = Boolean(v)
        continue
      }
      if (k === 'admin_new_user_email_delivery') {
        next[k] = normalizeAdminNewUserEmailDelivery(v)
        continue
      }
      if (k === 'locked_pages' || k === 'locked_features') {
        next[k] = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []
        continue
      }
      if (k === 'certificate_template') {
        if (['classic', 'modern', 'minimal', 'professional', 'corporate', 'academic'].includes(v as string)) next[k] = v
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
    invalidateCurrencyCache()
    return NextResponse.json({ settings: mergedNext })
  } catch (e) {
    console.error('[CodeSpectra] admin/platform-settings:', e)
    return NextResponse.json({ error: 'Platform settings request failed' }, { status: 500 })
  }
}
