import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('referrals')
    const userId = gate.user.id

    const codeDoc = await col.findOne({ referrer_id: userId })
    if (!codeDoc) {
      return NextResponse.json({ code: null, url: null, total_referrals: 0, completed_referrals: 0, pending_referrals: 0, total_xp_earned: 0, total_commission_earned: 0, referrals: [] })
    }

    const referrals = await col.find({ referrer_id: userId, referred_id: { $ne: '' } }).sort({ created_at: -1 }).toArray()

    const userCol = db.collection('user')
    const referralsWithNames = await Promise.all(
      referrals.map(async (r) => {
        const user = await userCol.findOne({ id: r.referred_id }, { projection: { name: 1, email: 1 } })
        return {
          name: user?.name || user?.email?.split('@')[0] || 'Unknown',
          email: r.referred_email || user?.email || '',
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
