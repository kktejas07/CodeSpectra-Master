import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import crypto from 'node:crypto'
import { logger } from '@/lib/logger'
import { bodyTimestampFresh, kycTransitionAllowed, mapDiditStatus } from '@/lib/kyc-webhook-rules'

export const runtime = 'nodejs'

// Whole-number floats (1.0) -> integers (1), recursively.
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    )
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v)
  return v
}

// Recursive lexicographic key sort (array order preserved).
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k])
        return acc
      }, {})
  }
  return v
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text()
  const sig = request.headers.get('x-signature-v2') || ''
  const ts = Number(request.headers.get('x-timestamp'))

  // 1. Freshness — reject anything older/newer than 300s (replay protection)
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return NextResponse.json({ error: 'stale' }, { status: 401 })
  }

  // 2. Canonicalise (shortenFloats -> sortKeys -> JSON.stringify with unescaped Unicode)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)))

  // 3. Constant-time HMAC-SHA256 compare against X-Signature-V2
  const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET || ''
  if (webhookSecret) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(canonical, 'utf8')
      .digest('hex')
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return NextResponse.json({ error: 'bad sig' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail-closed: unsigned KYC decisions must never be applied in production.
    logger.error('[Didit webhook] DIDIT_WEBHOOK_SECRET not configured — rejecting')
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 })
  }

  // 4. SEC-020: freshness from the signed body (the header isn't signed).
  if (bodyTimestampFresh(parsed) === false) {
    return NextResponse.json({ error: 'stale' }, { status: 401 })
  }

  // 5. Apply the decision
  const status = parsed.status as string
  const vendorData = parsed.vendor_data as string

  try {
    const db = await getMongoDb()

    // 6. Durable, cross-instance idempotency: one row per event (event_id, or
    //    the hash of the signed body when Didit sends none).
    const events = db.collection('kyc_webhook_events')
    await events.createIndex({ key: 1 }, { unique: true, name: 'kyc_webhook_events_key' }).catch(() => {})
    await events.createIndex({ received_at: 1 }, { expireAfterSeconds: 90 * 86_400, name: 'kyc_webhook_events_ttl' }).catch(() => {})
    const key = typeof parsed.event_id === 'string' && parsed.event_id
      ? `evt:${parsed.event_id}`
      : `sha:${crypto.createHash('sha256').update(canonical).digest('hex')}`
    try {
      await events.insertOne({ key, session_id: parsed.session_id ?? null, received_at: new Date() })
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) return NextResponse.json({ ok: true, duplicate: true })
      throw e
    }

    const dbStatus = mapDiditStatus(status)

    // 7. Never move a session backwards out of a final / manual decision.
    const current = await db.collection('kyc_sessions').findOne(
      { id: parsed.session_id as string },
      { projection: { _id: 0, status: 1, reviewed_by: 1 } },
    )
    if (!kycTransitionAllowed(current, dbStatus)) {
      logger.webhook(`[Didit webhook] Session ${parsed.session_id} already final — ignored ${status}`)
      return NextResponse.json({ ok: true, ignored: true })
    }

    // Update KYC session (guarded again in the filter against a race)
    await db.collection('kyc_sessions').updateOne(
      { id: parsed.session_id as string, status: { $nin: ['approved', 'rejected'] }, reviewed_by: null } as never,
      {
        $set: {
          status: dbStatus,
          result: parsed,
          updated_at: new Date().toISOString(),
        },
      }
    )

    // Update identity verification record for the user
    if (vendorData) {
      const decision = parsed.decision as Record<string, unknown> | undefined
      const idVerifications = decision?.id_verifications as Array<Record<string, unknown>> | undefined
      const livenessChecks = decision?.liveness_checks as Array<Record<string, unknown>> | undefined
      const faceMatches = decision?.face_matches as Array<Record<string, unknown>> | undefined
      const ipAnalyses = decision?.ip_analyses as Array<Record<string, unknown>> | undefined

      const idVer = idVerifications?.[0]
      const liveness = livenessChecks?.[0]
      const faceMatch = faceMatches?.[0]
      const ipAnalysis = ipAnalyses?.[0] as Record<string, unknown> | undefined

      await db.collection('identity_verifications').insertOne({
        id: crypto.randomUUID(),
        user_id: vendorData,
        provider: 'didit',
        session_id: parsed.session_id,
        status: dbStatus,
        result: {
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
          // Document images
          front_image: idVer?.front_image,
          back_image: idVer?.back_image,
          portrait_image: idVer?.portrait_image,
          // Liveness
          liveness_score: liveness?.score,
          liveness_method: liveness?.method,
          liveness_image: liveness?.reference_image,
          // Face match
          face_match_similarity: faceMatch?.score,
          face_match_source: faceMatch?.source_image,
          face_match_target: faceMatch?.target_image,
          // Device & IP
          vpn_detected: ipAnalysis?.is_vpn_or_tor,
          ip_address: ipAnalysis?.ip_address,
          ip_city: ipAnalysis?.ip_city,
          ip_country: ipAnalysis?.ip_country,
          device: ipAnalysis?.device_model,
          browser: ipAnalysis?.browser_family,
          isp: ipAnalysis?.isp,
          // Warnings
          warnings: [
            ...(Array.isArray(idVer?.warnings) ? idVer.warnings : []),
            ...(Array.isArray(liveness?.warnings) ? liveness.warnings : []),
            ...(Array.isArray(faceMatch?.warnings) ? faceMatch.warnings : []),
            ...(Array.isArray(ipAnalysis?.warnings) ? ipAnalysis.warnings : []),
          ],
        },
        raw_decision: parsed.decision,
        created_at: new Date().toISOString(),
      })
    }

    logger.webhook(`[Didit webhook] Session ${parsed.session_id} → ${status}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    logger.error('[Didit webhook]', e)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
