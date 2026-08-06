'use client'

import { useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { auditLogColumns, type AuditRow } from '@/components/admin/audit-log-columns'

interface AuditLogsViewerProps {
  logs?: AuditRow[]
}

export function AuditLogsViewer({ logs: propLogs }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(!propLogs)
  const [refreshing, setRefreshing] = useState(false)

  const fetchLogs = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, { credentials: 'include' })
      const d = await res.json()
      setLogs(d.data || d.logs || [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (propLogs) {
      setLogs(propLogs)
      setLoading(false)
      return
    }
    void fetchLogs()
  }, [propLogs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Clock className="h-6 w-6 text-primary" />
          Audit Logs
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void fetchLogs(true)}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <DataTable
        columns={auditLogColumns}
        data={logs}
        tableId="audit-logs-overview"
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
        loading={loading}
        emptyMessage="No audit events found."
        pageSize={20}
      />
    </div>
  )
}
