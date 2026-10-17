'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, Users, ArrowRight, LogIn, UserPlus, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'

export default function JoinHackathonPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = use(params)
  const router = useRouter()
  const { user: authUser, loading: authLoading } = useAuth()
  const [status, setStatus] = useState<'checking' | 'loading' | 'success' | 'error'>('checking')
  const [teamName, setTeamName] = useState('')
  const [message, setMessage] = useState('')
  const [errorMeta, setErrorMeta] = useState<'already_this_team' | 'already_other_team' | 'team_full' | 'event_in_progress' | 'other'>('other')
  const [otherTeamSlug, setOtherTeamSlug] = useState('')
  const [otherTeamName, setOtherTeamName] = useState('')

  const join = useCallback(async () => {
    if (!authUser?.uid) return
    setStatus('loading')
    try {
      const res = await csrfFetch(`/api/hackathons/${slug}/teams/${token}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.team) {
          setOtherTeamSlug(data.team)
          setOtherTeamName(data.team_name || data.team)
          if (data.team === token || data.team === slug) {
            setErrorMeta('already_this_team')
          } else {
            setErrorMeta('already_other_team')
          }
        } else if (data.error?.includes('Team is full') || data.error?.includes('full')) {
          setErrorMeta('team_full')
        } else if (data.error?.includes('closed')) {
          setErrorMeta('event_in_progress')
        } else {
          setErrorMeta('other')
        }
        setMessage(data.error || 'Failed to join')
        setStatus('error')
        return
      }
      setStatus('success')
      setTeamName(data.team.name)
      setMessage(`You joined "${data.team.name}"`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to join team')
      setStatus('error')
      setErrorMeta('other')
    }
  }, [slug, token, authUser?.uid])

  useEffect(() => {
    if (authLoading) return
    if (!authUser?.uid) {
      setStatus('error')
      setMessage('You must be signed in to join a team.')
      setErrorMeta('other')
      return
    }
    void join()
  }, [authLoading, authUser?.uid, join])

  useEffect(() => {
    if (status === 'success' || (status === 'error' && (errorMeta === 'already_this_team' || errorMeta === 'already_other_team'))) {
      const t = setTimeout(() => router.push(`/hackathons/${slug}/workspace`), 2000)
      return () => clearTimeout(t)
    }
  }, [status, errorMeta, slug, router])

  const loginUrl = `/auth/login?redirect=${encodeURIComponent(`/hackathons/${slug}/join/${token}`)}`

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h2 className="text-lg font-semibold mt-4">Checking authentication...</h2>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-3xl border-border/70 p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Joining team…</h2>
            <p className="text-sm text-muted-foreground">Processing your invitation</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold">You&apos;re on the team</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
              <Users className="h-3 w-3" />
              {teamName}
            </Badge>
            <div className="flex gap-3 pt-4">
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Go to workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'already_this_team' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Already on this team</h2>
            <p className="text-sm text-muted-foreground">You&apos;re already a member of this team.</p>
            <div className="flex gap-3 pt-4">
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Go to workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'already_other_team' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold">Already registered</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re already on <strong>{otherTeamName}</strong> for this event.
            </p>
            {otherTeamSlug && (
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                <Users className="h-3 w-3" />
                {otherTeamName}
              </Badge>
            )}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                Event Details
              </Button>
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Your workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'team_full' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold">This team is full</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                Browse Events
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'event_in_progress' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold">Event in progress</h2>
            <p className="text-sm text-muted-foreground">You can&apos;t join once the event has started.</p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                View event
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'other' && (
          <>
            {!authUser?.uid ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <LogIn className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Sign in required</h2>
                <p className="text-sm text-muted-foreground">You need to sign in to join this team.</p>
                <div className="flex flex-col gap-2 pt-4">
                  <Link href={loginUrl}>
                    <Button className="w-full gap-2">
                      <LogIn className="h-4 w-4" /> Sign in
                    </Button>
                  </Link>
                  <Link href={`/auth/signup?redirect=${encodeURIComponent(`/hackathons/${slug}/join/${token}`)}`}>
                    <Button variant="outline" className="w-full">
                      Create account
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                  <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-lg font-semibold">Couldn&apos;t join</h2>
                <p className="text-sm text-muted-foreground">{message}</p>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                    Go to Event
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
