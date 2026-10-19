'use client'

/**
 * Client-only Anon Aadhaar prove + server verify.
 * Reveals: age≥18, gender, state, pincode. Never stores Aadhaar number.
 */
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { csrfFetch } from '@/lib/csrf-fetch'

type Revealed = {
  age_above_18?: boolean
  gender?: string
  state?: string
  pincode?: string
}

type Props = {
  purpose: 'exam' | 'profile'
  nullifierSeed: string
  useTestAadhaar?: boolean
  onVerified?: (revealed: Revealed) => void
}

/** Matches @anon-aadhaar/react public exports */
type Sdk = {
  AnonAadhaarProvider: ComponentType<{ _useTestAadhaar?: boolean; children: ReactNode }>
  LogInWithAnonAadhaar: ComponentType<{
    nullifierSeed: number | bigint
    signal?: string
    fieldsToReveal?: Array<
      'revealAgeAbove18' | 'revealGender' | 'revealPinCode' | 'revealState'
    >
  }>
  useAnonAadhaar: () => [{ status: string }]
  useProver: () => [unknown, unknown]
}

function AnonAadhaarPanel({ purpose, nullifierSeed, useTestAadhaar = true, onVerified }: Props) {
  const [sdk, setSdk] = useState<Sdk | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [error, setError] = useState<string | null>(null)
  // SEC-026: the server-issued signal binds the proof to this account.
  const [signal, setSignal] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/kyc/anon-aadhaar', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j && typeof j.signal === 'string') setSignal(j.signal) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void import('@anon-aadhaar/react')
      .then((m) => {
        if (!cancelled) setSdk(m as unknown as Sdk)
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'SDK load failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const seedNum = Number(String(nullifierSeed).replace(/\D/g, '').slice(0, 15) || '314159265358979')

  if (loadErr) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
        Aadhaar verification couldn&apos;t load right now ({loadErr}). Please refresh the page or try again later.
      </div>
    )
  }

  if (!sdk || !signal) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Anon Aadhaar…
      </div>
    )
  }

  const { AnonAadhaarProvider, LogInWithAnonAadhaar } = sdk

  return (
    <AnonAadhaarProvider _useTestAadhaar={useTestAadhaar}>
      <ProofSync
        sdk={sdk}
        purpose={purpose}
        saving={saving}
        setSaving={setSaving}
        setError={setError}
        onOk={(r) => {
          setDone(true)
          setRevealed(r)
          onVerified?.(r)
        }}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-medium text-foreground">Anon Aadhaar</span>
          <Badge variant="outline" className="text-[10px]">
            {useTestAadhaar ? 'Test mode' : 'Live UIDAI'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Scan Aadhaar QR. We learn age≥18, gender, state, PIN only — not your Aadhaar number.
        </p>
        {done ? (
          <div className="flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600 dark:text-green-400" aria-hidden />
            <div>
              <p className="font-medium text-foreground">Verified</p>
              <p className="text-xs text-muted-foreground">
                Age≥18: {revealed?.age_above_18 ? 'yes' : '—'}
                {revealed?.gender ? ` · ${revealed.gender}` : ''}
                {revealed?.state ? ` · ${revealed.state}` : ''}
                {revealed?.pincode ? ` · ${revealed.pincode}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <LogInWithAnonAadhaar
              nullifierSeed={seedNum}
              signal={signal}
              fieldsToReveal={[
                'revealAgeAbove18',
                'revealGender',
                'revealState',
                'revealPinCode',
              ]}
            />
            {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </AnonAadhaarProvider>
  )
}

function ProofSync({
  sdk,
  purpose,
  saving,
  setSaving,
  setError,
  onOk,
}: {
  sdk: Sdk
  purpose: 'exam' | 'profile'
  saving: boolean
  setSaving: (v: boolean) => void
  setError: (v: string | null) => void
  onOk: (r: Revealed) => void
}) {
  const [anon] = sdk.useAnonAadhaar()
  const [, latest] = sdk.useProver()
  const [sent, setSent] = useState(false)

  const submit = useCallback(
    async (proof: unknown) => {
      if (saving || sent) return
      setSent(true)
      setSaving(true)
      setError(null)
      try {
        const res = await csrfFetch('/api/kyc/anon-aadhaar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proof, purpose }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        onOk((data.revealed || {}) as Revealed)
      } catch (e) {
        setSent(false)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [purpose, saving, sent, setSaving, setError, onOk],
  )

  useEffect(() => {
    if (anon.status === 'logged-in' && latest) void submit(latest)
  }, [anon.status, latest, submit])

  return null
}

export const AnonAadhaarVerify = dynamic(() => Promise.resolve(AnonAadhaarPanel), { ssr: false })
