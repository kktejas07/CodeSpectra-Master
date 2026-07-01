'use client'

import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Globe2, Info, ExternalLink } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'

export default function CdnAdminPage() {
  const gate = useRoleGate({ require: 'superadmin' })

  if (!gate.ready) {
    return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Globe2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">CDN & Edge</h1>
            <p className="mt-1 text-muted-foreground">
              Manage edge caching, redirects, and routing rules for your CodeSpectra deployment.
            </p>
          </div>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Integration required</AlertTitle>
        <AlertDescription>
          CDN features require connection to a provider API (Cloudflare, Fastly, etc.).
          Configure your CDN provider credentials in{' '}
          <a href="/dashboard/admin/settings?section=integrations" className="underline text-primary">
            Platform Settings → Integrations
          </a>
          .
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 mb-4">
            <Globe2 className="h-5 w-5 text-blue-500" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Edge Caching</h3>
          <p className="text-sm text-muted-foreground">
            Configure cache TTLs, purge rules, and static asset delivery at the edge.
          </p>
        </Card>
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 mb-4">
            <ExternalLink className="h-5 w-5 text-green-500" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Redirects</h3>
          <p className="text-sm text-muted-foreground">
            Manage 301/302 redirects, hostname rules, and URL rewrites.
          </p>
        </Card>
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 mb-4">
            <Globe2 className="h-5 w-5 text-purple-500" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">A/B Testing</h3>
          <p className="text-sm text-muted-foreground">
            Set up split traffic rules and regional routing configurations.
          </p>
        </Card>
      </div>
    </div>
  )
}
