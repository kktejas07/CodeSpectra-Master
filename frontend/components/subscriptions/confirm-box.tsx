'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'

export function ConfirmBox({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(token ? 'idle' : 'error')
  const [msg, setMsg] = useState(token ? '' : 'This link is missing its code. Use the button in the email we sent you.')

  async function confirm() {
    setState('busy')
    try {
      const res = await csrfFetch('/api/subscriptions/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Couldn’t confirm. Try again.')
      setState('done')
      setMsg(d.already ? 'You were already subscribed — nothing else to do.' : 'You’re subscribed. We’ll only send what you picked, and every email has an unsubscribe link.')
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-8 text-center" role="status" aria-live="polite">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {state === 'done' ? <CheckCircle2 className="h-6 w-6" /> : <MailCheck className="h-6 w-6" />}
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{state === 'done' ? 'Subscription confirmed' : 'Confirm your subscription'}</h1>
      <p className="mt-2 text-muted-foreground">{msg || 'Press the button to start getting the updates you asked for.'}</p>
      <div className="mt-6 flex justify-center gap-3">
        {(state === 'idle' || state === 'busy') && (
          <Button onClick={confirm} disabled={state === 'busy'} className="h-11 rounded-xl px-6">
            {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Confirm subscription
          </Button>
        )}
        <Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/events">Browse events</Link></Button>
      </div>
    </div>
  )
}
