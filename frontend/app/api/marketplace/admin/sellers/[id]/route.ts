import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, bodyOf, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

/** POST { action: approve|reject|suspend|reinstate, note? } or { commission_bps: number | null } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Seller not found' }, 404)
  try {
    const b = await bodyOf(req)
    const { decideSeller, setSellerCommission, publicSeller, getSellerById } = await import('@/lib/marketplace/sellers')
    if ('commission_bps' in b) {
      const v = b.commission_bps === null || b.commission_bps === '' ? null : Number(b.commission_bps)
      await setSellerCommission(g.user.id, id, v)
      const s = await getSellerById(id)
      return json({ seller: s ? publicSeller(s) : null })
    }
    const action = (['approve', 'reject', 'suspend', 'reinstate'] as const).find((a) => a === b.action)
    if (!action) return json({ error: 'Unknown action' }, 400)
    return json({ seller: publicSeller(await decideSeller(g.user.id, id, action, typeof b.note === 'string' ? b.note : null)) })
  } catch (e) {
    return errorResponse(e, 'seller decide')
  }
}
