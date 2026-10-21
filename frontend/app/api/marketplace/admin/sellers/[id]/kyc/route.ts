import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

/** GET → full KYC + payout details (decrypted; every view is written to the audit log) + history. */
export async function GET(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Seller not found', code: 'mkt_seller_not_found' }, 404)
  try {
    const { revealKyc } = await import('@/lib/marketplace/sellers')
    return json(await revealKyc(g.user.id, id))
  } catch (e) {
    return errorResponse(e, 'kyc reveal')
  }
}
