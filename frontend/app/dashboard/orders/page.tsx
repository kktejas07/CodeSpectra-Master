'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, Store } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { formatMinor } from '@/lib/marketplace/pricing'
import type { BuyerOrderSummary } from '@/lib/marketplace/orders'
import { STATUS_TEXT, STATUS_TONE } from '@/components/marketplace/order-status'
import { useT } from '@/lib/i18n/client'


export default function OrdersPage() {
  const { t, fmt } = useT()
  const gate = usePageGuard('user')
  const [orders, setOrders] = useState<BuyerOrderSummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = async (before?: string) => {
    if (before) setLoadingMore(true)
    try {
      const res = await fetch(`/api/marketplace/orders${before ? `?before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error()
      setOrders((prev) => (before ? [...(prev || []), ...j.orders] : j.orders))
      setMore(j.orders.length >= 30)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }
  useEffect(() => { if (gate.ready) void load() }, [gate.ready])

  if (!gate.ready) return null
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('market.myOrders')} description={t('market.purchasesFromTheMarketplaceDownloadsBook2d6')} icon={<ShoppingBag />}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/marketplace"><Store className="mr-1.5 h-4 w-4" />{t('market.marketplace')}</Link></Button>} />
      {error ? (
        <EmptyState illustration="error" title={t('market.weCouldNotLoadYourOrders')} description={t('market.checkYourConnectionAndTryAgain')} actionLabel={t('common.tryAgain')} onAction={() => { setError(false); setOrders(null); void load() }} />
      ) : orders === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />)}</div>
      ) : orders.length === 0 ? (
        <EmptyState illustration="billing" title={t('market.noOrdersYet')} description={t('market.whenYouBuyABookCourse93e')} actionLabel={t('market.browseTheMarketplace')} actionHref="/marketplace" />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/dashboard/orders/${o.id}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Panel interactive className="flex items-center gap-4 p-4 sm:p-5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {o.image ? <img src={o.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ShoppingBag className="h-5 w-5" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{o.first_title}{o.items > 1 ? t('market.valueMore', { value: o.items - 1 }) : ''}</p>
                  <p className="text-sm text-muted-foreground"><span className="font-mono">{o.number}</span> · {fmt.date(o.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums text-foreground">{formatMinor(o.grand_total, o.currency)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[o.status] ?? 'bg-muted text-muted-foreground'}`}>{STATUS_TEXT[o.status] ?? o.status}</span>
                </div>
              </Panel>
            </Link>
          ))}
          {more && <div className="pt-2 text-center"><Button variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => load(orders[orders.length - 1]?.created_at)}>{loadingMore ? t('common.loading') : t('market.showOlderOrders')}</Button></div>}
        </div>
      )}
    </div>
  )
}
