'use client'

import Link from 'next/link'
import { ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AadhaarIDVerificationModalProps {
  /**
   * Kept for API compatibility with ExamAadhaarGate. Never called: there is no
   * real Aadhaar OCR + face-match + liveness backend yet, and we will not
   * report a verified result we did not produce.
   */
  onVerified: (verificationResult: {
    idNumberMasked: string
    name: string
    similarityScore: number
    livenessVerified: boolean
  }) => void
  onCancel: () => void
}

/**
 * "ocr_face" exam Aadhaar mode.
 *
 * ponytail: this used to simulate OCR, a face-match score and a liveness
 * recording with timers. Until a real provider is wired, it says plainly that
 * the check is unavailable and points to the real options (Anon Aadhaar for
 * exams via SuperAdmin → Purpose routing, or full KYC on Identity verification).
 */
export function AadhaarIDVerificationModal({ onCancel }: AadhaarIDVerificationModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aadhaar-unavailable-title"
    >
      <div className="relative max-w-md w-full rounded-3xl border border-border bg-card p-6 shadow-2xl dark:shadow-none space-y-4 text-foreground">
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h2 id="aadhaar-unavailable-title" className="text-base font-bold">Aadhaar ID check isn&apos;t available yet</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Reading your Aadhaar card and matching it to a live selfie isn&apos;t switched on for this platform, so
          nothing was checked and nothing was uploaded. Your exam&apos;s own identity check still applies.
        </p>
        <p className="text-sm text-muted-foreground">
          You can verify your identity separately on the{' '}
          <Link href="/dashboard/identity-verify" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
            Identity verification
          </Link>{' '}
          page.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
