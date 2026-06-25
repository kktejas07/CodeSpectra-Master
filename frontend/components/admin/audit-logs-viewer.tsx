'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, User, CheckCircle } from 'lucide-react'

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

export function AuditLogsViewer({
  logs = [
    {
      id: '1',
      action: 'USER_CREATED',
      resource: 'users',
      user: 'superadmin@example.com',
      timestamp: '2 minutes ago',
      status: 'success',
      details: 'Created new user: john@example.com',
    },
    {
      id: '2',
      action: 'ROLE_ASSIGNED',
      resource: 'roles',
      user: 'admin@example.com',
      timestamp: '15 minutes ago',
      status: 'success',
      details: 'Assigned admin role to jane@example.com',
    },
    {
      id: '3',
      action: 'SYSTEM_SETTINGS_UPDATED',
      resource: 'settings',
      user: 'superadmin@example.com',
      timestamp: '1 hour ago',
      status: 'success',
      details: 'Updated security settings',
    },
    {
      id: '4',
      action: 'USER_DELETED',
      resource: 'users',
      user: 'superadmin@example.com',
      timestamp: '3 hours ago',
      status: 'success',
      details: 'Deleted inactive user account',
    },
    {
      id: '5',
      action: 'UNAUTHORIZED_ACCESS',
      resource: 'admin',
      user: 'user@example.com',
      timestamp: '5 hours ago',
      status: 'failed',
      details: 'Attempted to access admin panel without permission',
    },
  ],
}: AuditLogsViewerProps) {
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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Clock className="w-6 h-6 text-primary" />
        Audit Logs
      </h2>

      <Card className="overflow-hidden">
        <div className="space-y-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={log.id}
                className={`p-4 border-b border-border/50 hover:bg-muted/50 transition-colors ${
                  index === logs.length - 1 ? 'border-b-0' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-foreground">
                        {getActionLabel(log.action)}
                      </span>
                      <Badge className={getStatusColor(log.status)}>
                        {log.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {log.timestamp}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-sm text-muted-foreground mb-2">{log.details}</p>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.user}
                      </span>
                      <span>Resource: {log.resource}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {logs.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {logs.length} most recent logs
        </div>
      )}
    </div>
  )
}
