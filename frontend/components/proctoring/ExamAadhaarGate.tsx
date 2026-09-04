'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnonAadhaarVerify } from '@/components/kyc/AnonAadhaarVerify'
import { AadhaarIDVerificationModal } from '@/components/proctoring/AadhaarIDVerificationModal'

type ExamMode = 'anon_aadhaar' | 'ocr_face' | 'off'

/**
 * Exam gate: uses SuperAdmin exam_aadhaar purpose setting.
 * - anon_aadhaar → ZK prove
 * - ocr_face → existing OCR + face modal
 * - off → auto-pass
 */
export function ExamAadhaarGate({
  onVerified,
  onCancel,
}: {
  onVerified: () => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<ExamMode | null>(null)
  const [seed, setSeed] = useState('314159265358979')
  const [testMode, setTestMode] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/kyc/purposes', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const m = (d.exam_aadhaar || 'ocr_face') as ExamMode
        if (d.anon_aadhaar_nullifier_seed) setSeed(String(d.anon_aadhaar_nullifier_seed))
        if (typeof d.anon_aadhaar_test_mode === 'boolean') setTestMode(d.anon_aadhaar_test_mode)
        if (m === 'off') {
          onVerified()
          return
        }
        setMode(m)
      })
      .catch(() => {
        if (!cancelled) setMode('ocr_face')
      })
    return () => {
      cancelled = true
    }
  }, [onVerified])

  if (!mode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex items-center gap-2 rounded-xl bg-background p-6 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading exam ID settings…
        </div>
      </div>
    )
  }

  if (mode === 'ocr_face') {
    return <AadhaarIDVerificationModal onVerified={() => onVerified()} onCancel={onCancel} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-lg space-y-4 rounded-xl border border-border bg-background p-6 shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-base font-bold">Exam identity (Anon Aadhaar)</h2>
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
