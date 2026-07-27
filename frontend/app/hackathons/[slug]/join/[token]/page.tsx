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
  const [errorMeta, setErrorMeta] = useState<'already_this_team' | 'already_other_team' | 'team_full' | 'other'>('other')
  const [otherTeamSlug, setOtherTeamSlug] = useState('')

  const join = useCallback(async () => {
    if (!authUser?.uid) return
    setStatus('loading')
    try {
      const res = await csrfFetch(`/api/hackathons/${slug}/teams/${token}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      setStatus('success')
      setTeamName(data.team.name)
      setMessage(`You joined "${data.team.name}"`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join team'
      setMessage(msg)
      setStatus('error')
      if (msg.includes('already on a team')) {
        const slugMatch = msg.match(/team:\s*(\S+)/)
        if (slugMatch) {
          setErrorMeta('already_other_team')
          setOtherTeamSlug(slugMatch[1])
        } else {
          setErrorMeta('already_this_team')
        }
      } else if (msg.includes('Team is full')) {
        setErrorMeta('team_full')
      } else {
        setErrorMeta('other')
      }
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
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Joining Team...</h2>
            <p className="text-sm text-muted-foreground">Processing your invitation</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold">Joined Successfully!</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
              <Users className="h-3 w-3" />
              {teamName}
            </Badge>
            <div className="flex gap-3 pt-4">
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Go to Workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'already_this_team' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold">Already on this Team</h2>
            <p className="text-sm text-muted-foreground">You&apos;re already a member of this team.</p>
            <div className="flex gap-3 pt-4">
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Go to Workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'already_other_team' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-8 w-8 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold">Already Registered</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re already on a different team for this event.
            </p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                Event Details
              </Button>
              <Button onClick={() => router.push(`/hackathons/${slug}/workspace`)} className="flex-1 gap-2">
                Your Workspace <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && errorMeta === 'team_full' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold">Team is Full</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)} className="flex-1">
                Browse Events
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
                <h2 className="text-lg font-semibold">Sign in Required</h2>
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
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="text-lg font-semibold">Could Not Join</h2>
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
