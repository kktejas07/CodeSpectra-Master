/**
 * Marketplace integration seams: an admin-approved refund always goes through
 * the buyer part's refund executor (gateway refund), even on a cold process
 * where nothing "registered" it first; a failed refund reopens the request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
const exec = vi.hoisted(() => ({ refundLines: vi.fn(async (..._a: unknown[]) => {}) }))
vi.mock('@/lib/marketplace/orders', () => ({ refundLines: (...a: unknown[]) => exec.refundLines(...a) }))
const ledger = vi.hoisted(() => ({ recordRefund: vi.fn(async () => {}) }))
vi.mock('@/lib/marketplace/ledger', () => ({ recordRefund: ledger.recordRefund }))
vi.mock('@/lib/notifications', () => ({ notify: vi.fn(async () => null) }))
vi.mock('@/lib/marketplace/seller-notify', () => ({ notifySeller: vi.fn(async () => {}), notifyAdmins: vi.fn(async () => {}) }))

import { decideRefund } from '@/lib/marketplace/moderation'
import { __resetMarketplaceIndexes } from '@/lib/marketplace/db'

async function seed() {
  await db.current.collection('mkt_orders').insertOne({
    id: 'o1', number: 'CS-1', buyer_id: 'b1', currency: 'INR', grand_total: 5000, status: 'paid',
    lines: [{ id: 'l1', seller_id: 's1', line_total: 5000 }],
  } as never)
  await db.current.collection('mkt_refunds').insertOne({
    id: 'r1', order_id: 'o1', buyer_id: 'b1', seller_id: 's1', line_ids: ['l1'], currency: 'INR', amount: 5000, reason: 'x', type: 'refund', status: 'open',
  } as never)
}

beforeEach(() => {
  db.current = new FakeDb()
  __resetMarketplaceIndexes()
  vi.clearAllMocks()
})

describe('admin refund approval', () => {
  it('moves money via refundLines without any prior registration (cold process)', async () => {
    await seed()
    const out = await decideRefund('admin1', 'r1', 'approve')
    expect(exec.refundLines).toHaveBeenCalledWith('o1', ['l1'], 5000, 'r1', { reason: 'approved', restock: true })
    expect(ledger.recordRefund).not.toHaveBeenCalled() // never a ledger-only refund
    expect(out.via).toBe('buyer_part')
    const r = await db.current.collection('mkt_refunds').findOne({ id: 'r1' })
    expect(r?.status).toBe('refunded')
  })

  it('reopens the request when the gateway refund fails', async () => {
    await seed()
    exec.refundLines.mockRejectedValueOnce(new Error('gateway down'))
    await expect(decideRefund('admin1', 'r1', 'approve')).rejects.toThrow(/open again/)
    const r = await db.current.collection('mkt_refunds').findOne({ id: 'r1' })
    expect(r?.status).toBe('open')
    expect(ledger.recordRefund).not.toHaveBeenCalled()
  })
})
