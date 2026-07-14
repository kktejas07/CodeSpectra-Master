'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePageGuard } from '@/lib/use-page-guard'
import { Smartphone, Copy, Check, Save, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

export function MobileSettingsPage() {
  const gate = usePageGuard('superadmin')
  const { toast } = useToast() as any
  const [serverUrl, setServerUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  const defaultUrl = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '').replace(/[^\x20-\x7E]/g, '')
  const qrSrc = serverUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(serverUrl)}` : ''

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/mobile-config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setServerUrl(d.server_url || defaultUrl))
      .catch(() => setServerUrl(defaultUrl))
      .finally(() => setLoading(false))
  }, [gate.ready, defaultUrl])

  const save = async () => {
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/platform-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'mobile', value: { server_url: serverUrl.replace(/\/+$/, '') } }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast({ title: 'Server URL saved', description: 'Mobile app will use this URL on next launch', variant: 'success' })
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(serverUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }

  if (!gate.ready || loading) return null

  return (
    <div className="mx-auto max-w-lg space-y-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card"><Smartphone className="h-5 w-5 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Mobile App</h1><p className="text-sm text-muted-foreground">Configure server URL for the Expo app. This applies to all users.</p></div>
      </div>

      <Card className="p-6 border-border/60 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Server URL</label>
          <div className="flex gap-2">
            <Input value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder={defaultUrl} className="flex-1 font-mono text-sm" />
            <Button variant="outline" size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">The base URL of this server. Mobile users don&apos;t need to configure this manually.</p>
        </div>
      </Card>

      <Card className="p-8 border-border/60 flex flex-col items-center space-y-6">
        {qrSrc ? (
          <img src={qrSrc} alt="QR Code" className="rounded-2xl border-4 border-white shadow-sm" width={250} height={250} />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            Save a URL to generate QR code
          </div>
        )}
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Scan to configure</p>
          <p className="text-xs text-muted-foreground">Open the Codespectra app → tap &quot;Scan QR&quot; to auto-configure</p>
        </div>
      </Card>

      <Card className="p-5 border-border/60 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono truncate">{serverUrl || defaultUrl || '(not set)'}</code>
          <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
