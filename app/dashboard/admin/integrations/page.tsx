'use client'

import { useState } from 'react'
import { Plug } from 'lucide-react'
import { IntegrationList } from '@/components/integrations/integration-list'
import { IntegrationStatus } from '@/components/integrations/integration-status'
import { GitHubIntegrationSetup } from '@/components/integrations/github-setup-dialog'

export default function IntegrationsPage() {
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
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Plug className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Integrations</h1>
            <p className="text-muted-foreground">Manage external service connections</p>
          </div>
        </div>
      </div>

      <IntegrationList onConnect={handleConnect} />
      <IntegrationStatus />

      <GitHubIntegrationSetup
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConfirm={handleConfirmGitHub}
      />
    </div>
  )
}
