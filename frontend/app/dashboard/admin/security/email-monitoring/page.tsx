'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Mail, MailOpen, MailX, AlertTriangle, RefreshCw,
  Search, Download, BarChart3, Globe, Monitor,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

type EmailStatus = 'sending' | 'delivered' | 'bounced' | 'failed' | 'spam' | 'deferred'
type EmailCategory = 'transactional' | 'newsletter' | 'invite' | 'notification'

interface EmailLog {
  id: string
  to_email: string
  subject: string
  category: EmailCategory
  delivery_status: EmailStatus
  delivery_error?: string | null
  delivery_updated_at?: string | null
  postal_message_id?: number | null
  sender_ip?: string | null
  device_info?: { browser: { name: string; version?: string }; os: { name: string }; device_type: string } | null
  geo?: { country?: string; region?: string; city?: string; timezone?: string } | null
  created_at: string
}

interface Stats {
  total: number
  delivered: number
  bounced: number
  failed: number
  spam: number
  sending: number
  byDomain: { _id: string; count: number }[]
  byCountry: { _id: string; count: number }[]
  byCategory: { _id: string; count: number }[]
  bounceReasons: { _id: string; count: number }[]
}

const STATUS_COLORS: Record<EmailStatus, string> = {
  sending: 'info',
  delivered: 'success',
  bounced: 'warning',
  failed: 'danger',
  spam: 'danger',
  deferred: 'warning',
}

const CATEGORY_COLORS: Record<EmailCategory, string> = {
  transactional: 'secondary',
  newsletter: 'info',
  invite: 'info',
  notification: 'info',
}

const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#f97316', '#3b82f6', '#8b5cf6']

