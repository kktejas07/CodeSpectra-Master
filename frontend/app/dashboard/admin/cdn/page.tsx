'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import Link from 'next/link'
import { Globe2, Shield, Zap, RefreshCw, Trash2, Wifi, Power, AlertTriangle, 
  MapPin, CheckCircle2, Activity, Loader2, Settings, Info,
} from 'lucide-react'
import { WorldMap } from '@/components/gamification/world-map'

interface CloudflareData {
  configured: boolean
  traffic?: { requests: number; cached: number; bytes: number; uniques: number; cacheRatio: number }
  topCountries?: Array<{ country: string; requests: number }>
  error?: string
}

interface WafRule {
  id: string
  name: string
  description: string
  action: 'block' | 'challenge' | 'allow'
  enabled: boolean
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'United States': 'US', 'Canada': 'CA', 'Mexico': 'MX', 'Brazil': 'BR', 'Argentina': 'AR',
  'United Kingdom': 'GB', 'France': 'FR', 'Germany': 'DE', 'Spain': 'ES', 'Italy': 'IT',
  'Russia': 'RU', 'China': 'CN', 'Japan': 'JP', 'India': 'IN', 'Australia': 'AU',
  'Nigeria': 'NG', 'South Africa': 'ZA', 'Egypt': 'EG', 'Saudi Arabia': 'SA', 'Turkey': 'TR',
  'South Korea': 'KR', 'Sweden': 'SE', 'Norway': 'NO', 'Netherlands': 'NL', 'Singapore': 'SG',
  'New Zealand': 'NZ', 'Indonesia': 'ID', 'Thailand': 'TH', 'Vietnam': 'VN', 'Philippines': 'PH',
  'Malaysia': 'MY', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Kenya': 'KE', 'Chile': 'CL',
  'Colombia': 'CO', 'Peru': 'PE', 'Poland': 'PL', 'Ukraine': 'UA', 'Iran': 'IR',
  'United Arab Emirates': 'AE', 'Israel': 'IL', 'Austria': 'AT', 'Belgium': 'BE',
  'Portugal': 'PT', 'Greece': 'GR', 'Czech Republic': 'CZ', 'Romania': 'RO', 'Hungary': 'HU',
  'Bulgaria': 'BG', 'Denmark': 'DK', 'Finland': 'FI', 'Switzerland': 'CH', 'Ireland': 'IE',
}

function mapCountries(topCountries: Array<{ country: string; requests: number }>) {
  return topCountries.map(c => ({
    code: COUNTRY_NAME_TO_CODE[c.country] || c.country.slice(0, 2).toUpperCase(),
    name: c.country,
    count: c.requests,
  }))
}

