'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Globe2, HelpCircle, Server, Shield, Clock, Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'
import Link from 'next/link'

interface ServerInfo {
  cpu: { model: string; cores: number; usagePct: number }
  memory: { total: number; used: number; free: number; usagePct: number }
  disk: { total: number; used: number; free: number; usagePct: number }
  uptime: number
  containers: { count: number; list: Array<{ name: string; status: string; cpu: string; memory: string }> }
  piston: { status: string; runtimes: number }
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  return b + ' B'
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600)
  return `${d}d ${h}h`
}

export default function CdnAdminPage() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/system/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setInfo(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!gate.ready || loading) return <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Globe2 className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">CDN &amp; Edge
            <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" /></TooltipTrigger><TooltipContent side="right"><p className="text-xs max-w-[250px]">Edge infrastructure overview. Connect a CDN provider in Platform Settings → Integrations for caching, redirects, and routing rules.</p></TooltipContent></Tooltip></TooltipProvider>
          </h1>
        </div>
      </div>

      {/* Server infrastructure cards */}
      {info && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3"><Server className="h-5 w-5 text-blue-400" /><Badge variant="outline">{info.cpu.cores} cores</Badge></div>
            <p className="text-xs text-muted-foreground">CPU</p>
            <p className="text-2xl font-bold">{info.cpu.usagePct}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted/50"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${info.cpu.usagePct}%` }} /></div>
          </Card>
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3"><Zap className="h-5 w-5 text-green-400" /><Badge variant="outline">{fmtBytes(info.memory.free)} free</Badge></div>
            <p className="text-xs text-muted-foreground">Memory</p>
            <p className="text-2xl font-bold">{info.memory.usagePct}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted/50"><div className="h-1.5 rounded-full bg-green-500" style={{ width: `${info.memory.usagePct}%` }} /></div>
          </Card>
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3"><Globe2 className="h-5 w-5 text-purple-400" /><Badge variant="outline">{info.containers.count} containers</Badge></div>
            <p className="text-xs text-muted-foreground">Containers</p>
            <p className="text-2xl font-bold">{info.containers.count}</p>
          </Card>
          <Card className="p-5 border-border/60">
            <div className="flex items-center justify-between mb-3"><Clock className="h-5 w-5 text-amber-400" /><Badge variant="outline">Piston</Badge></div>
            <p className="text-xs text-muted-foreground">Uptime / Engine</p>
            <p className="text-2xl font-bold">{fmtUptime(info.uptime)}</p>
            <p className="text-xs text-muted-foreground mt-1">{info.piston.status} · {info.piston.runtimes} languages</p>
          </Card>
        </div>
      )}

      {/* Edge features */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 mb-4"><Globe2 className="h-5 w-5 text-blue-500" /></div>
          <h3 className="font-semibold text-foreground mb-2">Edge Caching</h3>
          <p className="text-sm text-muted-foreground mb-4">Configure cache TTLs, purge rules, and static asset delivery at the edge through your CDN provider.</p>
          <Link href="/dashboard/admin/settings?section=integrations"><Button variant="outline" size="sm" className="w-full">Configure CDN</Button></Link>
        </Card>
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 mb-4"><Globe2 className="h-5 w-5 text-green-500" /></div>
          <h3 className="font-semibold text-foreground mb-2">DNS &amp; SSL</h3>
          <p className="text-sm text-muted-foreground mb-4">TLS certificates managed by Let's Encrypt via Traefik. DNS records point to this server.</p>
          {info && <Badge variant="outline" className="mb-4"><CheckCircle2 className="h-3 w-3 mr-1 text-green-500 inline" /> Active</Badge>}
        </Card>
        <Card className="p-6 border-border/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 mb-4"><Shield className="h-5 w-5 text-purple-500" /></div>
          <h3 className="font-semibold text-foreground mb-2">Security</h3>
          <p className="text-sm text-muted-foreground mb-4">Rate limiting, DDoS protection, and WAF rules configured at the edge level through your CDN provider.</p>
          <Badge variant="outline"><XCircle className="h-3 w-3 mr-1 text-muted-foreground inline" /> Requires CDN provider</Badge>
        </Card>
      </div>

      {/* Container overview */}
      {info && (
        <Card className="p-5 border-border/60">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Server className="h-4 w-4" /> Running Containers</h3>
          <div className="grid gap-2 max-h-[200px] overflow-y-auto">
            {info.containers.list.slice(0, 10).map(c => (
              <div key={c.name} className="flex items-center justify-between text-xs rounded bg-muted/20 px-3 py-2">
                <span className="font-mono truncate">{c.name}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{c.cpu}</span>
                  <span>{c.memory}</span>
                  <Badge variant="outline" className="text-[9px]">{c.status.includes('Up') ? 'Running' : c.status.slice(0, 10)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
