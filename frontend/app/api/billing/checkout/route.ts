import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'

/** Backward-compatible: `GET /api/billing/checkout?plan=pro&interval=month` completes checkout and redirects. */
export async function GET(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    return NextResponse.redirect(new URL('/dashboard/billing?error=no_service_key', req.url))
  } catch (error) {
    console.error('[CodeSpectra] Checkout GET error:', error)
    return NextResponse.redirect(new URL('/dashboard/billing?error=checkout', req.url))
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(
      { error: 'Billing is not configured. Please configure a payment provider.' },
      { status: 503 }
    )
  } catch (error) {
    console.error('[CodeSpectra] Checkout POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
