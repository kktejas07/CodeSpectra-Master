'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { DataTableColumn } from '@/components/ui/data-table'
import {
  AlertTriangle, CheckCircle2, Clock, Database, KeyRound,
  LogIn, LogOut, Mail, MapPin, ScrollText, Settings, Shield,
  ShieldAlert, User, UserPlus, Users,
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
  /** Optional display name — populated by security API for unmasked view. */
  actorName?: string
}

/* ─── Human-readable action labels ─────────────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Sign in',
  'auth.signup': 'Sign up',
  'auth.failed_login': 'Failed sign in',
  'auth.rate_limited': 'Rate limited',
  'auth.blocked_ip': 'IP blocked',
  'auth.new_device': 'New device',
  'auth.impossible_travel': 'Suspicious sign-in',
  'auth.multi_account': 'Multi-account risk',
  'auth.blocked_fingerprint': 'Device blocked',
  'security.block_ip': 'Block IP',
  'security.unblock_ip': 'Unblock IP',
  'user.role.change': 'Role change',
  'team.member.invite': 'Member invited',
}

/** Turn a dotted action id (e.g. `settings.secrets.updated`) into a friendly label. */
function actionLabel(action: string): string {
  if (!action) return '—'
  const known = ACTION_LABELS[action]
  if (known) return known
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function actionIcon(action: string): ReactNode {
  const a = action || ''
  if (a.startsWith('auth.login')) return <LogIn className="h-3.5 w-3.5" />
  if (a.startsWith('auth.signup')) return <UserPlus className="h-3.5 w-3.5" />
  if (a.startsWith('auth.failed_login') || a.startsWith('auth.rate_limited') || a.includes('multi_account') || a.includes('impossible_travel'))
    return <ShieldAlert className="h-3.5 w-3.5" />
  if (a.startsWith('auth.')) return <Shield className="h-3.5 w-3.5" />
  if (a.startsWith('security.')) return <Shield className="h-3.5 w-3.5" />
  if (a.startsWith('user.')) return <User className="h-3.5 w-3.5" />
  if (a.startsWith('team.')) return <Users className="h-3.5 w-3.5" />
  if (a.startsWith('settings.')) return <Settings className="h-3.5 w-3.5" />
  return <ScrollText className="h-3.5 w-3.5" />
}

/* ─── PII masking (configurable — superadmin security page shows real values) ── */

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '•@•••'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const head = local[0]
  const tail = local.length > 1 ? '••••' : ''
  return `${head}${tail}@${domain}`
}

export function maskIp(ip: string): string {
  const v4 = ip.split('.')
  if (v4.length === 4 && v4.every((n) => /^\d+$/.test(n))) {
    return `${v4[0]}.${v4[1]}.${v4[2]}.***`
  }
  return ip.length > 4 ? `${ip.slice(0, 4)}••••` : '••••'
}

/** Mask a free-form identity (email or IP or fallback). */
function maskIdentity(value: string): string {
  if (!value || value === 'unknown') return 'Unknown'
  if (value.includes('@')) return maskEmail(value)
  if (/^\d+(\.\d+){3}$/.test(value)) return maskIp(value)
  if (/\d+\.\d+\.\d+\.\d+/.test(value)) return maskIp(value.split(' ')[0])
  return value
}

/** Unmasked identity — for superadmin security pages that need full detail. */
function unmaskIdentity(value: string): string {
  if (!value || value === 'unknown') return 'Unknown'
  return value
}

/** Split `email/foo@bar.com` style resources into a friendly label + masked id. */
export function parseResource(resource: string, unmasked = false): { label: string; value: string } {
  if (!resource || resource === 'unknown') return { label: 'Unknown resource', value: '' }
  const slash = resource.indexOf('/')
  if (slash <= 0) return { label: 'Resource', value: resource }

  const type = resource.slice(0, slash)
  const id = resource.slice(slash + 1)
  const maskFn = unmasked ? (v: string) => v : maskEmail
  switch (type) {
    case 'email': return { label: 'Account email', value: unmasked ? id : maskEmail(id) }
    case 'ip': return { label: 'IP address', value: unmasked ? id : maskIp(id) }
    case 'user': return { label: 'User account', value: id }
    case 'team': return { label: 'Team', value: id }
    case 'org': case 'organization': return { label: 'Organization', value: id }
    default: return { label: (type[0]?.toUpperCase() || '') + (type.slice(1) || '') + ' resource', value: id }
  }
}

