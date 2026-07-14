'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, Users, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { csrfFetch } from '@/lib/csrf-fetch'

export default function JoinHackathonPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = use(params)
  const router = useRouter()
  const { user: authUser, loading: authLoading } = useAuth()
  const [status, setStatus] = useState<'checking' | 'loading' | 'success' | 'error'>('checking')
  const [teamName, setTeamName] = useState('')
  const [message, setMessage] = useState('')

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
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Failed to join team')
    }
  }, [slug, token, authUser?.uid])

  useEffect(() => {
    if (authLoading) return
    if (!authUser?.uid) {
      setStatus('error')
      setMessage('You must be signed in to join a team.')
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
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold text-green-500">Joined Successfully!</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{teamName}</span>
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={() => router.push(`/hackathons/${slug}`)}>
                View Event <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold text-destructive">Could Not Join</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-3 pt-4 justify-center">
              <Button variant="outline" onClick={() => router.push(`/hackathons/${slug}`)}>
                Go to Event
              </Button>
              <Button onClick={() => router.push(loginUrl)}>
                Sign In
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
