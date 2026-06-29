'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download,
  Filter,
  ScrollText,
  Shield,
  User,
  KeyRound,
  Settings,
  Database,
  AlertTriangle,
  CheckCircle2,
  Search,
  Clock,
} from 'lucide-react'

type Severity = 'info' | 'warning' | 'critical'
type Outcome = 'success' | 'failure' | 'denied'

type AuditRow = {
  id: string
  ts: string
  actor: string
  actorIp?: string
  action: string
  resource: string
  resourceType: string
  severity: Severity
  outcome: Outcome
  detail?: string
}

function severityBadge(s: Severity) {
  if (s === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
  if (s === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
  return 'border-border bg-muted text-muted-foreground'
}

function outcomeIcon(o: Outcome) {
  if (o === 'success') return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
  if (o === 'denied') return <Shield className="h-4 w-4 text-amber-600" />
  return <AlertTriangle className="h-4 w-4 text-red-600" />
}

function resourceIcon(t: string) {
  if (t === 'settings') return <Settings className="h-4 w-4" />
  if (t === 'identity' || t === 'organization') return <User className="h-4 w-4" />
  if (t === 'integration') return <KeyRound className="h-4 w-4" />
  if (t === 'database') return <Database className="h-4 w-4" />
  return <ScrollText className="h-4 w-4" />
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [stats, setStats] = useState({ total: 0, critical: 0, warning: 0, denied: 0 })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState<string>('all')
  const [outcome, setOutcome] = useState<string>('all')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (severity !== 'all') params.set('severity', severity)
      if (outcome !== 'all') params.set('outcome', outcome)
      if (query.trim()) params.set('q', query.trim())
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      const json = await res.json()
      if (json.data) setLogs(json.data)
      if (json.stats) setStats(json.stats)
    } catch (error) {
      console.error('[CodeSpectra] Error fetching audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const filtered = useMemo(() => {
    return logs
  }, [logs])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ScrollText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Audit logs</h1>
              <p className="text-muted-foreground">Immutable trail of privileged actions</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={fetchLogs}>
            <Filter className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Events</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total audit events</p>
        </Card>
        <Card className="border-border/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.critical}</p>
          <p className="text-xs text-muted-foreground">Role & policy changes</p>
        </Card>
        <Card className="border-border/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Denied / failed</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.denied}</p>
          <p className="text-xs text-muted-foreground">Authz & validation errors</p>
        </Card>
      </div>

      <Card className="border-border/60 p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search action, actor, resource…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchLogs() }}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={severity} onValueChange={(v) => { setSeverity(v); setTimeout(fetchLogs, 0) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={outcome} onValueChange={(v) => { setOutcome(v); setTimeout(fetchLogs, 0) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="mb-4" />

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading audit logs…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((row) => (
                  <tr key={row.id} className="bg-card/40 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {row.ts?.replace('T', ' ').replace('Z', ' UTC')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.actor}</p>
                      {row.actorIp ? <p className="text-xs text-muted-foreground">{row.actorIp}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.action}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-muted-foreground">{resourceIcon(row.resourceType)}</span>
                        <div>
                          <p className="text-foreground">{row.resource}</p>
                          <p className="text-xs capitalize text-muted-foreground">{row.resourceType}</p>
                          {row.detail ? <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`font-normal ${severityBadge(row.severity)}`}>
                        {row.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {outcomeIcon(row.outcome)}
                        <span className="capitalize text-muted-foreground">{row.outcome}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">No audit events found.</p>
        ) : null}
      </Card>
    </div>
  )
}
