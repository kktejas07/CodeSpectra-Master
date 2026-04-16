'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'

interface Integration {
  id: string
  provider: string
  name: string
  description: string
  isActive: boolean
  connectedAt?: string
  lastUsedAt?: string
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  const availableIntegrations = [
    {
      provider: 'github',
      name: 'GitHub',
      description: 'Connect GitHub repositories for code analysis',
      icon: '🐙'
    },
    {
      provider: 'slack',
      name: 'Slack',
      description: 'Send notifications and updates to Slack channels',
      icon: '💬'
    },
    {
      provider: 'sonarqube',
      name: 'SonarQube',
      description: 'Integrate with SonarQube for code quality analysis',
      icon: '📊'
    },
    {
      provider: 'gmail',
      name: 'Gmail',
      description: 'Send email notifications through Gmail',
      icon: '📧'
    },
    {
      provider: 'calendar',
      name: 'Google Calendar',
      description: 'Schedule events and manage exam dates',
      icon: '📅'
    },
    {
      provider: 'stripe',
      name: 'Stripe',
      description: 'Payment processing and billing',
      icon: '💳'
    }
  ]

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/integrations')
      const data = await res.json()
      setIntegrations(data)
    } catch (error) {
      console.error('Failed to fetch integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const isConnected = (provider: string) => {
    return integrations.some(i => i.provider === provider && i.isActive)
  }

  const handleConnect = async (provider: string) => {
    window.location.href = `/api/integrations/${provider}/connect`
  }

  const handleDisconnect = async (integrationId: string) => {
    try {
      await fetch(`/api/integrations/${integrationId}/disconnect`, { method: 'POST' })
      fetchIntegrations()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect external services and tools</p>
      </div>

      {loading ? (
        <Card className="p-6 text-center">Loading integrations...</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {availableIntegrations.map((integration) => {
            const connected = isConnected(integration.provider)
            return (
              <Card key={integration.provider} className="p-6 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{integration.icon}</div>
                  {connected ? (
                    <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-1">{integration.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">
                  {integration.description}
                </p>
                <div className="flex gap-2">
                  {connected ? (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const int = integrations.find(i => i.provider === integration.provider)
                        if (int) handleDisconnect(int.id)
                      }}
                      className="w-full"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect(integration.provider)}
                      className="w-full"
                    >
                      Connect
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
