'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { cn } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/app/page-kit'

interface ImageResult {
  image: string
  highCritical: number
  critical: number
  topCrit: string[]
}

interface ScanReport {
  ranAt: string
  createdAt: string
  durationSec?: number | null
  images: ImageResult[]
  clamav: { infected: string[]; scanned?: number | null }
  freshclam?: string | null
}

export default function SecurityScansPage() {
  const gate = usePageGuard('superadmin')
  const [latest, setLatest] = useState<ScanReport | null>(null)
  const [history, setHistory] = useState<
    { ranAt: string; images: number; critical: number; infected: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/cron/security-scan', { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`)
      setLatest(d.latest || null)
      setHistory(Array.isArray(d.history) ? d.history : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!gate.ready) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.ready])

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <SkeletonTable rows={8} />
      </div>
    )
  }

  const critTotal = (latest?.images || []).reduce((n, i) => n + i.critical, 0)
  const infected = latest?.clamav?.infected || []
  const healthy = latest != null && critTotal === 0 && infected.length === 0

  return (
    <div className="w-full space-y-6">
      <div>
        <Link
          href="/dashboard/admin/security"
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" /> Security
        </Link>
        <PageHeader
          illustration="scanner"
          className="mb-0 mt-2"
          title="Security scans"
          description={<>
            Weekly Trivy image CVEs and ClamAV filesystem sweep, reported from the host.
            {latest
              ? ` Last run ${formatDateTime(latest.ranAt)}.`
              : ' No reports yet — the next scheduled run will fill this page.'}
          </>}
          icon={healthy ? <ShieldCheck /> : <ShieldAlert />}
        />
      </div>

      {error ? (
        <Card className="flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
          <p className="text-sm font-medium">Couldn&apos;t load scan reports</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
          </Button>
        </Card>
      ) : !latest ? (
        <EmptyState
          illustration="scanner"
          variant="default"
          title="No scan reports yet"
          description="Reports appear here after the first scheduled Sunday run, or trigger /usr/local/bin/codespectra-weekly-scan.sh on the host."
          actionLabel="Back to security"
          actionHref="/dashboard/admin/security"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Images scanned" value={latest.images.length} />
            <StatCard
              label="Critical CVEs"
              value={<span className={cn(critTotal > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')}>{critTotal}</span>}
            />
            <StatCard
              label="Malware hits"
              value={<span className={cn(infected.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')}>{infected.length}</span>}
            />
            <StatCard label="AV signatures" value={latest.freshclam ? 'Current' : 'Unknown'} />
          </div>

          {infected.length > 0 && (
            <Card className="rounded-2xl border-red-500/40 bg-red-500/5 p-4">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Infected files — isolate immediately</p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {infected.map((f) => (
                  <li key={f} className="break-all">
                    {f}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div>
            <h2 className="mb-2.5 text-sm font-semibold text-foreground">
              CVEs per image (high and critical)
            </h2>
            <ul className="space-y-2">
              {latest.images.map((img) => (
                <li key={img.image}>
                  <Card className="rounded-2xl p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                        {img.image}
                      </p>
                      <Badge variant="secondary" className="tabular-nums">
                        {img.highCritical} high+
                      </Badge>
                      <Badge
                        variant={img.critical > 0 ? 'destructive' : 'outline'}
                        className="tabular-nums"
                      >
                        {img.critical} critical
                      </Badge>
                    </div>
                    {img.topCrit.length > 0 && (
                      <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" title={img.topCrit.join(', ')}>
                        {img.topCrit.join(', ')}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </div>

          {history.length > 0 && (
            <div>
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                History
              </h2>
              <Card className="divide-y divide-border/60 rounded-2xl">
                {history.map((h) => (
                  <div key={h.ranAt} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                    <span className="tabular-nums text-muted-foreground">
                      {formatDateTime(h.ranAt)}
                    </span>
                    <span className="ml-auto tabular-nums">{h.images} images</span>
                    <Badge variant={h.critical > 0 ? 'destructive' : 'outline'} className="tabular-nums">
                      {h.critical} crit
                    </Badge>
                    <Badge variant={h.infected > 0 ? 'destructive' : 'outline'} className="tabular-nums">
                      {h.infected} infected
                    </Badge>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
