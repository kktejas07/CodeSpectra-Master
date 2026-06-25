'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Github,
  Slack,
  CheckCircle2,
  AlertCircle,
  Plus,
  Settings,
  Trash2,
  ScanLine,
  Bug,
  Kanban,
  MessageSquare,
  ListTodo,
} from 'lucide-react'

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
  /** When true, Connect is disabled — roadmap / not wired yet */
  comingSoon?: boolean
}

interface IntegrationListProps {
  integrations?: Integration[]
  onConnect?: (integrationId: string) => void
  onDisconnect?: (integrationId: string) => void
  onConfigure?: (integrationId: string) => void
  /** Hide the list title when the parent page already shows a main heading */
  hideListHeading?: boolean
}

const DEFAULT_INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    slug: 'github',
    description: 'Repos and webhooks for scans, PR comments, and activity in CodeSpectra.',
    icon: <Github className="h-6 w-6" />,
    status: 'disconnected',
    permissions: ['repo', 'workflow', 'read:org'],
  },
  {
    id: 'slack',
    name: 'Slack',
    slug: 'slack',
    description: 'Post scan results, alerts, and digest messages to channels your team already uses.',
    icon: <Slack className="h-6 w-6" />,
    status: 'disconnected',
    permissions: ['chat:write', 'users:read'],
  },
  {
    id: 'sonarqube',
    name: 'SonarQube',
    slug: 'sonarqube',
    description:
      'Optional server link: pull quality gates and findings from SonarQube into CodeSpectra alongside the built-in scanner — not a browser plugin.',
    icon: <ScanLine className="h-6 w-6" />,
    status: 'disconnected',
    permissions: ['Server URL + token', 'project key'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    slug: 'sentry',
    description: 'Correlate runtime errors and releases with repos you track in CodeSpectra.',
    icon: <Bug className="h-6 w-6" />,
    status: 'disconnected',
    comingSoon: true,
  },
  {
    id: 'jira',
    name: 'Jira',
    slug: 'jira',
    description: 'Create or link issues from findings and scanner tickets.',
    icon: <Kanban className="h-6 w-6" />,
    status: 'disconnected',
    comingSoon: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    slug: 'linear',
    description: 'Sync prioritized engineering work with code quality tasks.',
    icon: <ListTodo className="h-6 w-6" />,
    status: 'disconnected',
    comingSoon: true,
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    slug: 'teams',
    description: 'Notify channels when scans complete or policies fail.',
    icon: <MessageSquare className="h-6 w-6" />,
    status: 'disconnected',
    comingSoon: true,
  },
]

export function IntegrationList({
  integrations = DEFAULT_INTEGRATIONS,
  onConnect,
  onDisconnect,
  onConfigure,
  hideListHeading = false,
}: IntegrationListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'error':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4" />
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {!hideListHeading && (
        <h2 className="text-2xl font-bold text-foreground">Integrations</h2>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed">
        These are <strong className="font-medium text-foreground">connections</strong> to external products (APIs and
        OAuth). Native CodeSpectra features — scanner, interviews, leaderboard — stay in the app; integrations let you
        reuse tools your org already runs (GitHub, chat, optional SonarQube, and more on the roadmap).
      </p>

      <div className="grid gap-4">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-border/60 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {integration.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{integration.name}</h3>
                    {integration.comingSoon ? (
                      <Badge variant="secondary" className="text-xs font-normal">
                        Coming soon
                      </Badge>
                    ) : (
                      <Badge className={getStatusColor(integration.status)}>
                        {getStatusIcon(integration.status)}
                        <span className="ml-1 capitalize">{integration.status}</span>
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>

                  {integration.permissions && !integration.comingSoon && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-foreground/80">Typical setup</p>
                      <div className="flex flex-wrap gap-1">
                        {integration.permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className="text-xs font-normal">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {integration.connectedAt && (
                    <p className="mt-3 text-xs text-muted-foreground">Connected since {integration.connectedAt}</p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                {integration.comingSoon ? (
                  <Button type="button" disabled variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Connect
                  </Button>
                ) : integration.status === 'disconnected' ? (
                  <Button type="button" onClick={() => onConnect?.(integration.id)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Connect
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onConfigure?.(integration.id)}
                      className="gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Configure
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onDisconnect?.(integration.id)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
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
