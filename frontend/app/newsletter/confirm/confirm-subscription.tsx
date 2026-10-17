'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'

type State = 'idle' | 'saving' | 'done' | 'error'

export function ConfirmSubscription({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'idle' : 'error')
  const [message, setMessage] = useState<string>(
    token ? '' : 'This link is missing its confirmation code. Open the link from your email again.',
  )

  const confirm = async () => {
    setState('saving')
    try {
      const res = await csrfFetch('/api/newsletter/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMessage(data.error || 'We couldn’t confirm your subscription.')
        setState('error')
        return
      }
      setState('done')
    } catch {
      setMessage('We couldn’t reach the server. Check your connection and try again.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <EmptyState
        illustration="success"
        title="You're subscribed again"
        description="You'll get the CodeSpectra newsletter about once a month. Every email has an unsubscribe link."
        actionLabel="Read past issues"
        actionHref="/newsletter"
      />
    )
  }

  if (state === 'error') {
    return (
      <EmptyState
        illustration="error"
        title="Couldn't confirm your subscription"
        description={message}
        actionLabel="Back to newsletters"
        actionHref="/newsletter"
      />
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Confirm your subscription</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        You unsubscribed from the CodeSpectra newsletter earlier. Confirm to start getting it again.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button onClick={confirm} disabled={state === 'saving'}>
          {state === 'saving' ? 'Confirming' : 'Confirm subscription'}
        </Button>
        <Link href="/newsletter" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Not now
        </Link>
      </div>
    </div>
  )
}
