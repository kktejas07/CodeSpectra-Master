'use client'
import { useConfirm } from '@/lib/confirm-context'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, Link as LinkIcon, Unlink } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Status {
  connected: boolean
  github_login?: string | null
  scope?: string
  connected_at?: string | null
}

export default function GitHubConnectButton() {
  const confirmDialog = useConfirm()
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
    if (!await confirmDialog({ title: 'Disconnect GitHub?', description: 'Disconnect your GitHub account?' })) return
    setBusy(true)
    try {
      await csrfFetch('/api/github/integrations/me', { method: 'DELETE' })
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
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> Checking GitHub connection…
      </p>
    )
  }

  return (
    <div
      className="rounded-2xl border border-border/70 bg-muted/30 p-4"
      data-testid={`github-connect-${status.connected ? 'connected' : 'disconnected'}`}
    >
      {status.connected ? (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Connected as <span className="text-primary">@{status.github_login || 'unknown'}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Scopes: <code className="font-mono">{status.scope || 'n/a'}</code>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Not connected yet. Save the GitHub OAuth app details above first, then click{' '}
            <strong className="text-foreground">Connect GitHub</strong>.
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
