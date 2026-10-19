'use client'

import { useEffect, useState } from 'react'
import { Wallet, Hourglass, PackageCheck, Package, RotateCcw, TrendingUp } from 'lucide-react'
import { BentoGrid, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { api, money, withAs } from './shared'

interface Overview {
  balances: { currency: string; available: number; pending: number }[]
  to_fulfil: number
  products: Record<string, number>
  open_refunds: number
  sales_30d: { currency: string; total: number; count: number }[]
}

export function SellerOverview({ asPlatform, onGo }: { asPlatform: boolean; onGo: (tab: string) => void }) {
  const [o, setO] = useState<Overview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api<Overview>(withAs('/api/marketplace/seller/overview', asPlatform)).then(setO).catch((e) => setErr(e.message))
  }, [asPlatform])
  if (err) return <p className="text-sm text-destructive">{err}</p>
  if (!o) return <div className="h-40 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />
  const cur = o.balances.length ? o.balances : [{ currency: 'INR', available: 0, pending: 0 }]
  const live = o.products.published ?? 0
  return (
    <div className="space-y-6">
      <BentoGrid>
        {cur.map((b) => (
          <StatCard key={`a-${b.currency}`} icon={<Wallet />} label={`Available (${b.currency})`} value={money(b.available, b.currency)} hint="Ready to pay out" />
        ))}
        {cur.map((b) => (
          <StatCard key={`p-${b.currency}`} icon={<Hourglass />} label={`Pending (${b.currency})`} value={money(b.pending, b.currency)} hint="Held during the refund window" />
        ))}
        <button type="button" className="text-left" onClick={() => onGo('orders')}>
          <StatCard icon={<PackageCheck />} label="Orders to fulfil" value={o.to_fulfil} hint="Ship or complete these" />
        </button>
        <button type="button" className="text-left" onClick={() => onGo('returns')}>
          <StatCard icon={<RotateCcw />} label="Open refund requests" value={o.open_refunds} />
        </button>
        <button type="button" className="text-left" onClick={() => onGo('products')}>
          <StatCard icon={<Package />} label="Live products" value={live} hint={`${o.products.pending_review ?? 0} in review · ${o.products.draft ?? 0} drafts`} />
        </button>
        {o.sales_30d.map((s) => (
          <StatCard key={`s-${s.currency}`} icon={<TrendingUp />} label={`Sales, last 30 days (${s.currency})`} value={money(s.total, s.currency)} hint={`${s.count} item${s.count === 1 ? '' : 's'} sold`} />
        ))}
      </BentoGrid>
      {live === 0 && (o.products.draft ?? 0) === 0 && (o.products.pending_review ?? 0) === 0 && (
        <EmptyState illustration="launch" title="List your first product" description="Add an e-book, a physical item or a bookable session. Drafts stay private until you submit them." actionLabel="Add a product" onAction={() => onGo('products')} />
      )}
    </div>
  )
}
