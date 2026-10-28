'use client'

/**
 * Candidate join page (public, signed link — no account needed). Built-in
 * video opens the room here inside the join window; external meetings link out.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ExternalLink, Loader2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/app/page-kit'
import { Illustration, SoftGlow } from '@/components/visuals'
import { csrfFetch } from '@/lib/csrf-fetch'
import { LiveRoom } from '../../_components/live-room'

interface Info {
  job_title: string
  candidate_name: string | null
  status: string
  scheduled_at: string | null
  duration_min: number
  window: 'early' | 'open' | 'closed'
  builtin: boolean
  external_url: string | null
}

const full = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function CandidateJoinPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inRoom, setInRoom] = useState(false)
  const [left, setLeft] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ats/interviews/join?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error || 'This link is not valid.')
      else { setInfo(j); setError(null) }
    } catch {
      setError('Could not load your interview. Check your connection and try again.')
    }
  }, [token])
  useEffect(() => { void load() }, [load])
  // Re-check every 30 s while waiting for the room to open.
  useEffect(() => {
    if (info?.window !== 'early') return
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [info?.window, load])

  const getToken = useCallback(async () => {
    const r = await csrfFetch('/api/ats/interviews/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Could not join the room')
    return { token: j.token as string, url: j.url as string }
  }, [token])

  if (inRoom && info) {
    return (
      <main className="bg-background px-2 py-2 sm:px-4 sm:py-4">
        <LiveRoom getToken={getToken} title={`${info.job_title} interview`} onLeave={() => { setInRoom(false); setLeft(true) }} />
      </main>
    )
  }

  const shell = (children: React.ReactNode) => (
    <main className="relative isolate flex min-h-[85vh] items-center justify-center bg-background px-4 py-10">
      <SoftGlow />
      <Panel className="w-full max-w-md p-8 text-center">{children}</Panel>
    </main>
  )

  if (!info && !error) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading your interview" /></div>
  }
  if (error || !info) {
    return shell(
      <>
        <Illustration name="interview" className="mx-auto w-36" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">This link doesn't work</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </>,
    )
  }

  return shell(
    <>
      <Illustration name="interview" className="mx-auto w-36" />
      <h1 className="mt-3 text-lg font-semibold text-foreground">{info.job_title} interview</h1>
      {info.scheduled_at && <p className="mt-1 text-sm text-muted-foreground">{full(info.scheduled_at)} · {info.duration_min} minutes</p>}
      {left && <p className="mt-3 text-sm text-muted-foreground" role="status">You left the room. You can rejoin while the interview is open.</p>}
      {info.status === 'cancelled' ? (
        <p className="mt-4 text-sm text-muted-foreground">This interview was cancelled. The hiring team will contact you.</p>
      ) : info.status !== 'scheduled' ? (
        <p className="mt-4 text-sm text-muted-foreground">This interview isn't open. Check your latest email from the hiring team.</p>
      ) : !info.builtin ? (
        info.external_url ? (
          <Button asChild className="mt-5 min-h-11 w-full rounded-full">
            <a href={info.external_url} target="_blank" rel="noopener noreferrer">Open meeting <ExternalLink className="ml-1 h-4 w-4" aria-hidden /></a>
          </Button>
        ) : <p className="mt-4 text-sm text-muted-foreground">Use the meeting link in your invitation email.</p>
      ) : info.window === 'early' ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">The room opens 15 minutes before the start. Keep this page open — it will let you in.</p>
      ) : info.window === 'closed' ? (
        <p className="mt-4 text-sm text-muted-foreground">The room for this interview has closed.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">Use a quiet spot, and allow camera and microphone access when your browser asks.</p>
          <Button className="mt-5 min-h-11 w-full rounded-full" onClick={() => setInRoom(true)}>
            <Video className="mr-1 h-4 w-4" aria-hidden /> Join now
          </Button>
        </>
      )}
    </>,
  )
}
