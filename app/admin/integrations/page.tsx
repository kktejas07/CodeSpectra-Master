'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExternalLink, CheckCircle, AlertCircle, Github, MessageCircle, BarChart3, Mail, Calendar, CreditCard } from 'lucide-react'
import { useToast } from '@/lib/toast-context'

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
  const router = useRouter()
  const toast = useToast()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  const availableIntegrations = [
    {
      provider: 'github',
      name: 'GitHub',
      description: 'Connect GitHub repositories for code analysis',
      icon: Github,
      category: 'Development',
      required: true
    },
    {
      provider: 'slack',
      name: 'Slack',
      description: 'Send notifications and updates to Slack channels',
      icon: MessageCircle,
      category: 'Communication',
      required: false
    },
    {
      provider: 'sonarqube',
      name: 'SonarQube',
      description: 'Integrate with SonarQube for code quality analysis',
      icon: BarChart3,
      category: 'Development',
      required: false
    },
    {
      provider: 'gmail',
      name: 'Gmail',
      description: 'Send email notifications through Gmail',
      icon: Mail,
      category: 'Communication',
      required: false
    },
    {
      provider: 'calendar',
      name: 'Google Calendar',
      description: 'Schedule events and manage exam dates',
      icon: Calendar,
      category: 'Productivity',
      required: false
    },
    {
      provider: 'stripe',
      name: 'Stripe',
      description: 'Payment processing and billing',
      icon: CreditCard,
      category: 'Payments',
      required: false
    }
  ]

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/integrations')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setIntegrations(data)
    } catch (error) {
      console.error('[v0] Failed to fetch integrations:', error)
      toast({
        type: 'error',
        title: 'Failed to load integrations',
        message: String(error),
      })
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

  const handleDisconnect = async (integrationId: string, provider: string) => {
    try {
      const res = await fetch(`/api/integrations/${integrationId}/disconnect`, { 
        method: 'POST' 
      })
      if (!res.ok) throw new Error('Failed to disconnect')
      toast({
        type: 'success',
        title: 'Disconnected',
        message: `${provider} has been disconnected.`,
      })
      fetchIntegrations()
    } catch (error) {
      console.error('[v0] Failed to disconnect:', error)
      toast({
        type: 'error',
        title: 'Failed to disconnect',
        message: String(error),
      })
    }
  }

  const categories = Array.from(new Set(availableIntegrations.map(i => i.category)))
  const requiredIntegrations = availableIntegrations.filter(i => i.required)
  const optionalIntegrations = availableIntegrations.filter(i => !i.required)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Integrations</h1>
        <p className="text-foreground/60">Connect external services and tools to enhance your workflow</p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Connected Integrations</p>
              <p className="text-3xl font-bold mt-2">{integrations.filter(i => i.isActive).length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Total Available</p>
              <p className="text-3xl font-bold mt-2">{availableIntegrations.length}</p>
            </div>
            <ExternalLink className="w-8 h-8 text-primary" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Required</p>
              <p className="text-3xl font-bold mt-2">{requiredIntegrations.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
        </Card>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <p className="text-foreground/60">Loading integrations...</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Required Integrations */}
          {requiredIntegrations.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                Required Integrations
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {requiredIntegrations.map((integration) => {
                  const connected = isConnected(integration.provider)
                  const IntegrationIcon = integration.icon
                  return (
                    <Card key={integration.provider} className="p-6 flex flex-col border-yellow-500/30">
                      <div className="flex items-start justify-between mb-4">
                        <IntegrationIcon className="w-8 h-8 text-yellow-600" />
                        {connected ? (
                          <Badge className="bg-green-500/20 text-green-700">Connected</Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-700">Required</Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold mb-1">{integration.name}</h3>
                      <p className="text-sm text-foreground/60 mb-4 flex-1">
                        {integration.description}
                      </p>
                      <Button
                        onClick={() => connected ? 
                          handleDisconnect(integrations.find(i => i.provider === integration.provider)?.id || '', integration.name) 
                          : handleConnect(integration.provider)}
                        variant={connected ? 'destructive' : 'default'}
                        className="w-full"
                      >
                        {connected ? 'Disconnect' : 'Connect'}
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Optional Integrations by Category */}
          {optionalIntegrations.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Optional Integrations</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {optionalIntegrations.map((integration) => {
                  const connected = isConnected(integration.provider)
                  const IntegrationIcon = integration.icon
                  return (
                    <Card key={integration.provider} className="p-6 flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <IntegrationIcon className="w-8 h-8 text-primary" />
                        {connected ? (
                          <Badge variant="success">Connected</Badge>
                        ) : (
                          <Badge variant="outline">Disconnected</Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold mb-1">{integration.name}</h3>
                      <p className="text-sm text-foreground/60 mb-4 flex-1">
                        {integration.description}
                      </p>
                      <Button
                        onClick={() => connected ? 
                          handleDisconnect(integrations.find(i => i.provider === integration.provider)?.id || '', integration.name) 
                          : handleConnect(integration.provider)}
                        variant={connected ? 'outline' : 'default'}
                        className="w-full"
                      >
                        {connected ? 'Disconnect' : 'Connect'}
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <Card className="p-6 bg-foreground/5">
        <h3 className="font-semibold mb-2">Integration Help</h3>
        <p className="text-sm text-foreground/60">
          Need help setting up an integration? Check our documentation or contact support. All integrations use OAuth 2.0 for secure authentication.
        </p>
      </Card>
    </div>
  )
}
