'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Download, Filter, ScrollText, Shield, User, KeyRound,
  Settings, Database, AlertTriangle, CheckCircle2, Clock, HelpCircle, Trash2,
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

const columns: DataTableColumn<AuditRow>[] = [
  {
    key: 'ts', header: 'Time',
    cell: (row) => (
      <div className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
        {row.ts?.replace('T', ' ').replace('Z', ' UTC')}
      </div>
    ),
  },
  {
    key: 'actor', header: 'Actor',
    cell: (row) => (
      <div>
        <p className="font-medium text-foreground">{row.actor}</p>
        {row.actorIp ? <p className="text-xs text-muted-foreground">{row.actorIp}</p> : null}
      </div>
    ),
  },
  { key: 'action', header: 'Action', cell: (row) => <span className="font-mono text-xs text-foreground">{row.action}</span> },
  {
    key: 'resource', header: 'Resource',
    cell: (row) => (
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-muted-foreground">{resourceIcon(row.resourceType)}</span>
        <div>
          <p className="text-foreground">{row.resource}</p>
          <p className="text-xs capitalize text-muted-foreground">{row.resourceType}</p>
          {row.detail ? <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p> : null}
        </div>
      </div>
    ),
  },
  {
    key: 'severity', header: 'Severity',
    cell: (row) => <Badge variant="outline" className={`font-normal ${severityBadge(row.severity)}`}>{row.severity}</Badge>,
  },
  {
    key: 'outcome', header: 'Outcome',
    cell: (row) => (
      <div className="flex items-center gap-2">
        {outcomeIcon(row.outcome)}
        <span className="capitalize text-muted-foreground">{row.outcome}</span>
      </div>
    ),
  },
]

export default function AuditLogsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [logs, setLogs] = useState<AuditRow[]>([])
  const [stats, setStats] = useState({ total: 0, critical: 0, warning: 0, denied: 0 })
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '1000' })
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      const json = await res.json()
      if (json.data) setLogs(json.data)
      if (json.stats) setStats(json.stats)
    } catch (error) {
      console.error('[CodeSpectra] Error fetching audit logs:', error)
    } finally { setLoading(false) }
  }

  useEffect(() => { void fetchLogs() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/admin/audit-logs/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} log(s) deleted` })
    setLogs(prev => prev.filter(l => !ids.includes(l.id)))
  }

  const handleExport = (ids: string[]) => {
    const selected = logs.filter(l => ids.includes(l.id))
    const headers = ['ts', 'actor', 'actorIp', 'action', 'resource', 'resourceType', 'severity', 'outcome', 'detail']
    const csv = [headers.join(','),
      ...selected.map(r => headers.map(h => {
        const v = (r as any)[h] || ''
        return `"${String(v).replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'audit-logs.csv'; a.click()
    URL.revokeObjectURL(url)
    addToast({ type: 'success', title: `${selected.length} row(s) exported as CSV` })
  }

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
    { label: 'Export Selected', icon: <Download className="w-3.5 h-3.5 mr-1" />, onClick: handleExport, clearSelection: false },
  ]

  if (!gate.ready) return null

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
              <div className="flex items-center gap-1.5">
                <p className="text-muted-foreground">Immutable trail of privileged actions</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs max-w-[250px]">Every privileged action is recorded immutably. Filter by severity, outcome, or search across actor, action, and resource.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={fetchLogs}>
            <Filter className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Events</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-[200px]">Total audit events in current view</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critical</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-[200px]">Role & policy changes marked critical</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.critical}</p>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Denied / failed</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-[200px]">Authz denials & validation errors</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{stats.denied}</p>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={logs}
        tableId="audit-logs"
        searchPlaceholder="Search actor, action, resource..."
        searchKeys={['actor', 'action', 'resource'] as (keyof AuditRow)[]}
        filters={[
          {
            label: 'Severity', key: 'severity',
            options: [
              { label: 'Info', value: 'info' },
              { label: 'Warning', value: 'warning' },
              { label: 'Critical', value: 'critical' },
            ],
          },
          {
            label: 'Outcome', key: 'outcome',
            options: [
              { label: 'Success', value: 'success' },
              { label: 'Failure', value: 'failure' },
              { label: 'Denied', value: 'denied' },
            ],
          },
        ]}
        bulkActions={bulkActions}
        loading={loading}
        emptyMessage="No audit events found."
        pageSize={50}
      />
    </div>
  )
}
