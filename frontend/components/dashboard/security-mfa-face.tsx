'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Shield, ScanFace, Smartphone, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { useToast } from '@/lib/toast-context'

type FaceStatus = { enrolled: boolean; angles: string[] }

export function SecurityMfaFaceCard() {
  const toast = useToast()
  const [faceStatus, setFaceStatus] = useState<FaceStatus | null>(null)
  const [faceLoading, setFaceLoading] = useState(true)
  const [faceDialogOpen, setFaceDialogOpen] = useState(false)

  const [totpFactors, setTotpFactors] = useState<{ id: string; friendly_name?: string; status: string }[]>([])
  const [mfaLoading, setMfaLoading] = useState(true)
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)

  const loadFace = useCallback(async () => {
    setFaceLoading(true)
    try {
      const res = await fetch('/api/auth/face-status', { credentials: 'include' })
      const j = (await res.json()) as FaceStatus & { error?: string }
      if (!res.ok) {
        setFaceStatus({ enrolled: false, angles: [] })
        return
      }
      setFaceStatus({ enrolled: Boolean(j.enrolled), angles: Array.isArray(j.angles) ? j.angles : [] })
    } catch {
      setFaceStatus({ enrolled: false, angles: [] })
    } finally {
      setFaceLoading(false)
    }
  }, [])

  const loadMfa = useCallback(async () => {
    setMfaLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setTotpFactors([])
        return
      }
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        console.warn('[CodeSpectra] listFactors:', error.message)
        setTotpFactors([])
        return
      }
      const rawTotp = (data?.totp ?? []) as { id: string; friendly_name?: string; status: string }[]
      const fromAll =
        (data as { all?: { id: string; friendly_name?: string; status: string; factor_type?: string }[] })?.all?.filter(
          (f) => f.factor_type === 'totp'
        ) ?? []
      const merged = rawTotp.length > 0 ? rawTotp : fromAll
      setTotpFactors(merged.filter((f) => f.status === 'verified'))
    } catch {
      setTotpFactors([])
    } finally {
      setMfaLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFace()
    void loadMfa()
  }, [loadFace, loadMfa])

  const startTotpEnroll = async () => {
    setMfaBusy(true)
    setTotpCode('')
    setQrSvg(null)
    setEnrollFactorId(null)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      })
      if (error) {
        toast({
          type: 'error',
          title: 'Could not start authenticator setup',
          message:
            error.message +
            ' Enable MFA (TOTP) in Supabase Dashboard → Authentication → Providers if it is disabled.',
        })
        return
      }
      setEnrollFactorId(data.id)
      setQrSvg(data.totp?.qr_code ?? null)
      setMfaDialogOpen(true)
    } catch (e) {
      toast({
        type: 'error',
        title: 'Authenticator setup failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmTotpEnroll = async () => {
    if (!enrollFactorId) return
    const code = totpCode.replace(/\s/g, '')
    if (code.length < 6) {
      toast({ type: 'error', title: 'Enter the 6-digit code from your app' })
      return
    }
    setMfaBusy(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactorId })
      if (cErr || !challenge?.id) {
        toast({ type: 'error', title: 'MFA challenge failed', message: cErr?.message ?? 'No challenge id' })
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code,
      })
      if (vErr) {
        toast({ type: 'error', title: 'Invalid code', message: vErr.message })
        return
      }
      toast({ type: 'success', title: 'Two-factor authentication is on', message: 'You will be asked for a code when you sign in.' })
      setMfaDialogOpen(false)
      setEnrollFactorId(null)
      setQrSvg(null)
      setTotpCode('')
      await loadMfa()
    } finally {
      setMfaBusy(false)
    }
  }

  const removeTotp = async (factorId: string) => {
    setMfaBusy(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) {
        toast({ type: 'error', title: 'Could not remove authenticator', message: error.message })
        return
      }
      toast({ type: 'success', title: 'Authenticator removed' })
      await loadMfa()
    } finally {
      setMfaBusy(false)
    }
  }

  const onFaceEnrolled = async (faceData: { front: string; left: string; right: string }) => {
    try {
      const res = await fetch('/api/auth/face-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ faceData }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          type: 'error',
          title: 'Face enrollment failed',
          message: typeof j.error === 'string' ? j.error : 'Try again or check server logs.',
        })
        return
      }
      toast({ type: 'success', title: 'Face sign-in updated', message: 'You can use Face ID on the login page with your email.' })
      setFaceDialogOpen(false)
      await loadFace()
    } catch (e) {
      toast({
        type: 'error',
        title: 'Face enrollment failed',
        message: e instanceof Error ? e.message : 'Network error',
      })
    }
  }

  const verifiedTotp = totpFactors

  return (
    <>
      <Card className="rounded-xl border-border/60 shadow-sm">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 text-foreground">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Security</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            TOTP two-factor authentication (Supabase Auth) and optional face templates for passwordless sign-in.
          </p>
        </div>

        <div className="divide-y divide-border/60 px-6">
          <div className="space-y-4 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-medium text-foreground">Authenticator app (TOTP)</p>
                  <p className="text-sm text-muted-foreground">
                    Adds a second step at sign-in. Works with Google Authenticator, 1Password, Authy, and similar apps.
                  </p>
                </div>
                {mfaLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking status…
                  </div>
                ) : verifiedTotp.length > 0 ? (
                  <ul className="space-y-2">
                    {verifiedTotp.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{f.friendly_name || 'Authenticator'}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1 text-destructive hover:bg-destructive/10"
                          disabled={mfaBusy}
                          onClick={() => void removeTotp(f.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Button type="button" className="rounded-lg" disabled={mfaBusy} onClick={() => void startTotpEnroll()}>
                    {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Set up authenticator
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ScanFace className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-medium text-foreground">Face sign-in</p>
                  <p className="text-sm text-muted-foreground">
                    Capture three angles to enable <strong className="font-medium text-foreground">Sign in with Face ID</strong> on
                    the login page (uses your account email). Server needs{' '}
                    <code className="rounded bg-muted px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> for session exchange.
                  </p>
                </div>
                {faceLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Status:{' '}
                      <span className="font-medium text-foreground">
                        {faceStatus?.enrolled ? 'Enrolled' : 'Not enrolled'}
                      </span>
                      {faceStatus?.angles?.length ? (
                        <span className="text-muted-foreground"> ({faceStatus.angles.join(', ')})</span>
                      ) : null}
                    </span>
                    <Button type="button" variant="secondary" className="rounded-lg" onClick={() => setFaceDialogOpen(true)}>
                      {faceStatus?.enrolled ? 'Update face template' : 'Enroll face'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" className="w-full justify-between rounded-lg sm:w-auto" asChild>
            <Link href="/auth/login">Open sign-in (Face ID &amp; MFA)</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground sm:max-w-md sm:text-right" asChild>
            <Link href="/auth/forgot-password">Forgot password? Send reset email</Link>
          </Button>
        </div>
      </Card>

      <Dialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add authenticator</DialogTitle>
            <DialogDescription>Scan the QR code, then enter the 6-digit code to confirm.</DialogDescription>
          </DialogHeader>
          {qrSvg ? (
            <div className="flex justify-center rounded-lg border border-border/60 bg-background p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSvg} alt="TOTP QR code" className="h-44 w-44" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Generating QR…</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="totp-verify">Verification code</Label>
            <Input
              id="totp-verify"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="rounded-lg"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setMfaDialogOpen(false)} disabled={mfaBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmTotpEnroll()} disabled={mfaBusy}>
              {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm &amp; enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={faceDialogOpen} onOpenChange={setFaceDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{faceStatus?.enrolled ? 'Update face template' : 'Enroll your face'}</DialogTitle>
            <DialogDescription>Capture front, left, and right angles. Your camera is used only for this flow.</DialogDescription>
          </DialogHeader>
          <FaceRecognition onCapture={(d) => void onFaceEnrolled(d)} mode="signup" onSkip={() => setFaceDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
