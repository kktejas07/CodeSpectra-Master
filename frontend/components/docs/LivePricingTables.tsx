'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useCurrency } from '@/lib/use-currency'
import { cn } from '@/lib/utils'

interface LivePlan {
  id: string
  name: string
  description: string
  price: number
  yearlyPrice: number
  features: string[]
  popular?: boolean
}

/**
 * Live pricing tables for docs pages. Prices come from the SAME
 * `/api/pricing/plans` endpoint the /pricing page uses (which merges the
 * Superadmin-configured plans), so docs can never drift from the price page.
 * Markdown embeds this via the `{{live-pricing}}` token (see DocContent).
 */
export function LivePricingTables() {
  const [plans, setPlans] = useState<LivePlan[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { symbol } = useCurrency()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/pricing/plans')
        const j = await r.json()
        if (!r.ok || !cancelled) {
          if (!r.ok) throw new Error('Failed to load pricing')
        }
        if (!cancelled && Array.isArray(j)) setPlans(j)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed || (plans && plans.length === 0)) {
    return (
      <div className="not-prose my-6 rounded-xl border border-border/60 bg-card/40 p-5 text-center text-sm text-muted-foreground">
        Live prices are shown on the{' '}
        <Link href="/pricing" className="font-medium text-teal-600 hover:underline dark:text-teal-400">
          pricing page
        </Link>
        .
      </div>
    )
  }

  if (!plans) {
    return (
      <div className="not-prose my-6 grid gap-3 sm:grid-cols-3" aria-label="Loading prices">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border/60 p-5">
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="mt-3 h-7 w-1/2 rounded bg-muted" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-muted/70" />
              <div className="h-3 w-5/6 rounded bg-muted/70" />
              <div className="h-3 w-2/3 rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const fmt = (n: number) =>
    `${symbol}${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plans.slice(0, 6).map((p) => (
        <div
          key={p.id}
          className={cn(
            'rounded-xl border p-5',
            p.popular
              ? 'border-teal-500/50 bg-teal-500/5'
              : 'border-border/60 bg-card/40',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{p.name}</p>
            {p.popular ? (
              <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                Popular
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            {fmt(p.price)}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
          {p.yearlyPrice > 0 ? (
            <p className="text-xs text-muted-foreground">
              or {fmt(p.yearlyPrice)}/year
            </p>
          ) : null}
          {p.description ? (
            <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
          ) : null}
          {(p.features || []).slice(0, 6).map((f) => (
            <p key={f} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
              <span>{f}</span>
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}
