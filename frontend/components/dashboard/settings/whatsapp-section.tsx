'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessageCircle, Eye, EyeOff, Save } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface WhatsAppConfig {
  openwa_base_url: string
  openwa_api_key: string
  openwa_session_id: string
  openwa_default_country_code: string
  openwa_max_concurrency: string
  openwa_send_delay_ms: string
}

export function WhatsAppSettingsSection() {
  const addToast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [config, setConfig] = useState<WhatsAppConfig>({
    openwa_base_url: '',
    openwa_api_key: '',
    openwa_session_id: '',
    openwa_default_country_code: '91',
    openwa_max_concurrency: '3',
    openwa_send_delay_ms: '400',
  })
  const [maskedApiKey, setMaskedApiKey] = useState<string | null>(null)
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/server-secrets', { credentials: 'include' })
        const data = await res.json()
        const s = data.secrets || {}
        setConfig({
          openwa_base_url: s.openwa_base_url || '',
          openwa_api_key: '',
          openwa_session_id: s.openwa_session_id || '',
          openwa_default_country_code: s.openwa_default_country_code || '91',
          openwa_max_concurrency: s.openwa_max_concurrency || '3',
          openwa_send_delay_ms: s.openwa_send_delay_ms || '400',
        })
        setHasStoredApiKey(Boolean(s.has_openwa_api_key))
        if (s.openwa_api_key_masked) {
          setMaskedApiKey(s.openwa_api_key_masked)
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const handleRevealKey = async () => {
    try {
      const res = await fetch('/api/admin/server-secrets/reveal?key=openwa_api_key', { credentials: 'include' })
      const data = await res.json()
      if (data.value) {
        setConfig(c => ({ ...c, openwa_api_key: data.value }))
        setMaskedApiKey(null)
      }
    } catch { /* ignore */ }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, string> = {
        openwa_base_url: config.openwa_base_url,
        openwa_session_id: config.openwa_session_id,
        openwa_default_country_code: config.openwa_default_country_code,
        openwa_max_concurrency: config.openwa_max_concurrency,
        openwa_send_delay_ms: config.openwa_send_delay_ms,
      }
      // Only send api key if user typed a new one (not masked)
      if (config.openwa_api_key && !config.openwa_api_key.includes('•')) {
        payload.openwa_api_key = config.openwa_api_key
      }
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: 'WhatsApp settings saved' })
    } catch {
      addToast({ type: 'error', title: 'Failed to save' })
    } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  const isConfigured = !!(
    config.openwa_base_url.trim() &&
    config.openwa_session_id.trim() &&
    (hasStoredApiKey || maskedApiKey || config.openwa_api_key)
  )

  return (
    <Card className="rounded-xl border-border/60 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">WhatsApp (OpenWA)</h3>
          {isConfigured && <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px]">Configured</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect an OpenWA gateway to send WhatsApp notifications, newsletter campaigns, and alerts.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid gap-2">
          <Label>OpenWA Base URL</Label>
          <Input
            value={config.openwa_base_url}
            onChange={e => setConfig(c => ({ ...c, openwa_base_url: e.target.value }))}
            placeholder="https://your-openwa-server.com"
          />
          <p className="text-xs text-muted-foreground">The URL of your OpenWA gateway (no trailing slash)</p>
        </div>
        <div className="grid gap-2">
          <Label>API Key</Label>
          <div className="flex gap-2">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={config.openwa_api_key || maskedApiKey || ''}
              onChange={e => setConfig(c => ({ ...c, openwa_api_key: e.target.value }))}
              placeholder={maskedApiKey ? '••••••••' : 'Enter API key'}
              className="flex-1"
            />
            {maskedApiKey && !config.openwa_api_key && (
              <Button variant="outline" size="sm" onClick={handleRevealKey}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowApiKey(!showApiKey)}>
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Session ID</Label>
          <Input
            value={config.openwa_session_id}
            onChange={e => setConfig(c => ({ ...c, openwa_session_id: e.target.value }))}
            placeholder="your-whatsapp-session"
          />
          <p className="text-xs text-muted-foreground">The WhatsApp session ID from your OpenWA instance</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label>Default Country Code</Label>
            <Input
              value={config.openwa_default_country_code}
              onChange={e => setConfig(c => ({ ...c, openwa_default_country_code: e.target.value }))}
              placeholder="91"
            />
            <p className="text-xs text-muted-foreground">e.g. 91 for India</p>
          </div>
          <div className="grid gap-2">
            <Label>Max Concurrency</Label>
            <Input
              value={config.openwa_max_concurrency}
              onChange={e => setConfig(c => ({ ...c, openwa_max_concurrency: e.target.value }))}
              placeholder="3"
            />
          </div>
          <div className="grid gap-2">
            <Label>Send Delay (ms)</Label>
            <Input
              value={config.openwa_send_delay_ms}
              onChange={e => setConfig(c => ({ ...c, openwa_send_delay_ms: e.target.value }))}
              placeholder="400"
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save WhatsApp Settings
          </Button>
        </div>
      </div>
    </Card>
  )
}
