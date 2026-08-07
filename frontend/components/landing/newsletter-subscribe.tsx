'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle2, Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

/**
 * Newsletter signup — posts to the public subscribe endpoint. Used on the
 * landing page and anywhere else a capture form is wanted.
 */
export function NewsletterSubscribe({ source = 'web', compact = false }: { source?: string; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setState('loading')
    setError('')
    try {
      const res = await csrfFetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Something went wrong. Please try again.')
        setState('error')
        return
      }
      setState('done')
      setEmail('')
    } catch {
      setState('error')
      setError('Network error. Please try again.')
    }
  }

  if (state === 'done') {
    return (
      <div className="flex items-center gap-2 text-green-500 text-sm">
        <CheckCircle2 className="h-4 w-4" />
        Subscribed! Check your inbox for the first update.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={compact ? 'flex gap-2' : 'flex flex-col gap-2'}>
      <div className={compact ? 'flex flex-1' : 'flex'}>
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            aria-label="Email address"
          />
        </div>
        <Button type="submit" disabled={state === 'loading'} className="ml-2 gap-1.5">
          {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Subscribe
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  )
}
