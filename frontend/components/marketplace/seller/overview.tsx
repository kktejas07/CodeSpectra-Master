'use client'

import { useEffect, useState } from 'react'
import { Wallet, Hourglass, PackageCheck, Package, RotateCcw, TrendingUp } from 'lucide-react'
import { BentoGrid, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { api, money, withAs } from './shared'
import { useT } from '@/lib/i18n/client'

interface Overview {
  balances: { currency: string; available: number; pending: number }[]
  to_fulfil: number
  products: Record<string, number>
  open_refunds: number
  sales_30d: { currency: string; total: number; count: number }[]
}

export function SellerOverview({ asPlatform, onGo }: { asPlatform: boolean; onGo: (tab: string) => void }) {
  const { t } = useT()
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
          <StatCard key={`a-${b.currency}`} icon={<Wallet />} label={t('market.availableCurrency', { currency: b.currency })} value={money(b.available, b.currency)} hint={t('market.readyToPayOut')} />
        ))}
        {cur.map((b) => (
          <StatCard key={`p-${b.currency}`} icon={<Hourglass />} label={t('market.pendingCurrency', { currency: b.currency })} value={money(b.pending, b.currency)} hint={t('market.heldDuringTheRefundWindow')} />
        ))}
        <button type="button" className="text-left" onClick={() => onGo('orders')}>
          <StatCard icon={<PackageCheck />} label={t('market.ordersToFulfil')} value={o.to_fulfil} hint={t('market.shipOrCompleteThese')} />
        </button>
        <button type="button" className="text-left" onClick={() => onGo('returns')}>
          <StatCard icon={<RotateCcw />} label={t('market.openRefundRequests')} value={o.open_refunds} />
        </button>
        <button type="button" className="text-left" onClick={() => onGo('products')}>
          <StatCard icon={<Package />} label={t('market.liveProducts')} value={live} hint={t('market.valueInReviewValue2Drafts', { value: o.products.pending_review ?? 0, value2: o.products.draft ?? 0 })} />
        </button>
        {o.sales_30d.map((s) => (
          <StatCard key={`s-${s.currency}`} icon={<TrendingUp />} label={t('market.salesLast30DaysCurrency', { currency: s.currency })} value={money(s.total, s.currency)} hint={t('market.countItemsSold', { count: s.count })} />
        ))}
      </BentoGrid>
      {live === 0 && (o.products.draft ?? 0) === 0 && (o.products.pending_review ?? 0) === 0 && (
        <EmptyState illustration="launch" title={t('market.listYourFirstProduct')} description={t('market.addAnEBookAPhysical1a2')} actionLabel={t('market.addAProduct')} onAction={() => onGo('products')} />
      )}
    </div>
  )
}
