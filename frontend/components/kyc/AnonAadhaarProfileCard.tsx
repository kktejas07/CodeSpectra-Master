'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { AnonAadhaarVerify } from '@/components/kyc/AnonAadhaarVerify'
import { useT } from '@/lib/i18n/client'

type Purposes = {
  profile_aadhaar: 'anon_aadhaar' | 'off'
  identity_kyc: string
  anon_aadhaar_test_mode: boolean
  anon_aadhaar_nullifier_seed: string
}

/** Profile edit: privacy Aadhaar badge when SuperAdmin enables profile_aadhaar=anon_aadhaar */
export function AnonAadhaarProfileCard() {
  const { t } = useT()
  const [cfg, setCfg] = useState<Purposes | null>(null)
  const [status, setStatus] = useState<{ verified?: boolean } | null>(null)

  useEffect(() => {
    void fetch('/api/kyc/purposes', { credentials: 'include' })
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setCfg(null))
    void fetch('/api/kyc/anon-aadhaar', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => null)
  }, [])

  if (!cfg) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{' '}{t('exam.loadingVerificationOptions')}</div>
    )
  }

  if (cfg.profile_aadhaar !== 'anon_aadhaar') {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/40 p-4 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 rounded-full bg-muted p-3 sm:mx-0">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-foreground">{t('exam.identityVerification')}</p>
          <p className="text-xs text-muted-foreground">{t('exam.verifyYourIdAndSelfieOnf22')}{' '}<Link href="/dashboard/identity-verify" className="text-primary underline">{t('exam.identityVerification')}</Link>{' '}
            page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-primary/10 p-3">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">{t('exam.aadhaarPrivacyPreserving')}</p>
          <p className="text-xs text-muted-foreground">{t('exam.optionalProvesYouHoldAValid48d')}{' '}<Link href="/dashboard/identity-verify" className="text-primary underline">{t('exam.identityVerification')}</Link>
            .
          </p>
          {status?.verified ? (
            <p className="text-xs font-medium text-green-600 dark:text-green-400">{t('exam.statusVerified')}</p>
          ) : (
            <div className="pt-2">
              <AnonAadhaarVerify
                purpose="profile"
                nullifierSeed={cfg.anon_aadhaar_nullifier_seed}
                useTestAadhaar={cfg.anon_aadhaar_test_mode}
                onVerified={() => setStatus({ verified: true })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
