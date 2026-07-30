'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, User, Loader2 } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

interface AuditLog {
  id: string
  action: string
  resource: string
  user: string
  timestamp: string
  status: 'success' | 'failed' | 'pending'
  details?: string
}

interface AuditLogsViewerProps {
  logs?: AuditLog[]
}

export function AuditLogsViewer({ logs: propLogs }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(!propLogs)

  useEffect(() => {
    if (propLogs) {
      setLogs(propLogs)
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/admin/audit-logs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => { if (!cancelled) setLogs(d.data || d.logs || []) })
      .catch(() => { if (!cancelled) setLogs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [propLogs])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'failed':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
      default:
        return 'bg-gray-500/20 text-gray-700'
    }
  }

  const getActionLabel = (action: string) => {
    return action.replace(/_/g, ' ').split(' ').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
  }

  const columns: DataTableColumn<AuditLog>[] = [
    {
      key: 'action',
      header: 'Action',
      cell: (row) => (
        <div>
          <span className="font-semibold">{getActionLabel(row.action)}</span>
          {row.details && <p className="text-xs text-muted-foreground mt-0.5">{row.details}</p>}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      cell: (row) => (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          <User className="w-3.5 h-3.5" />
          {row.user}
        </span>
      ),
    },
    {
      key: 'resource',
      header: 'Resource',
      cell: (row) => <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{row.resource}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge className={getStatusColor(row.status)} variant="outline">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'timestamp',
      header: 'Time',
      cell: (row) => <span className="text-xs text-muted-foreground whitespace-nowrap">{row.timestamp}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Clock className="w-6 h-6 text-primary" />
        Audit Logs
      </h2>

      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        searchPlaceholder="Search audit logs..."
        searchKeys={['action', 'user', 'resource']}
        emptyMessage="No audit logs available."
      />
    </div>
  )
}
