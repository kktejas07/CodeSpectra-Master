'use client'

import { Card } from '@/components/ui/card'
import { usePageGuard } from '@/lib/use-page-guard'
import { Gauge, Loader2 } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'

export default function SpeedInsightsPage() {
  const gate = usePageGuard('superadmin')

  if (!gate.ready) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Gauge className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Speed Insights</h1>
          <p className="text-sm text-muted-foreground">Core Web Vitals and performance metrics</p>
        </div>
      </div>
      <Card className="p-6 border-border/60">
        <p className="text-sm text-muted-foreground">Speed insights data is available in the <a href="/dashboard/admin/system" className="text-primary hover:underline">System Overview</a> page under Web Vitals.</p>
      </Card>
    </div>
  )
}
