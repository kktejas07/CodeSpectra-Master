'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Github, CheckCircle2, Link as LinkIcon, Unlink } from 'lucide-react'

interface Status {
  connected: boolean
  github_login?: string | null
  scope?: string
  connected_at?: string | null
}

export default function GitHubConnectButton() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/github/integrations/me', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setStatus(json as Status)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
    // Re-poll once after a redirect-back from the OAuth flow.
    const params = new URLSearchParams(window.location.search)
    if (params.get('github') === 'connected' || params.get('github') === 'error') {
      setTimeout(() => void load(), 500)
    }
  }, [])

  async function disconnect() {
    if (!confirm('Disconnect your GitHub account?')) return
    setBusy(true)
    try {
      await fetch('/api/github/integrations/me', { method: 'DELETE' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  function connect() {
    setBusy(true)
    window.location.href = `/api/github/oauth/start?redirect=${encodeURIComponent('/dashboard/admin/settings')}`
  }

  if (!status) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="github-connect-loading">
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Checking GitHub connection…
      </p>
    )
  }

  return (
    <div
      className="rounded-md border border-border/60 bg-muted/30 p-3"
      data-testid={`github-connect-${status.connected ? 'connected' : 'disconnected'}`}
    >
      {status.connected ? (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Connected as <span className="text-primary">@{status.github_login || 'unknown'}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Scopes: <code>{status.scope || 'n/a'}</code>
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={disconnect}
            disabled={busy}
            data-testid="github-disconnect-btn"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
            <span className="ml-1">Disconnect</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Not connected. The OAuth App credentials above must be saved before
            clicking <strong>Connect</strong>.
          </p>
          <Button onClick={connect} disabled={busy} data-testid="github-connect-btn">
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Github className="mr-1 h-3 w-3" />
            )}
            Connect GitHub <LinkIcon className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
