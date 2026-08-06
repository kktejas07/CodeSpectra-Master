'use client'

import { Badge } from '@/components/ui/badge'
import { DataTableColumn } from '@/components/ui/data-table'
import {
  AlertTriangle, CheckCircle2, Clock, Database, KeyRound,
  ScrollText, Settings, Shield, User,
} from 'lucide-react'

export type Severity = 'info' | 'warning' | 'critical'
export type Outcome = 'success' | 'failure' | 'denied'

export type AuditRow = {
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

export function severityBadge(s: Severity) {
  if (s === 'critical') return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
  if (s === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
  return 'border-border bg-muted text-muted-foreground'
}

export function outcomeIcon(o: Outcome) {
  if (o === 'success') return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
  if (o === 'denied') return <Shield className="h-4 w-4 text-amber-600" />
  return <AlertTriangle className="h-4 w-4 text-red-600" />
}

export function resourceIcon(t: string) {
  if (t === 'settings') return <Settings className="h-4 w-4" />
  if (t === 'identity' || t === 'organization') return <User className="h-4 w-4" />
  if (t === 'integration') return <KeyRound className="h-4 w-4" />
  if (t === 'database') return <Database className="h-4 w-4" />
  return <ScrollText className="h-4 w-4" />
}

export const auditLogColumns: DataTableColumn<AuditRow>[] = [
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
