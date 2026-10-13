'use client'

import { useEffect, useState } from 'react'
import { HelpCircle, KeyRound, Plug, ShieldAlert } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GitHubIntegrationSetup } from '@/components/integrations/github-setup-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

type SecretsMap = Record<string, string | null | boolean>

interface IntegrationItem {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  connected: boolean
  credentialKey: string
}

const INTEGRATIONS: IntegrationItem[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: <Github className="h-6 w-6" />,
    description: 'Repository scanning, PR comments, and activity tracking.',
    connected: false,
    credentialKey: 'has_github_app_token',
  },
]

export default function IntegrationsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [secrets, setSecrets] = useState<SecretsMap | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then(r => r.json())
      .then(json => setSecrets(json.secrets || {}))
      .catch(() => {})
  }, [gate.ready])

  if (!gate.ready) return null

  const integrations = INTEGRATIONS.map(item => ({
    ...item,
    connected: item.credentialKey ? Boolean(secrets?.[item.credentialKey]) : false,
  }))

  const handleConfirmGitHub = async (token: string) => {
    try {
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_app_token: token }),
      })
      if (!res.ok) throw new Error('Failed to save token')
      addToast({ type: 'success', title: 'GitHub connected' })
      const r = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const json = await r.json()
      setSecrets(json.secrets || {})
    } catch {
      addToast({ type: 'error', title: 'Failed to connect GitHub' })
    }
  }

  const handleDisconnectGitHub = async () => {
    setDisconnecting(true)
    try {
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_app_token: null }),
      })
      if (!res.ok) throw new Error('Failed to remove token')
      addToast({ type: 'success', title: 'GitHub disconnected' })
      const r = await fetch('/api/admin/server-secrets', { credentials: 'include' })
      const json = await r.json()
      setSecrets(json.secrets || {})
    } catch {
      addToast({ type: 'error', title: 'Failed to disconnect GitHub' })
    } finally {
      setDisconnecting(false)
    }
  }

  const githubConnected = secrets?.['has_github_app_token'] === true

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs .5">Connect external services as optional bridges. Scanner, interviews, and dashboards are native and require no plugins.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {githubConnected && (
        <Card className="border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">GitHub token stored in server secrets</p>
              <p className="text-sm text-muted-foreground">
                A GitHub personal access token is configured. Disconnect below to remove it if the token is no longer valid.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {integrations.map(integration => (
          <Card key={integration.id} className="border-border/60 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {integration.icon}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{integration.name}</h3>
                    <Badge variant={integration.connected ? 'default' : 'secondary'} className="text-xs">
                      {integration.connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {integration.id === 'github' ? (
                  integration.connected ? (
                    <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={handleDisconnectGitHub} disabled={disconnecting}>
                      <KeyRound className="h-4 w-4" />
                      {disconnecting ? 'Removing…' : 'Disconnect'}
                    </Button>
                  ) : (
                    <Button className="gap-2" onClick={() => setGithubDialogOpen(true)}>
                      <Plug className="h-4 w-4" />
                      Connect
                    </Button>
                  )
                ) : (
                  <Button variant="outline" className="gap-2" disabled>
                    <Plug className="h-4 w-4" />
                    Connect
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <GitHubIntegrationSetup
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConfirm={handleConfirmGitHub}
      />
    </div>
  )
}


