import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const db = await getMongoDb()

    // Get all identity verification records
    const records = await db.collection('identity_verifications')
      .find({})
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()

    // Get user details for each record
    const userIds = [...new Set(records.map(r => r.user_id).filter(Boolean))]
    const users = await db.collection('user')
      .find({ id: { $in: userIds } })
      .project({ id: 1, fullName: 1, email: 1 })
      .toArray()
    const userMap = new Map(users.map(u => [u.id, u]))

    // Enrich records with user info
    const enrichedRecords = records.map(r => ({
      id: r.id,
      user_id: r.user_id,
      user_name: userMap.get(r.user_id)?.fullName || 'Unknown',
      user_email: userMap.get(r.user_id)?.email || '',
      provider: r.provider || 'unknown',
      status: r.status,
      document_type: r.result?.document_type,
      full_name: r.result?.full_name,
      liveness_score: r.result?.liveness_score,
      face_match_similarity: r.result?.face_match_similarity,
      vpn_detected: r.result?.vpn_detected,
      created_at: r.created_at,
    }))

    // Calculate stats
    const stats = {
      total: records.length,
      approved: records.filter(r => r.status === 'approved').length,
      rejected: records.filter(r => r.status === 'rejected').length,
      pending: records.filter(r => r.status === 'pending').length,
      manual_review: records.filter(r => r.status === 'manual_review').length,
    }

    return NextResponse.json({ records: enrichedRecords, stats })
  } catch (e) {
    console.error('[Admin KYC]', e)
    return NextResponse.json({ error: 'Failed to fetch KYC records' }, { status: 500 })
  }
}
