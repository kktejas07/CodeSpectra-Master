'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Store } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, StatusBadge } from '@/components/marketplace/seller/shared'
import { SellerOverview } from '@/components/marketplace/seller/overview'
import { SellerSalesAnalytics } from '@/components/marketplace/seller/sales-analytics'
import { SellerProducts } from '@/components/marketplace/seller/products'
import { SellerBookings, SellerOrders, SellerReturns } from '@/components/marketplace/seller/fulfilment'
import { SellerEarnings, SellerPayouts, SellerReviews } from '@/components/marketplace/seller/money'
import { SellerSettings, type SellerMe } from '@/components/marketplace/seller/settings'
import { SellerCoupons } from '@/components/marketplace/seller/coupons'
import { useT } from '@/lib/i18n/client'

interface Me {
  seller: SellerMe | null
  effective_commission_bps: number
  min_payout: { INR: number; USD: number }
  stripe_configured: boolean
  is_superadmin: boolean
}

const TABS = [
  ['overview', 'Overview'], ['analytics', 'Analytics'], ['products', 'Products'], ['orders', 'Orders'], ['bookings', 'Bookings'], ['returns', 'Returns'],
  ['earnings', 'Earnings'], ['payouts', 'Payouts'], ['coupons', 'Coupons'], ['reviews', 'Reviews'], ['settings', 'Settings'],
] as const

function SellerDashboard() {
  const { t: tr } = useT()
  const gate = usePageGuard('/dashboard/seller')
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const asPlatform = sp.get('as') === 'platform'
  const tab = TABS.some(([t]) => t === sp.get('tab')) ? (sp.get('tab') as string) : 'overview'
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Me>(`/api/marketplace/seller/me${asPlatform ? '?as=platform' : ''}`).then(setMe).catch((e) => setErr(e.message))
  }, [asPlatform])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])

  const go = (t: string, extra: Record<string, string | null> = {}) => {
    const q = new URLSearchParams(sp.toString())
    q.set('tab', t)
    q.delete('edit')
    for (const [k, v] of Object.entries(extra)) { if (v === null) q.delete(k); else q.set(k, v) }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title={tr('market.weCouldNotLoadYourSeller8a5')} description={err} actionLabel={tr('common.tryAgain')} onAction={() => { setErr(null); load() }} />
  if (!me) return <div className="h-48 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />

  const s = me.seller
  const storeSwitch = me.is_superadmin && (
    <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label={tr('market.store')}>
      <Button size="sm" variant={!asPlatform ? 'secondary' : 'ghost'} aria-pressed={!asPlatform} onClick={() => go(tab, { as: null })}>{tr('market.myStore')}</Button>
      <Button size="sm" variant={asPlatform ? 'secondary' : 'ghost'} aria-pressed={asPlatform} onClick={() => go(tab, { as: 'platform' })}>{tr('market.codespectraStore')}</Button>
    </div>
  )

  if (!s) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={tr('market.sellerDashboard')} icon={<Store />} actions={storeSwitch} />
        <EmptyState illustration="launch" title={tr('market.startSellingOnCodespectra')} description={tr('market.applyOnceWithYourStoreDetailsd4f')} actionLabel={tr('market.applyToSell')} actionHref="/dashboard/seller/apply" />
      </div>
    )
  }

  if (s.status !== 'approved') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={s.display_name} icon={<Store />} description={tr('market.sellerDashboard')} actions={storeSwitch} />
        <Panel className="space-y-3">
          <div className="flex items-center gap-2"><StatusBadge status={s.status} /><span className="font-medium">{s.status === 'pending' ? tr('market.yourApplicationIsUnderReview') : s.status === 'rejected' ? tr('market.yourApplicationWasNotApproved') : tr('market.yourSellerAccountIsSuspended')}</span></div>
          <p className="text-sm text-muted-foreground">{s.status === 'pending' ? tr('market.wellEmailYouAsSoonAs8d0') : s.review_note ? tr('market.reasonReviewNote', { review_note: s.review_note }) : tr('market.contactSupportIfYouHaveQuestions')}</p>
          {s.status !== 'suspended' && <Button asChild variant="outline"><Link href="/dashboard/seller/apply">{s.status === 'pending' ? tr('market.updateApplication') : tr('market.applyAgain')}</Link></Button>}
        </Panel>
      </div>
    )
  }

  const currencyHint: 'INR' | 'USD' = s.country === 'US' ? 'USD' : 'INR'
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={s.display_name}
        icon={<Store />}
        description={s.is_platform ? tr('market.codespectrasOwnStoreNoCommission') : tr('market.manageYourProductsOrdersAndEarnings')}
        actions={<>{storeSwitch}<Button asChild variant="outline"><Link href={`/marketplace/s/${s.slug}`}>{tr('market.viewStore')}</Link></Button></>}
      />
      <Tabs value={tab} onValueChange={(t) => go(t)} className="gap-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map(([t, label]) => <TabsTrigger key={t} value={t}>{label}</TabsTrigger>)}
          </TabsList>
        </div>
        <TabsContent value="overview"><SellerOverview asPlatform={asPlatform} onGo={(t) => go(t)} /></TabsContent>
        <TabsContent value="analytics"><SellerSalesAnalytics asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="products"><SellerProducts asPlatform={asPlatform} editId={sp.get('edit')} currencyHint={currencyHint} /></TabsContent>
        <TabsContent value="orders"><SellerOrders asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="bookings"><SellerBookings asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="returns"><SellerReturns asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="earnings"><SellerEarnings asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="payouts"><SellerPayouts asPlatform={asPlatform} minPayout={me.min_payout} payoutReady={s.payout.verified && !!s.payout.method} /></TabsContent>
        <TabsContent value="coupons"><SellerCoupons asPlatform={asPlatform} defaultCurrency={currencyHint} /></TabsContent>
        <TabsContent value="reviews"><SellerReviews asPlatform={asPlatform} /></TabsContent>
        <TabsContent value="settings"><SellerSettings seller={s} asPlatform={asPlatform} effectiveBps={me.effective_commission_bps} stripeConfigured={me.stripe_configured} onSaved={load} /></TabsContent>
      </Tabs>
    </div>
  )
}

export default function SellerPage() {
  return <Suspense fallback={null}><SellerDashboard /></Suspense>
}
