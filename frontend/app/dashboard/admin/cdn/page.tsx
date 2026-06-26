'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Globe2, Info, MapPin } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'

const REGIONS = [
  { city: 'Paris', pct: '0.0' },
  { city: 'Stockholm', pct: '0.0' },
  { city: 'Dublin', pct: '0.0' },
  { city: 'London', pct: '0.0' },
  { city: 'San Francisco', pct: '0.0' },
  { city: 'Dubai', pct: '0.0' },
]

export default function CdnAdminPage() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [windowRange, setWindowRange] = useState('12h')

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
            <h1 className="text-3xl font-bold text-foreground">CDN</h1>
            <p className="mt-1 text-muted-foreground">
              Manage edge caching, redirects, and routing — UI shell until wired to your provider APIs (e.g.
              Cloudflare, Fastly) or Supabase-stored rules.
            </p>
          </div>
        </div>
        <Select value={windowRange} onValueChange={setWindowRange}>
          <SelectTrigger className="w-[180px] border-border/60 bg-card">
            <SelectValue placeholder="Window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h">Last 12 hours</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Alert className="border-border/60 bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertTitle>Implementation notes</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Map <strong className="text-foreground">Caches / Redirects / Routing rules</strong> to your edge config
          (Cloudflare, Fastly, Envoy, or similar). This UI is the control plane layout only.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-4 border border-border/60 bg-muted/30 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="caches">Caches</TabsTrigger>
          <TabsTrigger value="redirects">Redirects</TabsTrigger>
          <TabsTrigger value="routing">Routing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card className="border-border/60 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Edge regions</Badge>
                <span className="text-sm text-muted-foreground">Edge request share (sample)</span>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-2 text-sm">
                {REGIONS.map((r) => (
                  <li key={r.city} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      {r.city}
                    </span>
                    <span className="font-mono text-muted-foreground">{r.pct}%</span>
                  </li>
                ))}
              </ul>
              <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/15 text-center text-sm text-muted-foreground">
                Dot map placeholder — reuse the existing Globe3D component or a static SVG with request heat.
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {['Edge requests', 'CDN caching', 'ISR / stale'].map((title) => (
              <Card key={title} className="border-border/60 p-5 transition-colors hover:border-primary/30">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <span className="text-muted-foreground">↗</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Deep-link to analytics when wired.</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="caches">
          <Card className="border-border/60 p-8 text-center text-sm text-muted-foreground">
            Purge keys, surrogate-control, and static asset TTLs — connect your edge API here.
          </Card>
        </TabsContent>
        <TabsContent value="redirects">
          <Card className="border-border/60 p-8 text-center text-sm text-muted-foreground">
            301/302 matrix, hostname rules, and wildcard patterns — table editor placeholder.
          </Card>
        </TabsContent>
        <TabsContent value="routing">
          <Card className="border-border/60 p-8 text-center text-sm text-muted-foreground">
            Path rewrites, A/B splits, and regional failover — workflow-style editor placeholder.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
