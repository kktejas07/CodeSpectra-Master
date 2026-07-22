'use client'

import { useState } from 'react'
import { ShieldCheck, Info, CheckSquare, Square } from 'lucide-react'

interface ConsentModalProps {
  region: string
  candidateName: string
  onAccept: () => void
  onDecline: () => void
}

export function ConsentModal({ region, candidateName, onAccept, onDecline }: ConsentModalProps) {
  const [proctoringConsent, setProctoringConsent] = useState(false)
  const [psychometricConsent, setPsychometricConsent] = useState(false)
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false)

  const allConsented = proctoringConsent && psychometricConsent && dataProcessingConsent

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 text-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Assessment Terms & Candidate Consent</h2>
            <div className="text-xs text-muted-foreground">Region Jurisdiction: <span className="font-mono font-semibold text-foreground">{region}</span></div>
          </div>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground border-y border-border/60 py-4">
          <p>
            Welcome, <strong className="text-foreground">{candidateName}</strong>. Before beginning your assessment, please review and accept the explicit terms required for your region:
          </p>

          <label className="flex items-start gap-2.5 cursor-pointer text-foreground font-medium">
            <input
              type="checkbox"
              checked={proctoringConsent}
              onChange={(e) => setProctoringConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              I consent to automated AI proctoring, including tab-focus loss tracking, copy-paste prevention, and session audit logs (SC-06).
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer text-foreground font-medium">
            <input
              type="checkbox"
              checked={psychometricConsent}
              onChange={(e) => setPsychometricConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              I consent to the cognitive & behavioral assessment module. (Note: Psychometric outputs are strictly advisory for hiring managers and never act as an automated reject gate - SC-08).
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer text-foreground font-medium">
            <input
              type="checkbox"
              checked={dataProcessingConsent}
              onChange={(e) => setDataProcessingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              I agree to the Data Processing Agreement (DPA) and data subject rights according to {region} privacy laws (SC-04, SC-05).
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onDecline}
            className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Decline & Exit
          </button>
          <button
            onClick={onAccept}
            disabled={!allConsented}
            className="rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            Agree & Start Assessment
          </button>
        </div>
      </div>
    </div>
  )
}
