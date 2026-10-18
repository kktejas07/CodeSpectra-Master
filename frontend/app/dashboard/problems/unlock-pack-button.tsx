'use client'

import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout, PAYMENTS_NOT_SET_UP } from '@/lib/razorpay-checkout'
import { useToast } from '@/lib/toast-context'

/** "Unlock with <pack>": checks out the pack at its catalog price (server-resolved). */
export function UnlockPackButton({
  pack,
  size = 'sm',
  className,
  onUnlocked,
}: {
  pack: { id: string; name: string }
  size?: 'sm' | 'default'
  className?: string
  onUnlocked?: () => void
}) {
  const addToast = useToast()
  const [busy, setBusy] = useState(false)

  const buy = async () => {
    setBusy(true)
    try {
      const res = await csrfFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: pack.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(res.status === 503 ? PAYMENTS_NOT_SET_UP : typeof j.error === 'string' ? j.error : 'Checkout failed')
      const outcome = await completeCheckout(j, { description: pack.name })
      if (outcome.status === 'paid') {
        addToast({ type: 'success', title: 'Pack unlocked', message: `${pack.name} is yours for good.` })
        onUnlocked?.()
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Could not unlock', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size={size} className={className} onClick={() => void buy()} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
      Unlock with {pack.name}
    </Button>
  )
}