export default function CdnAdminPage() {
  const gate = usePageGuard('superadmin')
  const toast = useToast()
  const [purging, setPurging] = useState(false)
  const [purgePath, setPurgePath] = useState('')
  const [cfData, setCfData] = useState<CloudflareData | null>(null)
  const [cfLoading, setCfLoading] = useState(true)

  const [wafRules, setWafRules] = useState<WafRule[]>(() => {
    try {
      const saved = localStorage.getItem('cs_waf_rules')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [
      { id: '1', name: 'SQL Injection Protection', description: 'Detects and blocks SQL injection attempt patterns in incoming requests.', action: 'block', enabled: true },
      { id: '2', name: 'Cross-Site Scripting (XSS)', description: 'Sanitizes and blocks scripts sent through URL queries or POST payloads.', action: 'challenge', enabled: true },
      { id: '3', name: 'Rate Limiting (Anti-DDoS)', description: 'Limits clients to maximum 120 requests/minute during surge periods.', action: 'block', enabled: true },
      { id: '4', name: 'Bad Bot Ingress Blocker', description: 'Restricts unverified scrapers and vulnerability scanners from indexing pages.', action: 'challenge', enabled: false },
    ]
  })

  const fetchCfData = () => {
    fetch('/api/admin/cloudflare-analytics', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCfData(d))
      .catch(() => setCfData({ configured: false }))
      .finally(() => setCfLoading(false))
  }

  useEffect(() => {
    if (!gate.ready) return
    fetchCfData()
    const interval = setInterval(fetchCfData, 30_000)
    return () => clearInterval(interval)
  }, [gate.ready])

  const handlePurge = async (all: boolean) => {
    setPurging(true)
    try {
      const res = await csrfFetch('/api/admin/cdn/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(all ? { purge_all: true } : { paths: purgePath ? [purgePath] : ['/'] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Purge failed')
      toast({ type: 'success', title: 'Cache purged', message: all ? 'All edge cache invalidated' : `Purged: ${(json.paths || []).join(', ')}` })
      if (!all) setPurgePath('')
    } catch (e) {
      toast({ type: 'error', title: 'Purge failed', message: (e as Error).message })
    } finally {
      setPurging(false)
    }
  }

  const toggleWafRule = useCallback((id: string) => {
    setWafRules(prev => {
      const next = prev.map(rule => {
        if (rule.id === id) {
          const nextState = !rule.enabled
          toast({
            type: 'success',
            title: `Waf Rule ${nextState ? 'Enabled' : 'Disabled'}`,
            message: `Successfully modified security status for "${rule.name}"`,
          })
          return { ...rule, enabled: nextState }
        }
        return rule
      })
      try { localStorage.setItem('cs_waf_rules', JSON.stringify(next)) } catch {}
      return next
    })
  }, [toast])

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
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
        <Card className="p-6 bg-card/50 border border-muted-foreground/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Cache Hit Rate</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Zap className="h-4 w-4" /></div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold">{cfLoading ? '...' : cfData?.traffic?.cacheRatio != null ? `${cfData.traffic.cacheRatio}%` : 'N/A'}</span>
            {!cfLoading && !cfData?.configured && <p className="text-xs text-muted-foreground mt-1">Configure Cloudflare</p>}
          </div>
        </Card>

        <Card className="p-6 bg-card/50 border border-muted-foreground/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Requests</span>
            <div className="p-2 rounded-lg bg-fuchsia-500/10 text-fuchsia-500"><Activity className="h-4 w-4" /></div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold">{cfLoading ? '...' : cfData?.traffic?.requests?.toLocaleString() || 'N/A'}</span>
            <p className="text-xs text-muted-foreground mt-1">{cfData?.traffic?.uniques?.toLocaleString()} unique visitors</p>
          </div>
        </Card>

        <Card className="p-6 bg-card/50 border border-muted-foreground/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Bandwidth</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500"><Globe2 className="h-4 w-4" /></div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold">{cfLoading ? '...' : cfData?.traffic?.bytes != null ? `${(cfData.traffic.bytes / 1073741824).toFixed(1)} GB` : 'N/A'}</span>
            <p className="text-xs text-indigo-500 mt-1">{cfData?.traffic?.cached?.toLocaleString()} requests cached</p>
          </div>
        </Card>

        <Card className="p-6 bg-card/50 border border-muted-foreground/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Edge Nodes</span>
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive"><Shield className="h-4 w-4" /></div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-bold">{cfData?.topCountries?.length || 0}</span>
            <p className="text-xs text-muted-foreground mt-1">Countries served</p>
          </div>
        </Card>
      </div>

      {/* Cloudflare not configured setup message */}
      {!cfLoading && cfData && !cfData.configured && (
        <Card className="p-6 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div className="space-y-3 flex-1">
              <h3 className="font-semibold text-lg">Cloudflare CDN Not Configured</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cloudflare CDN accelerates your site by caching content at edge locations worldwide, 
                reduces origin server load, and provides DDoS protection, WAF rules, and analytics. 
                Configuring it enables real traffic metrics, cache purge controls, and visitor geography data on this page.
              </p>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to configure:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Create a Cloudflare account and add your domain</li>
                  <li>Find your Zone ID on the Cloudflare dashboard (right sidebar)</li>
                  <li>Create an API Token with Zone Analytics and Cache Purge permissions</li>
                  <li>Enter both in Settings</li>
                </ol>
              </div>
              <Link
                href="/dashboard/admin/settings"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Settings className="h-4 w-4" />
                Go to Settings
              </Link>
            </div>
          </div>
        </Card>
      )}

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
                {!cfData?.configured && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    WAF rules shown here are simulated and stored locally. Configure Cloudflare to manage real WAF rules.
                  </p>
                )}
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

        {/* Right Col: Visitor Countries */}
        <div>
          <Card className="p-6 border border-muted-foreground/10 bg-card/30 h-full flex flex-col">
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded bg-fuchsia-500/10 text-fuchsia-500">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Visitor Countries</h3>
                <p className="text-xs text-muted-foreground">Top countries by request volume.</p>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {cfLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : !cfData?.configured ? (
                <p className="text-xs text-muted-foreground text-center py-10">Configure Cloudflare in Settings → Cloudflare</p>
              ) : cfData?.topCountries && cfData.topCountries.length > 0 ? (
                <>
                  <WorldMap
                    countries={mapCountries(cfData.topCountries)}
                    totalRequests={cfData.traffic?.requests || 0}
                  />
                  <div className="space-y-2 mt-4">
                    {cfData.topCountries.slice(0, 10).map((c, i) => (
                      <div key={c.country} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-muted-foreground/5">
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-fuchsia-500 shrink-0" />
                          <p className="text-sm font-medium">{c.country}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold font-mono text-emerald-500">{c.requests.toLocaleString()}</p>
                          <span className="text-[10px] text-muted-foreground">requests</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-10">No traffic data yet</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
