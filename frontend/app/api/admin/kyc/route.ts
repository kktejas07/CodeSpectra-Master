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

    // Get all KYC sessions (has full Didit data)
    const sessions = await db.collection('kyc_sessions')
      .find({})
      .sort({ created_at: -1 })
      .toArray()

    // Get user details
    const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))]
    const users = await db.collection('user')
      .find({ id: { $in: userIds } })
      .project({ id: 1, fullName: 1, email: 1 })
      .toArray()
    const userMap = new Map(users.map(u => [u.id, u]))

    // Enrich and deduplicate (keep latest per user)
    const userLatest = new Map<string, any>()
    for (const s of sessions) {
      const existing = userLatest.get(s.user_id)
      if (!existing || new Date(s.created_at) > new Date(existing.created_at)) {
        userLatest.set(s.user_id, s)
      }
    }

    const records = Array.from(userLatest.values()).map(s => {
      const decision = s.result?.decision || s.result
      const idVer = decision?.id_verifications?.[0]
      const liveness = decision?.liveness_checks?.[0]
      const faceMatch = decision?.face_matches?.[0]
      const ipAnalysis = decision?.ip_analyses?.[0]
      const u = userMap.get(s.user_id)

      return {
        id: s.id,
        user_id: s.user_id,
        user_name: u?.fullName || 'Unknown',
        user_email: u?.email || '',
        provider: s.provider || 'didit',
        status: s.status,
        document_type: idVer?.document_type,
        full_name: idVer?.first_name && idVer?.last_name
          ? `${idVer.first_name} ${idVer.last_name}`
          : undefined,
        document_number: idVer?.document_number,
        issuing_state: idVer?.issuing_state_name || idVer?.issuing_state,
        // Document images
        front_image: idVer?.front_image,
        back_image: idVer?.back_image,
        portrait_image: idVer?.portrait_image,
        // Biometric
        liveness_score: liveness?.score,
        face_match_similarity: faceMatch?.score,
        face_match_source: faceMatch?.source_image,
        face_match_target: faceMatch?.target_image,
        // Device & IP
        vpn_detected: ipAnalysis?.is_vpn_or_tor,
        ip_address: ipAnalysis?.ip_address,
        ip_city: ipAnalysis?.ip_city,
        device: ipAnalysis?.device_model,
        created_at: s.created_at,
      }
    })

    // Calculate stats
    const stats = {
      total: records.length,
      approved: records.filter(r => r.status === 'approved').length,
      rejected: records.filter(r => r.status === 'rejected').length,
      pending: records.filter(r => r.status === 'pending').length,
      manual_review: records.filter(r => r.status === 'manual_review').length,
    }

    return NextResponse.json({ records, stats })
  } catch (e) {
    console.error('[Admin KYC]', e)
    return NextResponse.json({ error: 'Failed to fetch KYC records' }, { status: 500 })
  }
}
