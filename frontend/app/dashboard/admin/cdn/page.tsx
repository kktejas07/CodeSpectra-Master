'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { 
  Globe2, Shield, Zap, RefreshCw, Trash2, Wifi, Power, AlertTriangle, 
  MapPin, CheckCircle2, ChevronRight, Activity, Cpu, CloudLightning 
} from 'lucide-react'

interface EdgeNode {
  id: string
  location: string
  status: 'healthy' | 'degraded' | 'maintenance'
  latency: number
  trafficShare: string
}

interface WafRule {
  id: string
  name: string
  description: string
  action: 'block' | 'challenge' | 'allow'
  enabled: boolean
}

export default function CdnAdminPage() {
  const gate = usePageGuard('superadmin')
  const { toast } = useToast()
  const [purging, setPurging] = useState(false)
  const [purgePath, setPurgePath] = useState('')
  const [nodes, setNodes] = useState<EdgeNode[]>([
    { id: '1', location: 'New York (US-East)', status: 'healthy', latency: 8, trafficShare: '28%' },
    { id: '2', location: 'Frankfurt (EU-Central)', status: 'healthy', latency: 11, trafficShare: '24%' },
    { id: '3', location: 'Tokyo (AP-Northeast)', status: 'healthy', latency: 14, trafficShare: '18%' },
    { id: '4', location: 'Singapore (AP-Southeast)', status: 'healthy', latency: 19, trafficShare: '15%' },
    { id: '5', location: 'Mumbai (AP-South)', status: 'healthy', latency: 22, trafficShare: '11%' },
    { id: '6', location: 'Sydney (OC-Southeast)', status: 'healthy', latency: 28, trafficShare: '4%' },
  ])

  const [wafRules, setWafRules] = useState<WafRule[]>([
    { id: '1', name: 'SQL Injection Protection', description: 'Detects and blocks SQL injection attempt patterns in incoming requests.', action: 'block', enabled: true },
    { id: '2', name: 'Cross-Site Scripting (XSS)', description: 'Sanitizes and blocks scripts sent through URL queries or POST payloads.', action: 'challenge', enabled: true },
    { id: '3', name: 'Rate Limiting (Anti-DDoS)', description: 'Limits clients to maximum 120 requests/minute during surge periods.', action: 'block', enabled: true },
    { id: '4', name: 'Bad Bot Ingress Blocker', description: 'Restricts unverified scrapers and vulnerability scanners from indexing pages.', action: 'challenge', enabled: false },
  ])

  if (!gate.ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading CDN Configuration...</p>
        </div>
      </div>
    )
  }

  const handlePurge = (all: boolean) => {
    setPurging(true)
    setTimeout(() => {
      setPurging(false)
      if (all) {
        toast({
          title: 'Global Cache Purged',
          description: 'Successfully invalidated all edge caches globally. Cache hit rates will temporarily drop.',
        })
      } else {
        toast({
          title: 'Path Cache Purged',
          description: `Invalidated CDN cache files matching: "${purgePath || '/*'}"`,
        })
        setPurgePath('')
      }
    }, 1500)
  }

  const toggleWafRule = (id: string) => {
    setWafRules(prev => prev.map(rule => {
      if (rule.id === id) {
        const nextState = !rule.enabled
        toast({
          title: `Waf Rule ${nextState ? 'Enabled' : 'Disabled'}`,
          description: `Successfully modified security status for "${rule.name}"`,
        })
        return { ...rule, enabled: nextState }
      }
      return rule
    }))
  }

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
            CDN & Edge Operations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage global content delivery network, edge cache, WAF rules, and monitor node latency status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Edge Active
          </Badge>
        </div>
      </div>

      {/* Grid: 4 Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 relative overflow-hidden bg-card/50 backdrop-blur-md border border-muted-foreground/10 hover:border-primary/20 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Cache Hit Rate</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">94.8%</span>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
              <span>+1.2%</span> vs last week
            </p>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden bg-card/50 backdrop-blur-md border border-muted-foreground/10 hover:border-fuchsia-500/20 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Edge Latency</span>
            <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-500">
              <Activity className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">14ms</span>
            <p className="text-xs text-muted-foreground mt-1">Origin Latency: 92ms</p>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden bg-card/50 backdrop-blur-md border border-muted-foreground/10 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Bandwidth Offloaded</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Globe2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">4.82 TB</span>
            <p className="text-xs text-indigo-500 mt-1">88.4% offload ratio</p>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden bg-card/50 backdrop-blur-md border border-muted-foreground/10 hover:border-destructive/20 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">WAF Events Prevented</span>
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold tracking-tight">1,482</span>
            <p className="text-xs text-muted-foreground mt-1">12 blocks past 24h</p>
          </div>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Col: Purge Cache & WAF Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purge Cache Panel */}
          <Card className="p-6 border border-muted-foreground/10 bg-card/30 backdrop-blur-sm">
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded bg-amber-500/10 text-amber-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Purge Cache</h3>
                <p className="text-xs text-muted-foreground">Remove stored copies of your files to force edge nodes to fetch the latest origin updates.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Purge by Path or Pattern</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. /static/css/* or /api/problems"
                    value={purgePath}
                    onChange={e => setPurgePath(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button 
                    disabled={purging} 
                    onClick={() => handlePurge(false)} 
                    variant="outline"
                    className="flex items-center gap-1.5 shrink-0"
                  >
                    {purging ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Purge Path'}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-muted-foreground/10 flex items-center justify-between">
                <div className="pr-4">
                  <h4 className="text-xs font-bold text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> DANGER ZONE
                  </h4>
                  <p className="text-[11px] text-muted-foreground">This will invalidate all resources in edge nodes globally, inducing sudden high server load.</p>
                </div>
                <Button 
                  disabled={purging} 
                  onClick={() => handlePurge(true)} 
                  variant="destructive"
                  className="flex items-center gap-1.5 shrink-0"
                >
                  {purging ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Purge All Content'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Web Application Firewall (WAF) */}
          <Card className="p-6 border border-muted-foreground/10 bg-card/30 backdrop-blur-sm">
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded bg-indigo-500/10 text-indigo-500">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Web Application Firewall (WAF)</h3>
                <p className="text-xs text-muted-foreground">Manage active intrusion protection rules deployed at the CDN edge network layer.</p>
              </div>
            </div>

            <div className="space-y-4">
              {wafRules.map(rule => (
                <div key={rule.id} className="flex items-start justify-between p-3 rounded-lg bg-card/50 border border-muted-foreground/5 hover:border-primary/10 transition-colors">
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{rule.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider px-1 py-0 border-primary/20 text-primary">
                        {rule.action}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{rule.description}</p>
                  </div>
                  <Button
                    onClick={() => toggleWafRule(rule.id)}
                    variant={rule.enabled ? 'default' : 'outline'}
                    className={`h-8 w-16 text-xs transition-all ${rule.enabled ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                  >
                    {rule.enabled ? 'Active' : 'Off'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Col: Global Edge Locations Latency Tracker */}
        <div>
          <Card className="p-6 border border-muted-foreground/10 bg-card/30 backdrop-blur-sm h-full flex flex-col">
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded bg-fuchsia-500/10 text-fuchsia-500">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Global Edge Nodes</h3>
                <p className="text-xs text-muted-foreground">Real-time telemetry of edge caching nodes.</p>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              {nodes.map(node => (
                <div key={node.id} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-muted-foreground/5">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-fuchsia-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{node.location}</p>
                      <span className="text-[10px] text-muted-foreground">Traffic Share: {node.trafficShare}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold font-mono text-emerald-500">{node.latency}ms</p>
                    <span className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Online
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
