import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
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
    console.error('[CodeSpectra] Payment method PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
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
    console.error('[CodeSpectra] Payment method DELETE error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
