'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
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
        setDone({ ok: true, message: t('hiring.youreNowAMemberOfValue', { value: json.tenant_name || 'the organization' }) })
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        setDone({ ok: false, message: json.error || t('hiring.failedToAcceptInvitation') })
      }
    } catch {
      setDone({ ok: false, message: t('hiring.failedToAcceptInvitation') })
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t('hiring.loadingInvitation')} />
      </div>
    )
  }

  if (!info || info.error) {
    return (
      <div className="relative isolate flex min-h-[60vh] items-center justify-center px-4">
        <SoftGlow />
        <Panel className="w-full max-w-md p-8 text-center">
          <Illustration name="error" className="mx-auto w-36" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">{t('hiring.invitationUnavailable')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{info?.error || t('hiring.thisInviteMayHaveExpiredOr041')}</p>
          <Button className="mt-5" onClick={() => router.push('/dashboard')}>{t('hiring.goToDashboard')}</Button>
        </Panel>
      </div>
    )
  }

  return (
    <div className="relative isolate flex min-h-[60vh] items-center justify-center px-4">
        <SoftGlow />
      <Panel className="w-full max-w-md p-8 text-center">
        {done ? (
          <>
            <Illustration name={done.ok ? 'success' : 'error'} className="mx-auto w-36" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">{done.ok ? t('hiring.welcome') : t('hiring.couldNotJoin')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{done.message}</p>
            {!done.ok && <Button className="mt-5" onClick={() => router.push('/dashboard')}>{t('hiring.goToDashboard')}</Button>}
          </>
        ) : (
          <>
            <Illustration name="team" className="mx-auto w-36" />
            <h1 className="mt-4 text-lg font-semibold text-foreground">{t('hiring.join')}{' '}{info.org_name || t('hiring.yourOrganization')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('hiring.youveBeenInvitedToJoinAn42c')}</p>

            {info.expired || !info.org_active ? (
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                {info.expired ? t('hiring.thisInvitationHasExpired') : t('hiring.thisOrganizationIsCurrentlyInactive')}
              </p>
            ) : emailMatches ? (
              <>
                <p className="mt-4 text-xs text-muted-foreground">{t('hiring.signedInAs')}{' '}<strong className="text-foreground">{user?.email}</strong>.
                </p>
                <Button className="mt-5 w-full" disabled={accepting} onClick={() => void handleAccept()}>
                  {accepting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{t('hiring.joining')}</> : t('hiring.acceptInvitation')}
                </Button>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                {user
                  ? <>{t('hiring.thisInviteIsFor')}{' '}<strong className="text-foreground">{info.email}</strong>{t('hiring.butYoureSignedInAs')}{' '}<strong className="text-foreground">{user.email}</strong>{t('hiring.signOutAndAcceptWithThe11b')}</>
                  : <>{t('hiring.signInWith')}{' '}<strong className="text-foreground">{info.email}</strong>{' '}{t('hiring.toAcceptThisInvitation')}</>}
                <Button className="mt-3 w-full" variant="outline" onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(`/dashboard/team/invites/${token}`)}`)}>
                  {user ? t('hiring.switchAccount') : t('hiring.signIn')}
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
