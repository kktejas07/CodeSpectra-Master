'use client'

import { useBrowserValue } from '@/hooks/use-browser-value'
import { useEffect, useState } from 'react'
import { X, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnonAadhaarVerify } from '@/components/kyc/AnonAadhaarVerify'
import { IdentityVerification } from '@/components/proctoring/IdentityVerification'

type ExamMode = 'anon_aadhaar' | 'ocr_face' | 'off'

/**
 * Exam gate: uses SuperAdmin exam_aadhaar purpose setting.
 * - anon_aadhaar → ZK prove
 * - ocr_face → ID card photo + live selfie, the same capture flow as the
 *   test's own identity check (stored for this attempt via /api/exams/[id]/identity)
 * - off → nothing extra to check; says so (never reports a check that didn't happen)
 */
export function ExamAadhaarGate({
  onVerified,
  onCancel,
  examId,
  examTitle = 'this test',
}: {
  onVerified: () => void
  onCancel: () => void
  /** The exam being taken; needed for the card + selfie mode. */
  examId?: string
  examTitle?: string
}) {
  const [mode, setMode] = useState<ExamMode | null>(null)
  const search = useBrowserValue(() => window.location.search, '')
  const [seed, setSeed] = useState('314159265358979')
  const [testMode, setTestMode] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/kyc/purposes', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const m = (d.exam_aadhaar || 'off') as ExamMode
        if (d.anon_aadhaar_nullifier_seed) setSeed(String(d.anon_aadhaar_nullifier_seed))
        if (typeof d.anon_aadhaar_test_mode === 'boolean') setTestMode(d.anon_aadhaar_test_mode)
        setMode(m)
      })
      .catch(() => {
        // Settings unreachable: behave like the platform default ('off').
        if (!cancelled) setMode('off')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!mode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading ID check…
        </div>
      </div>
    )
  }

  if (mode === 'ocr_face' && examId) {
    const qs = search ? new URLSearchParams(search) : null
    return (
      <IdentityVerification
        examId={examId}
        examTitle={examTitle}
        inviteToken={qs?.get('inviteToken') || null}
        linkToken={qs?.get('link') || null}
        onCancel={onCancel}
        onComplete={() => onVerified()}
      />
    )
  }

  if (mode === 'off' || mode === 'ocr_face') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="exam-id-none-title">
        <div className="relative w-full max-w-md space-y-4 rounded-3xl border border-border bg-card p-6 shadow-xl dark:shadow-none">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <h2 id="exam-id-none-title" className="text-base font-bold text-foreground">No extra ID check needed</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This test doesn&apos;t ask for an extra ID check during the test. Nothing was checked or uploaded.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>Close</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-6 shadow-xl dark:shadow-none">
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-base font-bold text-foreground">Exam identity (Anon Aadhaar)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Privacy-preserving Aadhaar proof. Does not replace full KYC on Identity Verify.
          </p>
        </div>
        <AnonAadhaarVerify
          purpose="exam"
          nullifierSeed={seed}
          useTestAadhaar={testMode}
          onVerified={() => onVerified()}
        />
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
