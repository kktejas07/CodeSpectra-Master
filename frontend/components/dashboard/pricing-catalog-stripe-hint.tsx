'use client'

import useSWR from 'swr'
import Link from 'next/link'

type TierRow = {
  id: string
  name: string
  price_monthly?: number | null
  price_yearly?: number | null
}

function formatUsdCents(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(Number(cents))) return '—'
  return `$${(Number(cents) / 100).toFixed(2)}`
}

function tierByName(tiers: TierRow[], name: string): TierRow | undefined {
  const n = name.toLowerCase()
  return tiers.find((t) => String(t.name).toLowerCase() === n)
}

export function PricingCatalogStripeHint() {
  const { data } = useSWR('/api/admin/pricing/tiers', async (url: string) => {
    const res = await fetch(url, { credentials: 'include' })
    return res.json()
  })
  const tiers: TierRow[] = Array.isArray(data?.data) ? data.data : []
  const pro = tierByName(tiers, 'Pro')
  const ent = tierByName(tiers, 'Enterprise')

  if (!pro && !ent) return null

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">Catalog amounts (reference only)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown amounts come from{' '}
        <Link href="/dashboard/admin/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
          Pricing management
        </Link>
        . Stripe Checkout still uses the <code className="rounded bg-muted px-1 text-xs">price_…</code> IDs below —
        they must match products/prices in your Stripe Dashboard.
      </p>
      <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
        {pro ? (
          <li>
            Pro — catalog: {formatUsdCents(pro.price_monthly)} / mo
            {pro.price_yearly != null ? `, ${formatUsdCents(pro.price_yearly)} / yr` : ''}
          </li>
        ) : null}
        {ent ? (
          <li>
            Enterprise — catalog: {formatUsdCents(ent.price_monthly)} / mo
            {ent.price_yearly != null ? `, ${formatUsdCents(ent.price_yearly)} / yr` : ''}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
