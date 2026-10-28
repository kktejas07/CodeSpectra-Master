/**
 * Marketplace money safety net (AUTO-070). A Stripe seller payout moves to
 * `paying` right before transfers.create; if the process dies or Stripe times
 * out it used to stay there until an admin pressed Reconcile. This hourly
 * sweep reconciles payouts stuck in `paying` for 15+ minutes (the same
 * idempotent path as the admin button: transfer group + idempotency key, so
 * money is never sent twice) and alerts admins about any older than a day.
 */
import { getMongoDb } from '@/lib/mongodb'
import type { SystemAutomation } from './types'

const STUCK_AFTER_MS = 15 * 60_000
const ALERT_AFTER_MS = 24 * 3_600_000

export async function reconcileStuckPayouts(now = new Date(), limit = 20): Promise<{ checked: number; settled: number; still_stuck: number }> {
  const db = await getMongoDb()
  const rows = (await db.collection('mkt_payouts')
    .find({ status: 'paying', paying_at: { $lte: new Date(now.getTime() - STUCK_AFTER_MS).toISOString() } }, { projection: { _id: 0, id: 1, paying_at: 1 } })
    .sort({ paying_at: 1 }).limit(limit).toArray()) as unknown as { id: string; paying_at?: string }[]
  const out = { checked: 0, settled: 0, still_stuck: 0 }
  const old: string[] = []
  const { reconcilePayout } = await import('@/lib/marketplace/payouts')
  for (const p of rows) {
    out.checked++
    try {
      const r = await reconcilePayout('system', p.id)
      if (r.status !== 'paying') { out.settled++; continue }
    } catch (e) {
      console.error('[automation/payouts] reconcile failed:', p.id, (e as Error)?.message?.slice(0, 160))
    }
    out.still_stuck++
    if (p.paying_at && now.getTime() - Date.parse(p.paying_at) > ALERT_AFTER_MS) old.push(p.id)
  }
  if (old.length) {
    const { sendAdminAlert } = await import('../alerts')
    await sendAdminAlert({
      key: `payouts-stuck:${old.sort().join(',').slice(0, 200)}`,
      title: 'Seller payouts stuck in progress',
      detail: `${old.length} Stripe payout(s) have been “paying” for more than a day and could not be reconciled automatically. Check them in the marketplace admin.`,
      severity: 'critical',
      link: '/dashboard/admin/marketplace?tab=payouts',
      windowMinutes: 24 * 60,
    }, now)
  }
  return out
}

export const MARKETPLACE_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'payout-reconciliation',
    title: 'Stuck seller payout reconciliation',
    description: 'Hourly: settles Stripe seller payouts left “paying” for 15+ minutes (never sends money twice) and alerts admins about any stuck for over a day.',
    group: 'Billing',
    refs: ['AUTO-070'],
    cadence: { kind: 'interval', minutes: 60 },
    run: async (now) => reconcileStuckPayouts(now),
  },
]