function resourceHeader(resourceType: string): string {
  switch (resourceType) {
    case 'auth': return 'Authentication'
    case 'security': return 'Security'
    case 'organization': return 'Organization'
    case 'identity': return 'Identity'
    case 'settings': return 'Settings'
    case 'integration': return 'Integration'
    case 'database': return 'Database'
    default: return resourceType
  }
}

/* ─── Table columns ─────────────────────────────────────────────────────── */

function timeAgo(iso?: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms)) return '—'
  if (ms < 0) return 'now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
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
  if (t === 'settings') return <Settings className="h-4 w-4 text-muted-foreground" />
  if (t === 'identity' || t === 'organization') return <Users className="h-4 w-4 text-muted-foreground" />
  if (t === 'integration') return <KeyRound className="h-4 w-4 text-muted-foreground" />
  if (t === 'database') return <Database className="h-4 w-4 text-muted-foreground" />
  if (t === 'auth') return <LogIn className="h-4 w-4 text-muted-foreground" />
  if (t === 'security') return <Shield className="h-4 w-4 text-muted-foreground" />
  return <ScrollText className="h-4 w-4 text-muted-foreground" />
}

export const auditLogColumns: DataTableColumn<AuditRow>[] = [
  {
    key: 'ts', header: 'Time',
    cell: (row) => (
      <div className="whitespace-nowrap text-xs text-muted-foreground" title={row.ts ? `${row.ts.replace('T', ' ').replace('.000Z', ' UTC')} UTC` : undefined}>
        <Clock className="mr-1 inline h-3.5 w-3.5 opacity-70" />
        {timeAgo(row.ts)}
      </div>
    ),
  },
  {
    key: 'actor', header: 'Actor',
    cell: (row) => (
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">{maskIdentity(row.actor)}</p>
        {row.actorIp ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {maskIp(row.actorIp)}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'action', header: 'Action',
    cell: (row) => (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{actionIcon(row.action)}</span>
        <div>
          <p className="font-medium text-foreground">{actionLabel(row.action)}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{resourceHeader(row.resourceType)}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'resource', header: 'Resource',
    cell: (row) => {
      const { label, value } = parseResource(row.resource)
      return (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-muted-foreground">{resourceIcon(row.resourceType)}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{value || label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            {row.detail ? (
              <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={row.detail}>
                {row.detail}
              </p>
            ) : null}
          </div>
        </div>
      )
    },
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
        <span className="text-xs capitalize text-muted-foreground">{row.outcome}</span>
      </div>
    ),
  },
]

/** Unmasked columns for superadmin security page — shows full emails, IPs, and names. */
export const unmaskedAuditLogColumns: DataTableColumn<AuditRow>[] = [
  {
    key: 'ts', header: 'Time',
    cell: (row) => (
      <div className="whitespace-nowrap text-xs text-muted-foreground" title={row.ts ? `${row.ts.replace('T', ' ').replace('.000Z', ' UTC')} UTC` : undefined}>
        <Clock className="mr-1 inline h-3.5 w-3.5 opacity-70" />
        {timeAgo(row.ts)}
      </div>
    ),
  },
  {
    key: 'actor', header: 'Actor',
    cell: (row) => (
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">
          {row.actorName || unmaskIdentity(row.actor)}
        </p>
        {row.actorName && row.actor !== row.actorName ? (
          <p className="text-xs text-muted-foreground font-mono">{row.actor}</p>
        ) : null}
        {row.actorIp ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {row.actorIp}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'action', header: 'Action',
    cell: (row) => (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{actionIcon(row.action)}</span>
        <div>
          <p className="font-medium text-foreground">{actionLabel(row.action)}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{resourceHeader(row.resourceType)}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'resource', header: 'Resource',
    cell: (row) => {
      const { label, value } = parseResource(row.resource, true)
      return (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-muted-foreground">{resourceIcon(row.resourceType)}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{value || label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            {row.detail ? (
              <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={row.detail}>
                {row.detail}
              </p>
            ) : null}
          </div>
        </div>
      )
    },
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
        <span className="text-xs capitalize text-muted-foreground">{row.outcome}</span>
      </div>
    ),
  },
]