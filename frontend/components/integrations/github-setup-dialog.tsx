'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Card } from '@/components/ui/card'
import { ExternalLink } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'

interface GitHubIntegrationSetupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (token: string) => void
}

export function GitHubIntegrationSetup({
  open,
  onOpenChange,
  onConfirm,
}: GitHubIntegrationSetupProps) {
  const [token, setToken] = React.useState('')

  const handleConfirm = () => {
    if (token.trim()) {
      onConfirm(token)
      setToken('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            Connect GitHub
          </DialogTitle>
          <DialogDescription>
            Add a GitHub token so CodeSpectra can scan repositories and comment on pull requests.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card className="rounded-2xl border-primary/25 bg-primary/5 p-4 shadow-none">
            <h4 className="mb-2 font-semibold text-foreground">How to get a personal access token</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to GitHub Settings → Developer Settings → Personal Access Tokens</li>
              <li>Click "Generate new token"</li>
              <li>Select these scopes: <code className="font-mono text-foreground">repo</code>, <code className="font-mono text-foreground">workflow</code>, <code className="font-mono text-foreground">read:org</code></li>
              <li>Copy the generated token</li>
              <li>Paste it below</li>
            </ol>
            <Button variant="outline" className="mt-3 gap-2" asChild>
              <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" aria-hidden />
                Open GitHub token settings
              </a>
            </Button>
          </Card>

          <div>
            <label htmlFor="github-pat" className="mb-2 block text-sm font-medium text-foreground">Personal access token</label>
            <PasswordInput
              id="github-pat"
              placeholder="ghp_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-2">
              The token is only used to talk to GitHub and is stored on the server, not in your browser.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!token.trim()}>
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import React from 'react'
