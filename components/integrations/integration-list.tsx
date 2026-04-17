'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Github, Slack, CheckCircle2, AlertCircle, Plus, Settings, Trash2 } from 'lucide-react'

interface Integration {
  id: string
  name: string
  slug: string
  description: string
  icon: React.ReactNode
  status: 'connected' | 'disconnected' | 'error'
  permissions?: string[]
  connectedAt?: string
  lastActivity?: string
}

interface IntegrationListProps {
  integrations?: Integration[]
  onConnect?: (integrationId: string) => void
  onDisconnect?: (integrationId: string) => void
  onConfigure?: (integrationId: string) => void
}

const DEFAULT_INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    slug: 'github',
    description: 'Connect your GitHub repositories for automatic code scanning and analysis',
    icon: <Github className="w-6 h-6" />,
    status: 'disconnected',
    permissions: ['repo', 'workflow', 'read:org'],
  },
  {
    id: 'slack',
    name: 'Slack',
    slug: 'slack',
    description: 'Send notifications and alerts to your Slack workspace',
    icon: <Slack className="w-6 h-6" />,
    status: 'disconnected',
    permissions: ['chat:write', 'users:read'],
  },
  {
    id: 'sonarqube',
    name: 'SonarQube',
    slug: 'sonarqube',
    description: 'Integrate with SonarQube for advanced code quality analysis',
    icon: <CheckCircle2 className="w-6 h-6" />,
    status: 'disconnected',
    permissions: ['ce:browse', 'issues:read'],
  },
]

export function IntegrationList({
  integrations = DEFAULT_INTEGRATIONS,
  onConnect,
  onDisconnect,
  onConfigure,
}: IntegrationListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'error':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      default:
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="w-4 h-4" />
      case 'error':
        return <AlertCircle className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Integrations</h2>
      <p className="text-muted-foreground">
        Connect external services to enhance CodeSpectra with automated workflows and notifications
      </p>

      <div className="grid gap-4">
        {integrations.map((integration) => (
          <Card key={integration.id} className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {integration.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-foreground">{integration.name}</h3>
                    <Badge className={getStatusColor(integration.status)}>
                      {getStatusIcon(integration.status)}
                      <span className="ml-1 capitalize">{integration.status}</span>
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{integration.description}</p>
                  
                  {integration.permissions && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground/70">Required permissions:</p>
                      <div className="flex flex-wrap gap-1">
                        {integration.permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {integration.connectedAt && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Connected since {integration.connectedAt}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {integration.status === 'disconnected' ? (
                  <Button onClick={() => onConnect?.(integration.id)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Connect
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => onConfigure?.(integration.id)}
                      className="gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Configure
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onDisconnect?.(integration.id)}
                      className="gap-2 text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
