'use client'
import { formatDate } from '@/lib/format-datetime'

import { useState, useEffect } from 'react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import Link from 'next/link'
import { Globe2, Shield, Zap, RefreshCw, Trash2, Wifi, Power, AlertTriangle, 
  MapPin, CheckCircle2, Activity, Loader2, Settings, Info, Users, Clock, TrendingUp,
} from 'lucide-react'
import { SkeletonStats, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { WorldMap } from '@/components/gamification/world-map'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface CloudflareData {
  configured: boolean
  traffic?: { requests: number; cached: number; bytes: number; uniques: number; cacheRatio: number }
  topCountries?: Array<{ country: string; requests: number }>
  timeSeries?: Array<{ datetime: string; requests: number; cached: number; bandwidth: number }>
  realtime?: { estimatedVisitorsPerMinute: number; requestsPerHour: number }
  error?: string
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

function formatTimeSeriesData(data: Array<{ datetime: string; requests: number }>) {
  return data.map(d => {
    const date = new Date(d.datetime)
    const hour = date.getHours()
    const day = formatDate(date, undefined, { month: 'short', day: 'numeric' })
    return {
      ...d,
      label: `${day} ${hour}:00`,
      shortLabel: `${hour}h`,
    }
  }).slice(-24) // Last 24 hours for readability
}

export default function CdnAdminPage() {
  const gate = usePageGuard('superadmin')
  const toast = useToast()
  const [purging, setPurging] = useState(false)
  const [purgePath, setPurgePath] = useState('')
  const [cfData, setCfData] = useState<CloudflareData | null>(null)
  const [cfLoading, setCfLoading] = useState(true)

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

  const chartData = cfData?.timeSeries ? formatTimeSeriesData(cfData.timeSeries) : []

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Globe2 />}
        title="CDN and edge"
        description="Traffic, cache performance and visitor geography from Cloudflare, plus cache purge and firewall rules."
        actions={
          <Badge variant="success" className="px-3 py-1 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Edge active
          </Badge>
        }
        className="mb-0"
      />

      {/* Real-time Visitors Banner */}
      {cfData?.configured && cfData.realtime && (
        <Panel className="p-5 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Estimated live activity</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-foreground">
                    {cfData.realtime.estimatedVisitorsPerMinute.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground">visitors/min</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="tabular-nums">{cfData.realtime.requestsPerHour.toLocaleString()}</span> requests/hour
              </div>
              <p className="text-xs text-muted-foreground mt-1">Updated every 30s</p>
            </div>
          </div>
        </Panel>
      )}

      {/* Grid: 4 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cache hit rate"
          icon={<Zap />}
          value={cfLoading ? '...' : cfData?.traffic?.cacheRatio != null ? `${cfData.traffic.cacheRatio}%` : 'N/A'}
          hint={!cfLoading && !cfData?.configured ? 'Configure Cloudflare' : undefined}
        />
        <StatCard
          label="Total requests"
          icon={<Activity />}
          value={cfLoading ? '...' : cfData?.traffic?.requests?.toLocaleString() || 'N/A'}
          hint={cfData?.traffic?.uniques != null ? `${cfData.traffic.uniques.toLocaleString()} unique visitors` : undefined}
        />
        <StatCard
          label="Bandwidth"
          icon={<Globe2 />}
          value={cfLoading ? '...' : cfData?.traffic?.bytes != null ? `${(cfData.traffic.bytes / 1073741824).toFixed(1)} GB` : 'N/A'}
          hint={cfData?.traffic?.cached != null ? `${cfData.traffic.cached.toLocaleString()} requests cached` : undefined}
        />
        <StatCard
          label="Countries served"
          icon={<Shield />}
          value={cfData?.topCountries?.length || 0}
          hint="From top visitor countries"
        />
      </div>

      {/* Cloudflare not configured setup message */}
      {!cfLoading && cfData && !cfData.configured && (
        <Panel className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-3 flex-1">
              <h3 className="font-semibold text-lg">Cloudflare is not connected yet</h3>
              {cfData.error && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-300">
                  <strong>Error:</strong> {cfData.error}
                </div>
              )}
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
                  <li>Create an API Token with these permissions: <strong>Zone: Analytics Read</strong>, <strong>Zone: Cache Purge</strong>, <strong>Zone: Read</strong></li>
                  <li>Enter both in Settings → Cloudflare</li>
                </ol>
              </div>
              <Link
                href="/dashboard/admin/settings?section=cloudflare"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Settings className="h-4 w-4" />
                Go to Settings
              </Link>
            </div>
          </div>
        </Panel>
      )}

      {/* Traffic Chart */}
      {cfData?.configured && chartData.length > 0 && (
        <Panel>
          <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Traffic over time</h3>
              <p className="text-xs text-muted-foreground">Last 24 hours of HTTP requests (hourly buckets)</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCached" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="shortLabel" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(label) => `Hour: ${label}`}
                  formatter={(value, name) => [Number(value).toLocaleString(), name === 'requests' ? 'Total requests' : 'Cached']}
                />
                <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRequests)" />
                <Area type="monotone" dataKey="cached" stroke="#94a3b8" fillOpacity={1} fill="url(#colorCached)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary"></div>
              Total requests
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-slate-400"></div>
              Cached requests
            </div>
          </div>
        </Panel>
      )}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Col: Purge Cache & WAF Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purge Cache Panel */}
          <Panel>
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Purge cache</h3>
                <p className="text-xs text-muted-foreground">Remove stored copies of your files to force edge nodes to fetch the latest origin updates.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Purge by path or pattern</label>
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
                    {purging ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Purge path'}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-muted-foreground/10 flex items-center justify-between">
                <div className="pr-4">
                  <h4 className="text-xs font-bold text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
                  </h4>
                  <p className="text-[11px] text-muted-foreground">This will invalidate all resources in edge nodes globally, inducing sudden high server load.</p>
                </div>
                <Button 
                  disabled={purging} 
                  onClick={() => handlePurge(true)} 
                  variant="destructive"
                  className="flex items-center gap-1.5 shrink-0"
                >
                  {purging ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Purge all content'}
                </Button>
              </div>
            </div>
          </Panel>

          {/* Web Application Firewall (WAF) */}
          <Panel>
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Web application firewall (WAF)</h3>
                <p className="text-xs text-muted-foreground">Firewall rules run at the Cloudflare edge.</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Managing WAF rules from CodeSpectra isn&apos;t available yet. Turn rules on or off in the{' '}
              <a
                href="https://dash.cloudflare.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Cloudflare dashboard<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
          </Panel>
        </div>

        {/* Right Col: Visitor Countries */}
        <div>
          <Panel className="h-full flex flex-col">
            <div className="flex items-center gap-3 border-b border-muted/50 pb-4 mb-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Visitor countries</h3>
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
                      <div key={c.country} className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/60">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold tabular-nums text-muted-foreground w-5">{i + 1}</span>
                          <MapPin className="h-4 w-4 text-primary shrink-0" />
                          <p className="text-sm font-medium">{c.country}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-foreground">{c.requests.toLocaleString()}</p>
                          <span className="text-[11px] text-muted-foreground">requests</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-10">No traffic recorded yet. Data appears once Cloudflare reports requests.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
