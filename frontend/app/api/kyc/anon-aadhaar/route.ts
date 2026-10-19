import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getKycPurposeConfig } from '@/lib/kyc-purposes-server'
import { anonAadhaarSignal, anonAadhaarSignalHash, checkAnonAadhaarBinding } from '@/lib/anon-aadhaar-binding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { proof?: Record<string, unknown>; purpose?: 'exam' | 'profile' }

function userFilter(userId: string) {
  return { $or: [{ id: userId }, { _id: userId as never }] }
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = await getKycPurposeConfig()
  const body = (await req.json().catch(() => ({}))) as Body
  const purpose = body.purpose === 'exam' ? 'exam' : 'profile'

  if (purpose === 'exam' && cfg.exam_aadhaar !== 'anon_aadhaar') {
    return NextResponse.json({ error: 'Anon Aadhaar is not enabled for exams' }, { status: 400 })
  }
  if (purpose === 'profile' && cfg.profile_aadhaar !== 'anon_aadhaar') {
    return NextResponse.json({ error: 'Anon Aadhaar is not enabled for profile' }, { status: 400 })
  }

  const proof = body.proof
  if (!proof || typeof proof !== 'object') {
    return NextResponse.json({ error: 'proof required' }, { status: 400 })
  }

  let verifyFn: (p: unknown, useTest?: boolean) => Promise<boolean>
  try {
    const core = await import('@anon-aadhaar/core')
    verifyFn = core.verify as (p: unknown, useTest?: boolean) => Promise<boolean>
  } catch {
    return NextResponse.json(
      { error: '@anon-aadhaar/core missing — run yarn install in frontend/' },
      { status: 503 },
    )
  }

  // SEC-026: test Aadhaar QR codes are never accepted as real in production.
  const production = process.env.NODE_ENV === 'production'
  if (cfg.anon_aadhaar_test_mode && production) {
    return NextResponse.json({ error: 'Anon Aadhaar test mode is on — turn it off in Admin → Settings → KYC.' }, { status: 400 })
  }

  try {
    const ok = await verifyFn(proof, cfg.anon_aadhaar_test_mode)
    if (!ok) return NextResponse.json({ error: 'Invalid Anon Aadhaar proof' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: `Proof verification failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    )
  }

  const inner = ((proof as { proof?: Record<string, unknown> }).proof || proof) as Record<
    string,
    unknown
  >
  const nullifier = String(inner.nullifier || '')
  // SEC-026: the seed is mandatory and the proof must be bound to THIS user.
  const binding = checkAnonAadhaarBinding({
    proofSeed: inner.nullifierSeed,
    cfgSeed: cfg.anon_aadhaar_nullifier_seed,
    proofSignalHash: inner.signalHash,
    expectedSignalHash: await anonAadhaarSignalHash(anonAadhaarSignal(user.id)),
    testMode: cfg.anon_aadhaar_test_mode,
    production,
  })
  if (binding) {
    const msg = binding === 'seed_mismatch' ? 'nullifierSeed mismatch' : binding === 'signal_mismatch' ? 'This proof was not generated for your account. Please verify again.' : 'Test mode is not allowed'
    return NextResponse.json({ error: msg, code: binding }, { status: 400 })
  }
  if (!nullifier) return NextResponse.json({ error: 'Proof missing nullifier' }, { status: 400 })

  const ageRaw = inner.ageAbove18
  const revealed = {
    age_above_18: ageRaw === '1' || ageRaw === 1 || ageRaw === true,
    gender: inner.gender != null ? String(inner.gender) : undefined,
    state: inner.state != null ? String(inner.state) : undefined,
    pincode:
      inner.pincode != null || inner.pinCode != null
        ? String(inner.pincode ?? inner.pinCode)
        : undefined,
  }

  const db = await getMongoDb()
  // `user` is the user collection; `users` held these docs by mistake (E11) —
  // still check it so an Aadhaar linked before the fix can't be reused.
  const other =
    (await db.collection('user').findOne({ 'anon_aadhaar.nullifier': nullifier })) ||
    (await db.collection('users').findOne({ 'anon_aadhaar.nullifier': nullifier }))
  if (other) {
    const oid = String((other as { id?: string; _id?: unknown }).id ?? (other as { _id?: unknown })._id)
    if (oid !== user.id) {
      return NextResponse.json(
        { error: 'This Aadhaar is already linked to another account' },
        { status: 409 },
      )
    }
  }

  const now = new Date().toISOString()
  await db.collection('user').updateOne(
    userFilter(user.id),
    {
      $set: {
        anon_aadhaar: {
          verified: true,
          nullifier,
          purpose,
          test_mode: cfg.anon_aadhaar_test_mode,
          ...revealed,
          verified_at: now,
        },
        updated_at: now,
      },
    },
  )

  await db.collection('kyc_sessions').insertOne({
    user_id: user.id,
    provider: 'anon_aadhaar',
    purpose,
    status: 'approved',
    nullifier,
    revealed,
    created_at: now,
  })

  return NextResponse.json({ ok: true, verified: true, revealed })
}

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getMongoDb()
  const doc =
    (await db.collection('user').findOne(userFilter(user.id), { projection: { anon_aadhaar: 1 } })) ||
    (await db.collection('users').findOne(userFilter(user.id), { projection: { anon_aadhaar: 1 } }))
  const aa = (doc as { anon_aadhaar?: Record<string, unknown> } | null)?.anon_aadhaar
  return NextResponse.json({
    // The client proves with this signal so the proof is bound to this account.
    signal: anonAadhaarSignal(user.id),
    verified: Boolean(aa?.verified),
    anon_aadhaar: aa
      ? {
          verified: aa.verified,
          age_above_18: aa.age_above_18,
          gender: aa.gender,
          state: aa.state,
          pincode: aa.pincode,
          verified_at: aa.verified_at,
          purpose: aa.purpose,
          test_mode: aa.test_mode,
        }
      : null,
  })
}
