import type { NextRequest } from 'next/server'
import { errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

/** GET ?before=<iso>&currency=INR|USD → { balances, entries } */
export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const sp = new URL(req.url).searchParams
    const { balancesFor, listEntries } = await import('@/lib/marketplace/ledger')
    const before = sp.get('before')
    const cur = sp.get('currency')
    const [balances, entries] = await Promise.all([
      balancesFor(g.seller.id),
      listEntries(g.seller.id, { before: before && !Number.isNaN(Date.parse(before)) ? before : null, currency: cur === 'INR' || cur === 'USD' ? cur : null, limit: 100 }),
    ])
    return json({ balances, entries: entries.map(({ idem_key: _k, ...e }) => e) })
  } catch (e) {
    return errorResponse(e, 'ledger')
  }
}
