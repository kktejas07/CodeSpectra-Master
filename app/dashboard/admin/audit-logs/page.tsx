'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Download, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function AuditLogs() {
  const logs = [
    { id: 1, action: 'User Created', user: 'system', target: 'john@example.com', timestamp: '2 hours ago' },
    { id: 2, action: 'Role Updated', user: 'admin@example.com', target: 'jane@example.com', timestamp: '5 hours ago' },
    { id: 3, action: 'Settings Modified', user: 'superadmin@example.com', target: 'System Settings', timestamp: '1 day ago' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">System activity and changes</p>
        </div>
        <Button className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-6">
          <Input placeholder="Search logs..." />
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>

        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between p-4 border border-border/40 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{log.action}</p>
                  <p className="text-sm text-muted-foreground">By {log.user} on {log.target}</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
