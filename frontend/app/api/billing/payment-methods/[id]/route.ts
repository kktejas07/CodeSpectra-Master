import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    await ps.detachPaymentMethod(user.id, user.email, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[payment-methods] DELETE:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
