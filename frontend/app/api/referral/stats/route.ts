import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { maskEmail } from '@/lib/referral-rules'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('referrals')
    const userId = gate.user.id

    const codeDoc = await col.findOne({ referrer_id: userId, kind: { $ne: 'redemption' } })
    if (!codeDoc) {
      return NextResponse.json({ code: null, url: null, total_referrals: 0, completed_referrals: 0, pending_referrals: 0, total_xp_earned: 0, total_commission_earned: 0, referrals: [] })
    }

    // Pending referrals may have qualified since (e-mail verified + first graded activity).
    const pending = await col.find({ referrer_id: userId, kind: 'redemption', status: 'pending' }, { projection: { referred_id: 1 } }).limit(20).toArray()
    if (pending.length) {
      const { completeReferralIfEligible } = await import('@/lib/referral-service')
      for (const p of pending) await completeReferralIfEligible(db, String(p.referred_id)).catch(() => {})
    }

    const referrals = await col.find({ referrer_id: userId, referred_id: { $ne: '' } }).sort({ created_at: -1 }).toArray()

    const userCol = db.collection('user')
    const referralsWithNames = await Promise.all(
      referrals.map(async (r) => {
        const user = await userCol.findOne({ id: r.referred_id }, { projection: { name: 1, fullName: 1, email: 1 } })
        return {
          name: user?.fullName || user?.name || 'New member',
          // Referrers see a masked address only.
          email: maskEmail(r.referred_email || user?.email),
          status: r.status,
          date: r.created_at,
        }
      })
    )

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    return NextResponse.json({
      code: codeDoc.referral_code,
      url: `${baseUrl}/auth/signup?ref=${codeDoc.referral_code}`,
      total_referrals: referrals.length,
      completed_referrals: referrals.filter((r) => r.status === 'completed' || r.status === 'commissioned').length,
      pending_referrals: referrals.filter((r) => r.status === 'pending').length,
      total_xp_earned: referrals.reduce((sum, r) => sum + (r.xp_awarded || 0), 0),
      total_commission_earned: referrals.reduce((sum, r) => sum + (r.commission_earned || 0), 0),
      referrals: referralsWithNames,
    })
  } catch (e) {
    console.error('[referral/stats] error:', e)
    return NextResponse.json({ error: 'Failed to fetch referral stats' }, { status: 500 })
  }
}
