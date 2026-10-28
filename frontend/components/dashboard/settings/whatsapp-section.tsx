'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessageCircle, Eye, EyeOff, Save, Wifi } from 'lucide-react'
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
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

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

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await csrfFetch('/api/admin/whatsapp/test-connection', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setTestResult({
          ok: true,
          message: data.sessionStatus === 'ready'
            ? `Connected to OpenWA gateway. Session "${data.sessionName}" is ready${data.phone ? ` (${data.phone})` : ''}. You can send WhatsApp messages.`
            : `Gateway reachable, but session "${data.sessionId}" is ${data.sessionStatus}. Link it in the OpenWA dashboard first.`,
        })
      } else {
        setTestResult({ ok: false, message: data.error || 'Connection test failed' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Could not reach the connection-test endpoint' })
    } finally { setTesting(false) }
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
          <h3 className="text-base font-semibold text-foreground">WhatsApp (OpenWA)</h3>
          {isConfigured && <Badge variant="success" className="text-[10px]">Configured</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect an OpenWA gateway to send WhatsApp notifications, newsletter campaigns, and alerts.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid gap-2">
          <Label>OpenWA Base URL</Label>
          <Input aria-label="OpenWA Base URL"
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
              <Button variant="outline" size="sm" onClick={handleRevealKey} aria-label="Reveal saved API key">
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowApiKey(!showApiKey)} aria-label={showApiKey ? 'Hide API key' : 'Show API key'}>
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Session ID</Label>
          <Input aria-label="Session ID"
            value={config.openwa_session_id}
            onChange={e => setConfig(c => ({ ...c, openwa_session_id: e.target.value }))}
            placeholder="your-whatsapp-session"
          />
          <p className="text-xs text-muted-foreground">The WhatsApp session ID from your OpenWA instance</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Default country code</Label>
            <Input aria-label="Default country code"
              value={config.openwa_default_country_code}
              onChange={e => setConfig(c => ({ ...c, openwa_default_country_code: e.target.value }))}
              placeholder="91"
            />
            <p className="text-xs text-muted-foreground">e.g. 91 for India</p>
          </div>
          <div className="grid gap-2">
            <Label>Max concurrency</Label>
            <Input aria-label="Max concurrency"
              value={config.openwa_max_concurrency}
              onChange={e => setConfig(c => ({ ...c, openwa_max_concurrency: e.target.value }))}
              placeholder="3"
            />
          </div>
          <div className="grid gap-2">
            <Label>Send delay (ms)</Label>
            <Input aria-label="Send delay (ms)"
              value={config.openwa_send_delay_ms}
              onChange={e => setConfig(c => ({ ...c, openwa_send_delay_ms: e.target.value }))}
              placeholder="400"
            />
          </div>
        </div>
        <div className="flex justify-end pt-2 gap-2 flex-wrap">
          <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save WhatsApp Settings
          </Button>
        </div>
        {testResult ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              testResult.ok
                ? 'border-green-500/30 bg-green-500/10 text-green-600'
                : 'border-red-500/30 bg-red-500/10 text-red-600'
            }`}
          >
            {testResult.message}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
