'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Plan {
  id: string
  name: string
  amount_paise: number
  amount_inr: number
  currency: string
  kind: 'one_time' | 'subscription'
  duration_days?: number
  perks: string[]
}
interface BillingState {
  razorpay_configured: boolean
  subscription: { id: string; plan_id: string; ends_at: string; status: string } | null
  plans: Plan[]
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void }
  }
}

export default function PricingPage() {
  const [state, setState] = useState<BillingState | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/billing/me', { credentials: 'include', cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setState(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function buy(plan: Plan) {
    setToast(null)
    setLoadingPlan(plan.id)
    try {
      const orderRes = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.id }),
      })
      const orderJson = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderJson.message || orderJson.error || 'Order failed')
      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not loaded — refresh and try again')
      }
      const rzp = new window.Razorpay({
        key: orderJson.key_id,
        amount: orderJson.amount_paise,
        currency: orderJson.currency,
        order_id: orderJson.order_id,
        name: 'CodeSpectra',
        description: orderJson.plan?.name || plan.name,
        theme: { color: '#10b981' },
        prefill: orderJson.prefill,
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch('/api/billing/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(resp),
            })
            const vj = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(vj.error || 'Verify failed')
            setToast({ kind: 'ok', msg: 'Payment confirmed! Your access is upgraded.' })
            await load()
          } catch (e) {
            setToast({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
          }
        },
        modal: {
          ondismiss: () => setToast({ kind: 'err', msg: 'Payment cancelled.' }),
        },
      })
      rzp.open()
    } catch (e) {
      setToast({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div className="space-y-6" data-testid="pricing-page">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div>
        <h1 className="text-3xl font-bold">Plans &amp; Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Unlock unlimited AI features, premium problem packs, and identity-verified hiring tools.
          Payments powered by <strong>Razorpay</strong> (UPI · cards · netbanking · wallets).
        </p>
      </div>

      {state && !state.razorpay_configured && (
        <Card className="border-amber-400/40 bg-amber-400/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold mb-1 text-amber-400">
            <ShieldCheck className="h-4 w-4" /> Payments not yet activated
          </div>
          <p className="text-muted-foreground">
            Razorpay credentials haven&apos;t been added. Set <code>RAZORPAY_KEY_ID</code>,{' '}
            <code>RAZORPAY_KEY_SECRET</code> and (optionally){' '}
            <code>RAZORPAY_WEBHOOK_SECRET</code> in <code>/app/frontend/.env.local</code>.
          </p>
        </Card>
      )}

      {state?.subscription && (
        <Card
          className="border-emerald-500/40 bg-emerald-500/5 p-4 text-sm"
          data-testid="active-sub"
        >
          <div className="flex items-center gap-2 font-semibold mb-1 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Active subscription
          </div>
          <p>
            <span className="capitalize">{state.subscription.plan_id.replace('_', ' ')}</span> —
            renews until{' '}
            <span className="font-mono">
              {new Date(state.subscription.ends_at).toLocaleDateString()}
            </span>
          </p>
        </Card>
      )}

      {toast && (
        <Card
          className={cn(
            'p-3 text-sm',
            toast.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300'
              : 'border-destructive/40 bg-destructive/5 text-destructive',
          )}
          data-testid="billing-toast"
        >
          {toast.msg}
        </Card>
      )}
      {err && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {state?.plans?.map((p) => (
          <Card
            key={p.id}
            className={cn(
              'p-6 flex flex-col transition',
              p.id === 'pro_monthly' && 'border-primary/40 bg-primary/5',
            )}
            data-testid={`plan-${p.id}`}
          >
            <div className="flex items-center gap-2 mb-1">
              {p.kind === 'subscription' ? (
                <Sparkles className="h-4 w-4 text-primary" />
              ) : (
                <Zap className="h-4 w-4 text-amber-400" />
              )}
              <h3 className="font-semibold">{p.name}</h3>
              {p.id === 'pro_monthly' && (
                <span className="ml-auto rounded-full bg-primary/15 text-primary text-[10px] px-2 py-0.5 uppercase tracking-wide">
                  Popular
                </span>
              )}
            </div>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-bold">
                ₹{p.amount_inr.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-muted-foreground ml-1">
                {p.kind === 'subscription'
                  ? `/ ${p.duration_days === 365 ? 'year' : 'month'}`
                  : 'one-time'}
              </span>
            </div>
            <ul className="space-y-1.5 text-xs flex-1">
              {p.perks.map((perk) => (
                <li key={perk} className="flex gap-1.5">
                  <Star className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" /> {perk}
                </li>
              ))}
            </ul>
            <Button
              className="mt-4 w-full"
              disabled={loadingPlan === p.id || !state?.razorpay_configured}
              onClick={() => buy(p)}
              data-testid={`buy-${p.id}`}
            >
              {loadingPlan === p.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Opening checkout…
                </>
              ) : !state?.razorpay_configured ? (
                'Checkout disabled'
              ) : (
                'Buy now'
              )}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
