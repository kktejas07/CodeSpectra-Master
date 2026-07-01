'use client'

import { useState } from 'react'
import { Plug } from 'lucide-react'
import { IntegrationList } from '@/components/integrations/integration-list'
import { IntegrationStatus } from '@/components/integrations/integration-status'
import { GitHubIntegrationSetup } from '@/components/integrations/github-setup-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { usePageGuard } from '@/lib/use-page-guard'

export default function IntegrationsPage() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const [githubDialogOpen, setGithubDialogOpen] = useState(false)

  const handleConnect = (integrationId: string) => {
    if (integrationId === 'github') {
      setGithubDialogOpen(true)
    }
  }

  const handleConfirmGitHub = (token: string) => {
    console.log('GitHub token received:', token)
    // TODO: Send to API to configure GitHub integration
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Integrations</h1>
            <p className="text-muted-foreground">Connect external services — product features stay in CodeSpectra.</p>
          </div>
        </div>
      </div>

      <Alert className="border-border/60 bg-muted/30">
        <Plug className="h-4 w-4" />
        <AlertTitle>Built-in vs connected</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          The scanner, interviews, and dashboards run in this platform. Third-party analysis integrations are{' '}
          <strong className="font-medium text-foreground">optional bridges</strong> so you can reuse an existing quality
          server or notify Slack — they are not separate “plugins” you install in the browser.
        </AlertDescription>
      </Alert>

      <IntegrationList hideListHeading onConnect={handleConnect} />
      <IntegrationStatus />

      <GitHubIntegrationSetup
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConfirm={handleConfirmGitHub}
      />
    </div>
  )
}
