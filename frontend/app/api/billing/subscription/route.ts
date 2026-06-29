import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'

export async function GET() {
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
    console.error('[CodeSpectra] Subscription fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/** Update billing interval (month ↔ year) for the next renewal. */
export async function PUT(req: NextRequest) {
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
    console.error('[CodeSpectra] Subscription update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
