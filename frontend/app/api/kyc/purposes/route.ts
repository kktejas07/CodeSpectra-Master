import { NextResponse } from 'next/server'
import { getKycPurposeConfig } from '@/lib/kyc-purposes-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Public: which KYC provider to use for each purpose (no secrets). */
export async function GET() {
  const cfg = await getKycPurposeConfig()
  return NextResponse.json({
    identity_kyc: cfg.identity_kyc,
    exam_aadhaar: cfg.exam_aadhaar,
    profile_aadhaar: cfg.profile_aadhaar,
    anon_aadhaar_test_mode: cfg.anon_aadhaar_test_mode,
    anon_aadhaar_nullifier_seed: cfg.anon_aadhaar_nullifier_seed,
  })
}
