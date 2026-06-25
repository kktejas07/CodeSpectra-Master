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
import { Card } from '@/components/ui/card'
import { Github, ExternalLink } from 'lucide-react'

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
            Authenticate with GitHub to enable repository scanning and automatic analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card className="p-4 bg-blue-500/10 border-blue-500/30">
            <h4 className="font-semibold text-foreground mb-2">How to get your Personal Access Token:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to GitHub Settings → Developer Settings → Personal Access Tokens</li>
              <li>Click "Generate new token"</li>
              <li>Select these scopes: repo, workflow, read:org</li>
              <li>Copy the generated token</li>
              <li>Paste it below</li>
            </ol>
            <Button variant="outline" className="mt-3 gap-2" asChild>
              <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                Open GitHub Token Settings
              </a>
            </Button>
          </Card>

          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Personal Access Token</label>
            <Input
              type="password"
              placeholder="ghp_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Your token is only used to authenticate with GitHub and will be securely stored
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
