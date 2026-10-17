'use client'

import { useEffect, useState } from 'react'
import { HelpCircle, KeyRound, Plug, ShieldAlert } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GitHubIntegrationSetup } from '@/components/integrations/github-setup-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'

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
      <PageHeader
        title={
          <>
            Integrations
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About integrations" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Connect outside services if you need them. The scanner, interviews and dashboards are built in and need no plugins.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Optional connections to outside services."
        icon={<Plug />}
      />

      {githubConnected && (
        <Panel className="border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">A GitHub token is saved on the server</p>
              <p className="text-sm text-muted-foreground">
                A GitHub personal access token is configured. Disconnect below to remove it if the token is no longer valid.
              </p>
            </div>
          </div>
        </Panel>
      )}

      <div className="space-y-4">
        {integrations.map(integration => (
          <Panel key={integration.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  {integration.icon}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{integration.name}</h3>
                    <Badge variant={integration.connected ? 'default' : 'secondary'} className="text-xs">
                      {integration.connected ? 'Connected' : 'Not connected'}
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
          </Panel>
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


