'use client'

import { useEffect, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { unmaskedAuditLogColumns, type AuditRow } from '@/components/admin/audit-log-columns'

interface AuditLogsViewerProps {
  logs?: AuditRow[]
}

export function AuditLogsViewer({ logs: propLogs }: AuditLogsViewerProps) {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(!propLogs)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const fetchLogs = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, { credentials: 'include' })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d) throw new Error('load failed')
      setLogs(d.data || d.logs || [])
      setLoadError(false)
    } catch {
      // Keep whatever was loaded before; say so instead of showing an empty table.
      setLoadError(true)
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
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Clock className="h-5 w-5 text-primary" />
          Audit logs
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

      {loadError && logs.length === 0 ? (
        <EmptyState
          compact
          illustration="error"
          title="Couldn't load audit logs"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void fetchLogs(true)}
        />
      ) : (
      <>
      {loadError ? (
        <p className="text-xs text-destructive" role="status">Couldn&apos;t refresh the audit logs — showing the last loaded entries.</p>
      ) : null}
      <DataTable
        columns={unmaskedAuditLogColumns}
        data={logs}
        tableId="audit-logs-overview"
        searchPlaceholder="Search actor, action, resource..."
        searchKeys={['actor', 'action', 'resource', 'resourceType', 'detail'] as (keyof AuditRow)[]}
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
        emptyState={{ illustration: 'security' }} emptyMessage="No audit events yet. Admin actions will be logged here."
        pageSize={20}
      />
      </>
      )}
    </div>
  )
}