export default function EmailMonitoring() {
  const gate = usePageGuard('superadmin')
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<EmailCategory | ''>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [skip, setSkip] = useState(0)

  const LIMIT = 100

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        skip: String(skip),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(search ? { search } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      })
      const res = await fetch(`/api/admin/email-logs?${params}`)
      const json = await res.json()
      if (res.ok) {
        setLogs(json.logs)
        setTotal(json.total)
        setStats(json.stats)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [statusFilter, categoryFilter, search, startDate, endDate, skip])

  useEffect(() => { if (gate.ready) fetchData() }, [gate.ready, fetchData])

  useEffect(() => {
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [fetchData])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setCategoryFilter('')
    setStartDate('')
    setEndDate('')
    setSkip(0)
  }

  const exportCsv = () => {
    const headers = ['Timestamp', 'To', 'Subject', 'Category', 'Status', 'Error', 'IP', 'Country', 'City', 'Browser', 'OS']
    const rows = logs.map(l => [
      l.created_at,
      l.to_email,
      l.subject,
      l.category,
      l.delivery_status,
      l.delivery_error || '',
      l.sender_ip || '',
      l.geo?.country || '',
      l.geo?.city || '',
      l.device_info?.browser.name || '',
      l.device_info?.os.name || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `email-logs-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!gate.ready) return null

  const bounceRate = stats?.total ? ((stats.bounced + stats.failed + stats.spam) / stats.total * 100).toFixed(1) : '0.0'

  // ── Chart data ──
  const statusData = stats ? [
    { name: 'Delivered', value: stats.delivered, color: '#22c55e' },
    { name: 'Bounced', value: stats.bounced, color: '#f59e0b' },
    { name: 'Failed', value: stats.failed, color: '#ef4444' },
    { name: 'Spam', value: stats.spam, color: '#f97316' },
    { name: 'Sending', value: stats.sending, color: '#3b82f6' },
  ].filter(d => d.value > 0) : []

  const categoryData = (stats?.byCategory || []).map(d => ({
    name: d._id || 'unknown',
    count: d.count,
  }))

  const domainData = (stats?.byDomain || []).slice(0, 10).map(d => ({
    domain: d._id || 'unknown',
    count: d.count,
  }))

  const countryData = (stats?.byCountry || []).slice(0, 10).map(d => ({
    country: d._id || 'Unknown',
    count: d.count,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track delivery status, bounces, spam complaints, and sender reputation across all channels
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={logs.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total Sent" value={stats?.total ?? 0} icon={Mail} color="bg-slate-600" />
        <StatCard label="Delivered" value={stats?.delivered ?? 0} icon={MailOpen} color="bg-emerald-600" />
        <StatCard label="Bounced" value={stats?.bounced ?? 0} icon={MailX} color="bg-amber-600" />
        <StatCard label="Failed" value={stats?.failed ?? 0} icon={MailX} color="bg-red-600" />
        <StatCard label="Spam" value={stats?.spam ?? 0} icon={AlertTriangle} color="bg-orange-600" />
        <StatCard label="Bounce Rate" value={`${bounceRate}%`} icon={BarChart3} color="bg-rose-600" sub={stats?.sending ? `${stats.sending} sending` : undefined} />
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="logs" className="gap-1.5"><Mail className="h-4 w-4" />Delivery Log</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="domains" className="gap-1.5"><Globe className="h-4 w-4" />Domains & Geo</TabsTrigger>
          <TabsTrigger value="failures" className="gap-1.5"><AlertTriangle className="h-4 w-4" />Bounce Reasons</TabsTrigger>
        </TabsList>

        {/* ── Delivery Log ─────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="border-border/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-50">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search email or subject..." value={search} onChange={e => { setSearch(e.target.value); setSkip(0) }} className="pl-9" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as any); setSkip(0) }} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="sending">Sending</option>
                <option value="bounced">Bounced</option>
                <option value="failed">Failed</option>
                <option value="spam">Spam</option>
                <option value="deferred">Deferred</option>
              </select>
              <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value as any); setSkip(0) }} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">All Categories</option>
                <option value="transactional">Transactional</option>
                <option value="newsletter">Newsletter</option>
                <option value="invite">Invite</option>
                <option value="notification">Notification</option>
              </select>
              <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setSkip(0) }} className="w-auto" />
              <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setSkip(0) }} className="w-auto" />
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
            </div>
          </Card>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{total} total emails{statusFilter ? ` · filtered` : ''}</p>
              <div className="flex items-center gap-2">
                {skip > 0 && <Button variant="outline" size="sm" onClick={() => setSkip(s => Math.max(0, s - LIMIT))}>Previous</Button>}
                {skip + LIMIT < total && <Button variant="outline" size="sm" onClick={() => setSkip(s => s + LIMIT)}>Next</Button>}
              </div>
            </div>
            {logs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                      <th className="text-left py-3 px-4 font-medium">Recipient</th>
                      <th className="text-left py-3 px-4 font-medium">Subject</th>
                      <th className="text-left py-3 px-4 font-medium">Category</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">IP / Location</th>
                      <th className="text-left py-3 px-4 font-medium">Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => <EmailRow key={log.id} log={log} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Mail className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No email logs yet. Emails appear after the first send.</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Analytics ─────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Delivery Status Breakdown</h3>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>

            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Emails by Category</h3>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>
          </div>

          <Card className="border-border/60 p-4">
            <h3 className="font-semibold text-sm mb-3">Bounce / Failure Reasons</h3>
            {stats?.bounceReasons && stats.bounceReasons.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {stats.bounceReasons.map((reason, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <p className="text-sm font-mono truncate flex-1 mr-4" title={reason._id}>{reason._id || 'Unknown error'}</p>
                    <Badge variant="secondary" className="text-xs">{reason.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-25 text-muted-foreground text-xs">No failures recorded</div>
            )}
          </Card>
        </TabsContent>

        {/* ── Domains & Geo ─────────────────────────────────── */}
        <TabsContent value="domains" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Top Recipient Domains</h3>
              {domainData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={domainData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="domain" type="category" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground text-xs">No data</div>
              )}
            </Card>

            <Card className="border-border/60 p-4">
              <h3 className="font-semibold text-sm mb-3">Recipients by Country</h3>
              {countryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={countryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="country" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground text-xs">No geo data yet</div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ── Bounce Reasons ────────────────────────────────── */}
        <TabsContent value="failures" className="space-y-4">
          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold">Bounce / Error Details</h3>
              </div>
              <Badge variant="outline" className="text-xs">{stats?.bounceReasons?.length ?? 0} unique errors</Badge>
            </div>
            {stats?.bounceReasons && stats.bounceReasons.length > 0 ? (
              <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                {stats.bounceReasons.map((reason, i) => (
                  <div key={i} className="px-6 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono break-all">{reason._id || 'Unknown error'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{reason.count} occurrence{reason.count !== 1 ? 's' : ''}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{reason.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <MailOpen className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No bounces or failures recorded. All emails delivering cleanly.</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ComponentType<any>
  color: string
}) {
  return (
    <Card className="p-4 border-border/60 flex items-start gap-3">
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

function EmailRow({ log }: { log: EmailLog }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(log.created_at)

  return (
    <>
      <tr className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setExpanded(!expanded)}>
        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{time.toLocaleString()}</td>
        <td className="py-3 px-4 text-sm font-mono">{log.to_email}</td>
        <td className="py-3 px-4 text-sm .5 truncate" title={log.subject}>{log.subject}</td>
        <td className="py-3 px-4">
          <Badge variant="outline" className={`text-[10px] ${(CATEGORY_COLORS[log.category] || '') as any}`}>{log.category}</Badge>
        </td>
        <td className="py-3 px-4">
          <Badge variant={(STATUS_COLORS[log.delivery_status] || 'secondary') as any} className="text-[10px]">{log.delivery_status}</Badge>
        </td>
        <td className="py-3 px-4 text-xs text-muted-foreground">
          {log.geo ? `${log.geo.city || ''} ${log.geo.country || ''}`.trim() || log.geo.country || '—' : '—'}
        </td>
        <td className="py-3 px-4 text-xs text-muted-foreground">
          {log.device_info ? `${log.device_info.browser.name} / ${log.device_info.os.name}` : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={7} className="py-3 px-8">
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Subject</span><p className="truncate mt-0.5">{log.subject}</p></div>
              <div><span className="font-medium text-foreground">Sender IP</span><p className="font-mono mt-0.5">{log.sender_ip || '—'}</p></div>
              <div><span className="font-medium text-foreground">Device</span><p className="mt-0.5">{log.device_info ? `${log.device_info.browser.name} ${log.device_info.browser.version} on ${log.device_info.os.name}` : '—'}</p></div>
              {log.delivery_error && (
                <div className="col-span-3"><span className="font-medium text-red-500">Error</span><p className="font-mono mt-0.5 text-red-600 break-all">{log.delivery_error}</p></div>
              )}
              <div><span className="font-medium text-foreground">Updated</span><p className="mt-0.5">{log.delivery_updated_at ? new Date(log.delivery_updated_at).toLocaleString() : '—'}</p></div>
              <div><span className="font-medium text-foreground">Geo</span><p className="mt-0.5">{log.geo ? `${log.geo.city || ''}, ${log.geo.country || ''}`.trim() || '—' : '—'}</p></div>
              <div><span className="font-medium text-foreground">Postal ID</span><p className="font-mono mt-0.5">{log.delivery_status === 'sending' ? 'Pending webhook' : log.postal_message_id || 'N/A'}</p></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
