import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, bodyOf, errorResponse, idOk, json } from '@/lib/marketplace/seller-api'

/** POST { action: approve|paid|failed|reconcile, ref?, reason? } */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Payout not found' }, 404)
  try {
    const b = await bodyOf(req)
    const { decidePayout, reconcilePayout } = await import('@/lib/marketplace/payouts')
    if (b.action === 'reconcile') return json({ payout: await reconcilePayout(g.user.id, id) })
    const action = (['approve', 'paid', 'failed'] as const).find((x) => x === b.action)
    if (!action) return json({ error: 'Unknown action' }, 400)
    return json({ payout: await decidePayout(g.user.id, id, action, { ref: typeof b.ref === 'string' ? b.ref : null, reason: typeof b.reason === 'string' ? b.reason : null }) })
  } catch (e) {
    return errorResponse(e, 'payout decide')
  }
}
