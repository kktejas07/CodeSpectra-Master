'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Building2, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface InviteInfo {
  org_name: string | null
  org_active: boolean
  email: string
  role: string
  expires_at: string
  expired: boolean
  error?: string
}

export default function TeamInvitePage() {
  const params = useParams<{ token: string }>()
  const token = params.token || ''
  const router = useRouter()
  const { user } = useAuth()

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [done, setDone] = useState<null | { ok: boolean; message: string }>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/team/invitations/accept?token=${encodeURIComponent(token)}`)
        const json = await res.json()
        if (!cancelled) setInfo(res.ok ? json : { ...json, error: json.error || 'Invitation not found' })
      } catch {
        if (!cancelled) setInfo({ org_name: null, org_active: false, email: '', role: 'user', expires_at: '', expired: true, error: 'Could not load invitation' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const emailMatches = info?.email && user?.email && info.email.toLowerCase() === user.email.toLowerCase()

  const handleAccept = async () => {
    setAccepting(true)
    try {
      const res = await csrfFetch('/api/team/invitations/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = await res.json()
      if (res.ok) {
        setDone({ ok: true, message: `You're now a member of ${json.tenant_name || 'the organization'}.` })
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        setDone({ ok: false, message: json.error || 'Failed to accept invitation' })
      }
    } catch {
      setDone({ ok: false, message: 'Failed to accept invitation' })
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!info || info.error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md rounded-3xl border-border/70 p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold text-foreground">Invitation unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{info?.error || 'This invite may have expired or already been used.'}</p>
          <Button className="mt-5" onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md rounded-3xl border-border/70 p-8 text-center">
        {done ? (
          <>
            {done.ok
              ? <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-400" aria-hidden />
              : <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden />}
            <h1 className="mt-3 text-lg font-semibold text-foreground">{done.ok ? 'Welcome!' : 'Could not join'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{done.message}</p>
            {!done.ok && <Button className="mt-5" onClick={() => router.push('/dashboard')}>Go to dashboard</Button>}
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-foreground">Join {info.org_name || 'your organization'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You've been invited to join an organization on CodeSpectra.
            </p>

            {info.expired || !info.org_active ? (
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                {info.expired ? 'This invitation has expired.' : 'This organization is currently inactive.'}
              </p>
            ) : emailMatches ? (
              <>
                <p className="mt-4 text-xs text-muted-foreground">
                  Signed in as <strong className="text-foreground">{user?.email}</strong>.
                </p>
                <Button className="mt-5 w-full" disabled={accepting} onClick={() => void handleAccept()}>
                  {accepting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Joining…</> : 'Accept invitation'}
                </Button>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                {user
                  ? <>This invite is for <strong className="text-foreground">{info.email}</strong>, but you're signed in as <strong className="text-foreground">{user.email}</strong>. Sign out and accept with the invited account.</>
                  : <>Sign in with <strong className="text-foreground">{info.email}</strong> to accept this invitation.</>}
                <Button className="mt-3 w-full" variant="outline" onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(`/dashboard/team/invites/${token}`)}`)}>
                  {user ? 'Switch account' : 'Sign in'}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
