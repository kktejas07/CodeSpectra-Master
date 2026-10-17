import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { setPending2faCookie, setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { createUserSession } from '@/lib/db/sessions'
import { isIpBlocked, isIpOutsideWhitelist } from '@/lib/db/security'

export const dynamic = 'force-dynamic'

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(A: number[], B: number[]) {
  if (A.length !== B.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = await rateLimitRedis(`face-login:ip:${ipKey}`, 5, 3600_000)
    if (!ipCheck.ok) {
      return NextResponse.json({ error: 'Too many biometric login attempts from this location. Try again later.' }, { status: 429 })
    }

    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
    if (await isIpBlocked(rawIp) || await isIpOutsideWhitelist(rawIp)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { email, descriptor } = await request.json()

    if (!email || !descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return NextResponse.json({ error: 'Email and a valid 128-dimensional biometric descriptor are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ email: normalizedEmail })

    if (!user) {
      // Don't leak that the user doesn't exist
      return NextResponse.json({ error: 'Authentication failed. Face does not match or user not found.' }, { status: 401 })
    }

    if (!user.facial_biometric_template) {
      return NextResponse.json({ error: 'No biometric template enrolled for this user.' }, { status: 400 })
    }

    // Compare face embeddings
    const similarityScore = cosineSimilarity(descriptor, user.facial_biometric_template);
    
    // Threshold > 0.85 indicates a very strong match for 128d embeddings (face-api.js)
    if (similarityScore < 0.85) {
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'denied', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + user._id.toString(), resourceType: 'auth', severity: 'warning', user_id: user._id.toString(), detail: `Biometric login failed. Score: ${similarityScore.toFixed(3)}` })
      return NextResponse.json({ error: 'Face does not match the enrolled template.' }, { status: 401 })
    }

    // Face matched. Same uid shape as password login (lib/session + route-auth key on `id`).
    const uid = String(user.id || user._id)
    const role = normalizeUserRole(user.role)

    // 2FA users must still pass their second factor — park them in a short
    // pending cookie and finish via POST /api/auth/two-factor.
    if (user.totp_enabled) {
      await setPending2faCookie({ uid, email: normalizedEmail, role, method: 'face' })
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid, detail: 'face matched; awaiting 2FA code' })
      return NextResponse.json({ twoFactorRequired: true })
    }

    await setSessionCookie({ uid, email: normalizedEmail, role })
    await writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid })
    
    const userAgent = request.headers.get('user-agent') || 'Unknown device'
    createUserSession({ user_id: uid, email: normalizedEmail, ip: rawIp, user_agent: userAgent }).catch(() => {})

    return NextResponse.json({ 
      user: { id: uid, email: normalizedEmail, role, name: user.name } 
    })

  } catch (error) {
    console.error('[FaceVerify] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
