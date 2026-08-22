/**
 * Purpose-based KYC provider routing.
 * SuperAdmin picks which provider handles which job — pages read this, not hardcode Didit.
 */
export type IdentityKycProvider = 'didit' | 'digilocker' | 'off'
export type ExamAadhaarProvider = 'anon_aadhaar' | 'ocr_face' | 'off'
export type ProfileAadhaarProvider = 'anon_aadhaar' | 'off'

export interface KycPurposeConfig {
  /** Full identity KYC (/dashboard/identity-verify) — name/DOB/photo */
  identity_kyc: IdentityKycProvider
  /** Exam / proctoring Aadhaar gate */
  exam_aadhaar: ExamAadhaarProvider
  /** Optional privacy badge on profile */
  profile_aadhaar: ProfileAadhaarProvider
  /** Anon Aadhaar: use UIDAI test artifacts (dev) */
  anon_aadhaar_test_mode: boolean
  /** Shared nullifier seed (number as string). Same seed → same user nullifier. */
  anon_aadhaar_nullifier_seed: string
}

export const DEFAULT_KYC_PURPOSES: KycPurposeConfig = {
  identity_kyc: 'didit',
  exam_aadhaar: 'ocr_face',
  profile_aadhaar: 'anon_aadhaar',
  anon_aadhaar_test_mode: true,
  anon_aadhaar_nullifier_seed: '314159265358979',
}

export function mergeKycPurposes(raw: unknown): KycPurposeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<KycPurposeConfig>
  return {
    identity_kyc:
      r.identity_kyc === 'didit' || r.identity_kyc === 'digilocker' || r.identity_kyc === 'off'
        ? r.identity_kyc
        : DEFAULT_KYC_PURPOSES.identity_kyc,
    exam_aadhaar:
      r.exam_aadhaar === 'anon_aadhaar' || r.exam_aadhaar === 'ocr_face' || r.exam_aadhaar === 'off'
        ? r.exam_aadhaar
        : DEFAULT_KYC_PURPOSES.exam_aadhaar,
    profile_aadhaar:
      r.profile_aadhaar === 'anon_aadhaar' || r.profile_aadhaar === 'off'
        ? r.profile_aadhaar
        : DEFAULT_KYC_PURPOSES.profile_aadhaar,
    anon_aadhaar_test_mode:
      typeof r.anon_aadhaar_test_mode === 'boolean'
        ? r.anon_aadhaar_test_mode
        : DEFAULT_KYC_PURPOSES.anon_aadhaar_test_mode,
    anon_aadhaar_nullifier_seed:
      String(r.anon_aadhaar_nullifier_seed || DEFAULT_KYC_PURPOSES.anon_aadhaar_nullifier_seed).replace(
        /\D/g,
        '',
      ) || DEFAULT_KYC_PURPOSES.anon_aadhaar_nullifier_seed,
  }
}
