'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { usePageGuard } from '@/lib/use-page-guard'
import {
  Shield, Users, LogIn, Ban, Globe, Monitor, Smartphone, Tablet,
  AlertTriangle, CheckCircle, XCircle, Clock, MapPin, Activity,
  RefreshCw, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'

interface SecuritySetting {
  _id?: string
  name: string
  status: string
  icon: string
  description?: string
}

interface UserSession {
  id: string
  user_id: string
  email: string
  ip: string
  user_agent: string
  browser: string
  os: string
  device: 'desktop' | 'mobile' | 'tablet'
  country: string | null
  city: string | null
  isp: string | null
  last_seen: string
  created_at: string
  is_active: boolean
}

interface LoginEvent {
  id: string
  ts: string
  actor: string
  actorIp: string
  action: string
  outcome: 'success' | 'denied'
  severity: string
  detail?: string
  user_id: string
}

interface DashboardData {
  settings: SecuritySetting[]
  activeSessions: UserSession[]
  sessionStats: {
    totalToday: number
    uniqueUsersToday: number
    activeNow: number
    successCount: number
    failedCount: number
  }
  loginEvents: LoginEvent[]
  recentAlerts: LoginEvent[]
  geoStats: { _id: string; count: number }[]
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<any>; color: string }) {
  return (
    <Card className="p-5 border-border/60 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

function DeviceIcon({ device }: { device: string }) {
  if (device === 'mobile') return <Smartphone className="h-3.5 w-3.5" />
  if (device === 'tablet') return <Tablet className="h-3.5 w-3.5" />
  return <Monitor className="h-3.5 w-3.5" />
}

function SessionRow({ session }: { session: UserSession }) {
  const [expanded, setExpanded] = useState(false)
  const lastSeen = new Date(session.last_seen)
  const isRecent = Date.now() - lastSeen.getTime() < 5 * 60 * 1000

  return (
    <>
      <tr
        className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRecent ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
            <DeviceIcon device={session.device} />
            <span className="text-sm font-medium">{session.browser}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-sm">{session.os}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{session.email || session.user_id.slice(0, 8)}</td>
        <td className="py-3 px-4 text-sm font-mono">{session.ip}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {session.country ? `${session.city || ''}, ${session.country}` : '—'}
        </td>
        <td className="py-3 px-4 text-right">{expanded ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="py-3 px-8">
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Session ID</span><p className="font-mono mt-0.5">{session.id}</p></div>
              <div><span className="font-medium text-foreground">User Agent</span><p className="truncate mt-0.5">{session.user_agent}</p></div>
              <div><span className="font-medium text-foreground">ISP</span><p className="mt-0.5">{session.isp || '—'}</p></div>
              <div><span className="font-medium text-foreground">Signed in</span><p className="mt-0.5">{new Date(session.created_at).toLocaleString()}</p></div>
              <div><span className="font-medium text-foreground">Last seen</span><p className="mt-0.5">{lastSeen.toLocaleString()}</p></div>
              <div><span className="font-medium text-foreground">User ID</span><p className="font-mono mt-0.5">{session.user_id}</p></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Security() {
  const gate = usePageGuard('superadmin')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dashRes, setRes] = await Promise.all([
        fetch('/api/admin/security/dashboard'),
        fetch('/api/admin/security'),
      ])
      const dashJson = await dashRes.json()
      const setJson = await setRes.json()
      if (dashRes.ok) setData(dashJson)
      if (setRes.ok && setJson.data && dashJson.settings) {
        setData(prev => prev ? { ...prev, settings: setJson.data } : null)
      } else if (setRes.ok && setJson.data) {
        setData(prev => prev ? { ...prev, settings: setJson.data } : {
          settings: setJson.data,
          activeSessions: [],
          sessionStats: { totalToday: 0, uniqueUsersToday: 0, activeNow: 0, successCount: 0, failedCount: 0 },
          loginEvents: [],
          recentAlerts: [],
          geoStats: [],
        })
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleSetting = useCallback(async (name: string, currentStatus: string) => {
    setToggling(name)
    const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled'
    try {
      const res = await fetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status: newStatus }),
      })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          settings: prev.settings.map(s => s.name === name ? { ...s, status: newStatus } : s),
        } : prev)
      }
    } catch {}
    setToggling(null)
  }, [])

  if (!gate.ready) return null

  const stats = data?.sessionStats

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor active sessions, login activity, and security configuration</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active Now"
              value={stats?.activeNow ?? 0}
              sub={stats ? `${stats.uniqueUsersToday} unique today` : undefined}
              icon={Activity}
              color="bg-emerald-600"
            />
            <StatCard
              label="Logins Today"
              value={stats ? `${stats.successCount}` : '0'}
              sub={stats ? `${stats.totalToday} total sessions` : undefined}
              icon={LogIn}
              color="bg-blue-600"
            />
            <StatCard
              label="Failed Attempts"
              value={stats?.failedCount ?? 0}
              sub="Today"
              icon={Ban}
              color="bg-red-600"
            />
            <StatCard
              label="Active Sessions"
              value={data?.activeSessions?.length ?? 0}
              sub="Last 24h"
              icon={Users}
              color="bg-violet-600"
            />
          </div>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Active Sessions</h3>
              </div>
              <Badge variant="outline" className="text-xs">{data?.activeSessions?.length ?? 0} sessions</Badge>
            </div>
            {data?.activeSessions && data.activeSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4 font-medium">Device / Browser</th>
                      <th className="text-left py-3 px-4 font-medium">OS</th>
                      <th className="text-left py-3 px-4 font-medium">User</th>
                      <th className="text-left py-3 px-4 font-medium">IP Address</th>
                      <th className="text-left py-3 px-4 font-medium">Location</th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.activeSessions.map(s => <SessionRow key={s.id} session={s} />)}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Shield className="mx-auto h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No active sessions. Sessions appear after users log in.</p>
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Login Activity</h3>
              </div>
              {data?.loginEvents && data.loginEvents.length > 0 ? (
                <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                  {data.loginEvents.map(e => (
                    <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                      {e.outcome === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{e.actor}</span>
                          <span className="text-muted-foreground"> — {e.outcome === 'success' ? 'signed in' : `failed (${e.detail || 'unknown'})`}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(e.ts).toLocaleString()}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.actorIp}</span>
                        </div>
                      </div>
                      <Badge variant={e.outcome === 'success' ? 'secondary' : 'destructive'} className="text-[10px] shrink-0">
                        {e.outcome}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <LogIn className="mx-auto h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No login events today</p>
                </div>
              )}
            </Card>

            <Card className="border-border/60">
              <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold">Security Alerts</h3>
              </div>
              {data?.recentAlerts && data.recentAlerts.length > 0 ? (
                <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto">
                  {data.recentAlerts.map(a => (
                    <div key={a.id} className="px-6 py-3 flex items-start gap-3">
                      {a.severity === 'critical' ? (
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">{a.action}</span>
                          {a.detail && <span className="text-muted-foreground"> — {a.detail}</span>}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(a.ts).toLocaleString()}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.actorIp}</span>
                        </div>
                      </div>
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {a.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Shield className="mx-auto h-8 w-8 mb-2 text-muted-foreground/40" />
                  <p className="text-sm">No security alerts in the past 7 days</p>
                </div>
              )}
            </Card>
          </div>

          <Card className="border-border/60">
            <div className="border-b border-border/60 px-6 py-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Security Settings</h3>
            </div>
            {data?.settings && data.settings.length > 0 ? (
              <div className="grid gap-0 divide-y divide-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {data.settings.map(s => (
                  <div key={s.name} className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <Switch
                      checked={s.status === 'enabled'}
                      disabled={toggling === s.name}
                      onCheckedChange={() => toggleSetting(s.name, s.status)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Shield className="mx-auto h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">No security settings configured. Run the seed script to populate defaults.</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
