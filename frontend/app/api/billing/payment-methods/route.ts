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
    console.error('[CodeSpectra] Payment methods fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
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
    console.error('[CodeSpectra] Payment method create error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
