'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Store } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminOrders, AdminPayouts, AdminProducts, AdminRefunds, AdminSellers } from '@/components/marketplace/admin/operations'
import { AdminReports, AdminSettings } from '@/components/marketplace/admin/settings-reports'

const TABS = [
  ['sellers', 'Sellers'], ['products', 'Product review'], ['orders', 'Orders'], ['refunds', 'Refunds and disputes'],
  ['payouts', 'Payouts'], ['reports', 'Reports'], ['settings', 'Settings'],
] as const

function MarketplaceAdmin() {
  const gate = usePageGuard('superadmin')
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tab = TABS.some(([t]) => t === sp.get('tab')) ? (sp.get('tab') as string) : 'sellers'
  if (!gate.ready) return null
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Marketplace"
        icon={<Store />}
        description="Approve sellers and products, handle refunds, pay sellers and track sales."
        actions={<Button asChild variant="outline"><Link href="/dashboard/seller?as=platform">Manage CodeSpectra store</Link></Button>}
      />
      <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })} className="gap-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">{TABS.map(([t, l]) => <TabsTrigger key={t} value={t}>{l}</TabsTrigger>)}</TabsList>
        </div>
        <TabsContent value="sellers"><AdminSellers /></TabsContent>
        <TabsContent value="products"><AdminProducts /></TabsContent>
        <TabsContent value="orders"><AdminOrders /></TabsContent>
        <TabsContent value="refunds"><AdminRefunds /></TabsContent>
        <TabsContent value="payouts"><AdminPayouts /></TabsContent>
        <TabsContent value="reports"><AdminReports /></TabsContent>
        <TabsContent value="settings"><AdminSettings /></TabsContent>
      </Tabs>
    </div>
  )
}

export default function MarketplaceAdminPage() {
  return <Suspense fallback={null}><MarketplaceAdmin /></Suspense>
}
