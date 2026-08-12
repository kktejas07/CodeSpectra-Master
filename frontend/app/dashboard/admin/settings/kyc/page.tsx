'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Key, Webhook, Shield, CheckCircle2, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface KycSettings {
  didit_api_key: string
  didit_webhook_secret: string
  didit_workflow_id: string
  digilocker_client_id: string
  digilocker_client_secret: string
  apisetu_client_id: string
  apisetu_client_secret: string
}

export default function KycSettingsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [settings, setSettings] = useState<KycSettings>({
    didit_api_key: '',
    didit_webhook_secret: '',
    didit_workflow_id: '',
    digilocker_client_id: '',
    digilocker_client_secret: '',
    apisetu_client_id: '',
    apisetu_client_secret: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({
    didit: 'idle',
    digilocker: 'idle',
    apisetu: 'idle',
  })

  useEffect(() => {
    void fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      const res = await csrfFetch('/api/admin/settings/kyc', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as KycSettings
        setSettings(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/settings/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Settings saved' })
      } else {
        addToast({ type: 'error', title: 'Failed to save settings' })
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection(provider: string) {
    setTestStatus(prev => ({ ...prev, [provider]: 'testing' }))
    try {
      const res = await csrfFetch(`/api/admin/settings/kyc/test?provider=${provider}`, { credentials: 'include' })
      const data = await res.json() as { success: boolean; error?: string }
      setTestStatus(prev => ({ ...prev, [provider]: data.success ? 'success' : 'error' }))
      if (data.success) {
        addToast({ type: 'success', title: `${provider} connection successful` })
      } else {
        addToast({ type: 'error', title: `${provider} connection failed: ${data.error}` })
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [provider]: 'error' }))
      addToast({ type: 'error', title: `Failed to test ${provider}` })
    }
  }

  if (!gate.ready || loading) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">KYC Provider Settings</h1>
          <p className="text-muted-foreground text-sm">Configure identity verification providers</p>
        </div>
      </div>

      <Tabs defaultValue="didit">
        <TabsList>
          <TabsTrigger value="didit">Didit (Global)</TabsTrigger>
          <TabsTrigger value="digilocker">DigiLocker (India)</TabsTrigger>
          <TabsTrigger value="apisetu">API Setu (India)</TabsTrigger>
        </TabsList>

        {/* Didit Settings */}
        <TabsContent value="didit">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Didit</h2>
                <Badge variant="outline" className="text-xs">500 free/month</Badge>
              </div>
              <div className="flex items-center gap-2">
                {testStatus.didit === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {testStatus.didit === 'error' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                <Button size="sm" variant="outline" onClick={() => testConnection('didit')} disabled={testStatus.didit === 'testing'}>
                  {testStatus.didit === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Global KYC provider. Free 500 verifications/month. ID verification, liveness, face match, IP analysis.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <PasswordInput value={settings.didit_api_key} onChange={e => setSettings({...settings, didit_api_key: e.target.value})} placeholder="XqAc-..." />
              </div>
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <PasswordInput value={settings.didit_webhook_secret} onChange={e => setSettings({...settings, didit_webhook_secret: e.target.value})} placeholder="MK46N..." />
              </div>
              <div className="space-y-2">
                <Label>Workflow ID</Label>
                <Input value={settings.didit_workflow_id} onChange={e => setSettings({...settings, didit_workflow_id: e.target.value})} placeholder="b4c4c9b0-..." />
              </div>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input value="https://codespectra.ai/api/kyc/didit/webhook" disabled className="bg-muted" />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <strong>Setup:</strong> Sign up at <a href="https://business.didit.me" target="_blank" className="text-primary underline">business.didit.me</a> (no credit card). Get API key from Settings → API Keys. Create workflow with ID_VERIFICATION, LIVENESS, FACE_MATCH, IP_ANALYSIS.
            </div>
          </Card>
        </TabsContent>

        {/* DigiLocker Settings */}
        <TabsContent value="digilocker">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">DigiLocker</h2>
                <Badge variant="outline" className="text-xs">Free (Gov India)</Badge>
              </div>
              <div className="flex items-center gap-2">
                {testStatus.digilocker === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {testStatus.digilocker === 'error' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                <Button size="sm" variant="outline" onClick={() => testConnection('digilocker')} disabled={testStatus.digilocker === 'testing'}>
                  {testStatus.digilocker === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Indian government document verification. Free, unlimited. Aadhaar, PAN, Driving License, etc.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <PasswordInput value={settings.digilocker_client_id} onChange={e => setSettings({...settings, digilocker_client_id: e.target.value})} placeholder="Your client ID" />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <PasswordInput value={settings.digilocker_client_secret} onChange={e => setSettings({...settings, digilocker_client_secret: e.target.value})} placeholder="Your client secret" />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <strong>Setup:</strong> Register as Requester at <a href="https://partners.apisetu.gov.in/signup" target="_blank" className="text-primary underline">partners.apisetu.gov.in</a>. Wait for approval (2-3 days). Get credentials from dashboard.
            </div>
          </Card>
        </TabsContent>

        {/* API Setu Settings */}
        <TabsContent value="apisetu">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">API Setu</h2>
                <Badge variant="outline" className="text-xs">Free (Gov India)</Badge>
              </div>
              <div className="flex items-center gap-2">
                {testStatus.apisetu === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                {testStatus.apisetu === 'error' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                <Button size="sm" variant="outline" onClick={() => testConnection('apisetu')} disabled={testStatus.apisetu === 'testing'}>
                  {testStatus.apisetu === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Indian government API platform. Access to various government APIs including DigiLocker, education verification, etc.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <PasswordInput value={settings.apisetu_client_id} onChange={e => setSettings({...settings, apisetu_client_id: e.target.value})} placeholder="Your client ID" />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <PasswordInput value={settings.apisetu_client_secret} onChange={e => setSettings({...settings, apisetu_client_secret: e.target.value})} placeholder="Your client secret" />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <strong>Setup:</strong> Register at <a href="https://partners.apisetu.gov.in/signup" target="_blank" className="text-primary underline">partners.apisetu.gov.in</a>. Same credentials as DigiLocker.
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
