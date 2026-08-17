import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { mergeGeneralPlatformSettings } from '@/lib/platform-general-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await getMongoDb()
    const col = db.collection('platform_settings')
    const doc = await col.findOne({ key: 'general' })
    const merged = mergeGeneralPlatformSettings(doc?.value as Record<string, unknown> | undefined)
    
    // Only expose safe public settings
    return NextResponse.json({
      settings: {
        platform_name: merged.platform_name,
        platform_tagline: merged.platform_tagline,
        logo_url: merged.logo_url,
        favicon_url: merged.favicon_url,
        allow_registration: merged.allow_registration,
        maintenance_mode: merged.maintenance_mode,
        enable_chatbot: merged.enable_chatbot,
        enable_sso_login: merged.enable_sso_login,
        company_name: merged.company_name,
        copyright_text: merged.copyright_text,
        privacy_policy_url: merged.privacy_policy_url,
        terms_of_service_url: merged.terms_of_service_url,
        platform_currency: merged.platform_currency,
        video_player_primary_color: merged.video_player_primary_color,
        video_player_autoplay: merged.video_player_autoplay,
        video_player_muted: merged.video_player_muted,
        video_player_logo_url: merged.video_player_logo_url,
        video_player_logo_link_url: merged.video_player_logo_link_url,
      }
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
