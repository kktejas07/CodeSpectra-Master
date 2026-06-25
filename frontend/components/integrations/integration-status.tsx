'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle } from 'lucide-react'

interface ConfiguredIntegration {
  id: string
  name: string
  status: 'active' | 'warning' | 'error'
  lastSync?: string
  stats?: Record<string, number>
  settings?: Record<string, string>
}

interface IntegrationStatusProps {
  integrations?: ConfiguredIntegration[]
}

export function IntegrationStatus({
  integrations = [
    {
      id: 'github',
      name: 'GitHub',
      status: 'active',
      lastSync: '5 minutes ago',
      stats: {
        repositories: 12,
        branches: 45,
        workflows: 8,
      },
    },
    {
      id: 'slack',
      name: 'Slack',
      status: 'active',
      lastSync: '2 hours ago',
      stats: {
        notifications: 156,
        channels: 3,
      },
    },
  ],
}: IntegrationStatusProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
      case 'error':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      default:
        return 'bg-gray-500/20'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-4 h-4" />
      case 'warning':
      case 'error':
        return <AlertCircle className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Integration Status</h2>

      <div className="grid gap-4">
        {integrations.map((integration) => (
          <Card key={integration.id} className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">{integration.name}</h3>
                {integration.lastSync && (
                  <p className="text-xs text-muted-foreground">Last sync: {integration.lastSync}</p>
                )}
              </div>
              <Badge className={getStatusColor(integration.status)}>
                {getStatusIcon(integration.status)}
                <span className="ml-1 capitalize">{integration.status}</span>
              </Badge>
            </div>

            {integration.stats && (
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(integration.stats).map(([key, value]) => (
                  <div key={key} className="p-2 bg-muted/50 rounded">
                    <p className="text-xs text-muted-foreground capitalize">{key}</p>
                    <p className="text-lg font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
