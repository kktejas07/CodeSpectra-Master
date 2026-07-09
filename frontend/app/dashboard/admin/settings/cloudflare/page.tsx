'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Globe2, Eye, EyeOff } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'

export default function CloudflareSettingsPage() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [zoneId, setZoneId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [savedZoneId, setSavedZoneId] = useState('')
  const [hasSavedToken, setHasSavedToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showToken, setShowToken] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setSavedZoneId(d.cloudflare_zone_id || '')
        setHasSavedToken(!!d.has_cloudflare_api_token)
        setZoneId(d.cloudflare_zone_id || '')
      })
      .catch(() => setMessage({ type: 'error', text: 'Failed to load current settings' }))
      .finally(() => setLoading(false))
  }, [gate.ready])

  const save = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const body: Record<string, string> = {}
      if (zoneId.trim()) body.cloudflare_zone_id = zoneId.trim()
      if (apiToken.trim()) body.cloudflare_api_token = apiToken.trim()

      const res = await fetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')

      setSavedZoneId(zoneId.trim())
      if (apiToken.trim()) setHasSavedToken(true)
      setApiToken('')
      setMessage({ type: 'success', text: 'Cloudflare settings saved. Cache purge is now available.' })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [zoneId, apiToken])

  if (!gate.ready || loading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card">
          <Globe2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cloudflare</h1>
          <p className="text-sm text-muted-foreground">CDN cache purge &amp; analytics integration</p>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg border p-4 text-sm ${message.type === 'success' ? 'border-green-500/20 bg-green-500/5 text-green-600' : 'border-red-500/20 bg-red-500/5 text-red-500'}`}>
          {message.text}
        </div>
      )}

      <Card className="space-y-5 border-border/60 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="cf_zone_id">Zone ID</Label>
          <input
            id="cf_zone_id"
            type="text"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={savedZoneId ? `Current: ${savedZoneId}` : 'Cloudflare Zone ID'}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cf_api_token">API Token</Label>
          <div className="relative">
            <input
              id="cf_api_token"
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={hasSavedToken ? 'Token saved — enter new value to replace' : 'cf-api-token-...'}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Token needs <code className="rounded bg-muted px-1">cache:purge</code> and <code className="rounded bg-muted px-1">zone:read</code> permissions.
          </p>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 border-dashed border-muted-foreground/30 p-6">
        <h2 className="text-sm font-semibold">How to get your credentials</h2>
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>1. Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cloudflare Dashboard</a></li>
          <li>2. Copy <strong>Zone ID</strong> from the Overview page (right sidebar)</li>
          <li>3. Create an API token: My Profile → API Tokens → Create Custom Token</li>
          <li>4. Add permissions: <strong>Zone → Cache → Purge</strong> and <strong>Zone → Zone → Read</strong></li>
          <li>5. Scope to your domain, create, and paste the token above</li>
        </ol>
        <p className="text-xs text-muted-foreground pt-2">
          Once configured, use the <a href="/dashboard/admin/cdn" className="text-primary hover:underline">CDN Management</a> page to purge cache.
        </p>
      </Card>
    </div>
  )
}
