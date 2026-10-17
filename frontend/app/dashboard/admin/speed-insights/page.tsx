'use client'

import { usePageGuard } from '@/lib/use-page-guard'
import { Gauge, Loader2 } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import Link from 'next/link'

export default function SpeedInsightsPage() {
  const gate = usePageGuard('superadmin')

  if (!gate.ready) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Speed insights"
        description="How fast pages load for real visitors (Core Web Vitals)."
        icon={<Gauge />}
      />
      <Panel>
        <p className="text-sm text-muted-foreground">
          Page-speed numbers live on the{' '}
          <Link href="/dashboard/admin/system" className="font-medium text-primary hover:underline">System overview</Link>{' '}
          page, under Web Vitals.
        </p>
      </Panel>
    </div>
  )
}
