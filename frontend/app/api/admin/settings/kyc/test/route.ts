import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: Test connection to a KYC provider
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')

  if (!provider) {
    return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const settings = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    const config = settings?.value || {}

    switch (provider) {
      case 'didit': {
        const apiKey = config.didit_api_key
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key not configured' })
        }
        // Test by listing workflows
        const res = await fetch('https://verification.didit.me/v3/workflows/', {
          headers: { 'x-api-key': apiKey },
        })
        if (res.ok) {
          return NextResponse.json({ success: true })
        } else {
          const detail = await res.text()
          return NextResponse.json({ success: false, error: `HTTP ${res.status}: ${detail}` })
        }
      }

      case 'digilocker':
      case 'apisetu': {
        const clientId = config[`${provider}_client_id`]
        const clientSecret = config[`${provider}_client_secret`]
        if (!clientId || !clientSecret) {
          return NextResponse.json({ success: false, error: 'Credentials not configured' })
        }
        // Basic validation - check format
        if (clientId.length < 10 || clientSecret.length < 10) {
          return NextResponse.json({ success: false, error: 'Credentials appear invalid (too short)' })
        }
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ success: false, error: 'Unknown provider' })
    }
  } catch (e) {
    console.error('[KYC test]', e)
    return NextResponse.json({ success: false, error: 'Connection test failed' })
  }
}
