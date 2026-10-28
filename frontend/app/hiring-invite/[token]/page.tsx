'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface InviteInfo {
  org_name: string | null
  org_active: boolean
  email: string
  role_label: string
  client_name: string | null
  accepted: boolean
  superseded: boolean
  error?: string
}

/**
 * Hiring-team invite landing (public). Signed in with the invited email → accept;
 * otherwise sign in or create an account with that email and come back here.
 */
export default function HiringInvitePage() {
  const { token = '' } = useParams<{ token: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [done, setDone] = useState<null | { ok: boolean; message: string }>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/ats/team/accept?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) }))
      .then(({ ok, json }) => { if (!cancelled) setInfo(ok ? json : { ...json, error: json.error || 'Invitation not found' }) })
      .catch(() => { if (!cancelled) setInfo({ error: 'Could not load the invitation' } as InviteInfo) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const here = `/hiring-invite/${token}`
  const emailMatches = !!info?.email && !!user?.email && info.email.toLowerCase() === user.email.toLowerCase()

  async function accept() {
    setAccepting(true)
    try {
      const res = await csrfFetch('/api/ats/team/accept', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone({ ok: true, message: `You've joined the ${info?.org_name || ''} hiring team.`.replace('  ', ' ') })
        setTimeout(() => router.push(json.redirect || '/dashboard/hiring'), 1200)
      } else {
        setDone({ ok: false, message: json.error || 'Could not accept the invitation' })
      }
    } catch {
      setDone({ ok: false, message: 'Could not accept the invitation' })
    } finally {
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading invitation" /></div>
  }

  const shell = (children: React.ReactNode) => (
    <main className="relative isolate flex min-h-[80vh] items-center justify-center bg-background px-4 py-10">
      <SoftGlow />
      <Panel className="w-full max-w-md p-8 text-center">{children}</Panel>
    </main>
  )

  if (!info || info.error) {
    return shell(
      <>
        <Illustration name="error" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Invitation unavailable</h1>
        <p className="mt-1 text-sm text-muted-foreground">{info?.error || 'This invite may have expired. Ask the person who invited you to send a new one.'}</p>
        <Button className="mt-5" onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
      </>,
    )
  }

  if (done) {
    return shell(
      <>
        <Illustration name={done.ok ? 'success' : 'error'} className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">{done.ok ? 'Welcome to the team' : 'Could not join'}</h1>
        <p className="mt-1 text-sm text-muted-foreground" role="status">{done.message}</p>
        {!done.ok && <Button className="mt-5" onClick={() => router.push('/dashboard')}>Go to dashboard</Button>}
      </>,
    )
  }

  return shell(
    <>
      <Illustration name="team" className="mx-auto w-36" />
      <h1 className="mt-4 text-lg font-semibold text-foreground">Join the {info.org_name || 'hiring'} team</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You're invited as <strong className="text-foreground">{info.role_label}</strong>{info.client_name ? <> for <strong className="text-foreground">{info.client_name}</strong></> : null}.
      </p>

      {info.accepted ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">This invitation has already been accepted.</p>
          <Button className="mt-5 w-full" onClick={() => router.push('/dashboard/hiring')}>Open hiring</Button>
        </>
      ) : info.superseded ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">A newer invite was sent to {info.email}. Use the link in the latest email.</p>
      ) : !info.org_active ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">This organization is currently inactive.</p>
      ) : emailMatches ? (
        <>
          <p className="mt-4 text-xs text-muted-foreground">Signed in as <strong className="text-foreground">{user?.email}</strong>.</p>
          <Button className="mt-5 min-h-11 w-full" disabled={accepting} onClick={() => void accept()}>
            {accepting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Joining…</> : 'Accept invitation'}
          </Button>
        </>
      ) : user ? (
        <div className="mt-4 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
          This invite is for <strong className="text-foreground">{info.email}</strong>, but you're signed in as <strong className="text-foreground">{user.email}</strong>. Sign in with the invited email to accept.
          <Button className="mt-3 w-full" variant="outline" onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(here)}`)}>Switch account</Button>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          <p className="text-sm text-muted-foreground">Use <strong className="text-foreground">{info.email}</strong> to continue.</p>
          <Button className="min-h-11 w-full" onClick={() => router.push(`/auth/login?redirect=${encodeURIComponent(here)}`)}>Sign in</Button>
          <Button className="min-h-11 w-full" variant="outline" onClick={() => router.push(`/auth/signup?redirect=${encodeURIComponent(here)}&email=${encodeURIComponent(info.email)}`)}>Create an account</Button>
        </div>
      )}
    </>,
  )
}
