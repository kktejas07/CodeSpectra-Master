import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()

    // Get latest KYC session for this user (has full Didit data)
    const session = await db.collection('kyc_sessions')
      .findOne({ user_id: user.id }, { sort: { created_at: -1 } })

    if (!session) {
      return NextResponse.json({
        kyc_status: 'none',
        verified: false,
        provider: null,
        session_id: null,
        result: null,
        created_at: null,
      })
    }

    // Extract result from session (full Didit data)
    const decision = session.result?.decision || session.result
    const idVer = decision?.id_verifications?.[0]
    const liveness = decision?.liveness_checks?.[0]
    const faceMatch = decision?.face_matches?.[0]
    const ipAnalysis = decision?.ip_analyses?.[0]

    const result = {
      document_type: idVer?.document_type,
      full_name: idVer?.first_name && idVer?.last_name
        ? `${idVer.first_name} ${idVer.last_name}`
        : undefined,
      first_name: idVer?.first_name,
      last_name: idVer?.last_name,
      date_of_birth: idVer?.date_of_birth,
      gender: idVer?.gender,
      age: idVer?.age,
      document_number: idVer?.document_number,
      issuing_state: idVer?.issuing_state_name || idVer?.issuing_state,
      nationality: idVer?.nationality,
      address: idVer?.formatted_address,
      liveness_score: liveness?.score,
      liveness_method: liveness?.method,
      face_match_similarity: faceMatch?.score,
      vpn_detected: ipAnalysis?.is_vpn_or_tor,
      ip_address: ipAnalysis?.ip_address,
      ip_city: ipAnalysis?.ip_city,
      ip_country: ipAnalysis?.ip_country,
      device: ipAnalysis?.device_model,
      browser: ipAnalysis?.browser_family,
      isp: ipAnalysis?.isp,
      warnings: [
        ...(idVer?.warnings || []),
        ...(liveness?.warnings || []),
        ...(faceMatch?.warnings || []),
        ...(ipAnalysis?.warnings || []),
      ],
    }

    return NextResponse.json({
      kyc_status: session.status,
      verified: session.status === 'approved',
      provider: session.provider,
      session_id: session.id,
      result,
      created_at: session.created_at,
    })
  } catch (e) {
    console.error('[KYC status]', e)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
