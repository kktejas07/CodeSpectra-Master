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
  if (err) return <EmptyState illustration="error" title="We could not load your seller dashboard" description={err} actionLabel="Try again" onAction={() => { setErr(null); load() }} />
  if (!me) return <div className="h-48 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" />

  const s = me.seller
  const storeSwitch = me.is_superadmin && (
    <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Store">
      <Button size="sm" variant={!asPlatform ? 'secondary' : 'ghost'} aria-pressed={!asPlatform} onClick={() => go(tab, { as: null })}>My store</Button>
      <Button size="sm" variant={asPlatform ? 'secondary' : 'ghost'} aria-pressed={asPlatform} onClick={() => go(tab, { as: 'platform' })}>CodeSpectra store</Button>
    </div>
  )

  if (!s) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Seller dashboard" icon={<Store />} actions={storeSwitch} />
        <EmptyState illustration="launch" title="Start selling on CodeSpectra" description="Apply once with your store details, tax info and payout method. After approval you can list digital, physical and service products." actionLabel="Apply to sell" actionHref="/dashboard/seller/apply" />
      </div>
    )
  }

  if (s.status !== 'approved') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={s.display_name} icon={<Store />} description="Seller dashboard" actions={storeSwitch} />
        <Panel className="space-y-3">
          <div className="flex items-center gap-2"><StatusBadge status={s.status} /><span className="font-medium">{s.status === 'pending' ? 'Your application is under review' : s.status === 'rejected' ? 'Your application was not approved' : 'Your seller account is suspended'}</span></div>
          <p className="text-sm text-muted-foreground">{s.status === 'pending' ? "We'll email you as soon as it's reviewed — usually within two working days." : s.review_note ? `Reason: ${s.review_note}` : 'Contact support if you have questions.'}</p>
          {s.status !== 'suspended' && <Button asChild variant="outline"><Link href="/dashboard/seller/apply">{s.status === 'pending' ? 'Update application' : 'Apply again'}</Link></Button>}
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
        description={s.is_platform ? 'CodeSpectra’s own store — no commission.' : 'Manage your products, orders and earnings.'}
        actions={<>{storeSwitch}<Button asChild variant="outline"><Link href={`/marketplace/s/${s.slug}`}>View store</Link></Button></>}
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
