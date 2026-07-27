'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, Users, ArrowRight, Mail, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface InviteInfo {
  token: string
  eventName: string
  eventSlug: string
  eventStatus?: string
  teamName: string
  teamId: string
  invitedBy: string
  expiresAt: string
}

function JoinPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const { user } = useAuth()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    if (!token) { setError('No invite token found'); setLoading(false); return }
    fetch(`/api/hackathons/invites?token=${token}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); } else { setInvite(d) }
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false))
  }, [token])

  const handleJoin = async () => {
    if (!user) {
      router.push(`/auth/login?redirect=${encodeURIComponent(`/hackathons/join?token=${token}`)}`)
      return
    }
    setJoining(true)
    try {
      const res = await fetch('/api/hackathons/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setJoined(true)
      setTimeout(() => router.push(`/hackathons/${invite!.eventSlug}/workspace`), 1500)
    } catch { setError('Failed to join team') }
    finally { setJoining(false) }
  }

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (error) return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Invalid Invite</h1>
        <p className="text-muted-foreground text-sm mb-4">{error}</p>
        <Link href="/dashboard/hackathons">
          <Button variant="outline" className="gap-1"><Trophy className="h-4 w-4" /> Browse Hackathons</Button>
        </Link>
      </Card>
    </div>
  )

  if (joined) return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">You're in!</h1>
        <p className="text-muted-foreground text-sm mb-4">Redirecting to workspace...</p>
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">You're invited!</h1>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Event</span>
              <span className="font-semibold">{invite?.eventName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Team</span>
              <span className="font-semibold">{invite?.teamName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Invited by</span>
              <span className="font-mono text-xs">{invite?.invitedBy}</span>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              Signing in as <span className="font-mono text-xs">{user.email}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sign in to accept this invitation.</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {invite?.eventStatus === 'live' && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Event in Progress</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">Cannot join — the event is already running.</p>
          </div>
        )}
        {invite?.eventStatus === 'closed' && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-center">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Event Ended</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-1">Cannot join — the event has ended.</p>
          </div>
        )}

        {(invite?.eventStatus !== 'live' && invite?.eventStatus !== 'closed') ? (
        <div className="space-y-2">
          <Button onClick={handleJoin} disabled={joining || !user} className="w-full gap-1">
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {user ? 'Join Team' : 'Sign in to Join'}
          </Button>
          <Link href={`/hackathons/${invite?.eventSlug}`} className="block">
            <Button variant="outline" className="w-full gap-1">
              View Event Details
            </Button>
          </Link>
        </div>
        ) : (
        <Link href={`/hackathons/${invite?.eventSlug}`} className="block">
          <Button variant="outline" className="w-full gap-1">
            View Event Details
          </Button>
        </Link>
        )}
      </Card>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <JoinPage />
    </Suspense>
  )
}