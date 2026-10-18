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
  didit_sandbox_api_key: string
  didit_webhook_secret: string
  didit_workflow_id: string
  digilocker_client_id: string
  digilocker_client_secret: string
  apisetu_client_id: string
  apisetu_client_secret: string
  /** Which provider powers /dashboard/identity-verify */
  identity_kyc: 'didit' | 'digilocker' | 'off'
  /** Exam / proctoring Aadhaar gate */
  exam_aadhaar: 'anon_aadhaar' | 'ocr_face' | 'off'
  /** Profile privacy Aadhaar badge */
  profile_aadhaar: 'anon_aadhaar' | 'off'
  anon_aadhaar_test_mode: boolean
  anon_aadhaar_nullifier_seed: string
}

export function KycSettingsSection() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [settings, setSettings] = useState<KycSettings>({
    didit_api_key: '',
    didit_sandbox_api_key: '',
    didit_webhook_secret: '',
    didit_workflow_id: '',
    digilocker_client_id: '',
    digilocker_client_secret: '',
    apisetu_client_id: '',
    apisetu_client_secret: '',
    identity_kyc: 'didit',
    exam_aadhaar: 'off',
    profile_aadhaar: 'anon_aadhaar',
    anon_aadhaar_test_mode: true,
    anon_aadhaar_nullifier_seed: '314159265358979',
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
        const data = await res.json() as Partial<KycSettings>
        // Merge so missing purpose keys keep defaults (old saved docs)
        setSettings((prev) => ({ ...prev, ...data }))
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
          <h1 className="text-3xl font-bold text-foreground">KYC provider settings</h1>
          <p className="text-muted-foreground text-sm">Configure identity verification providers</p>
        </div>
      </div>

      <Tabs defaultValue="routing">
        <TabsList>
          <TabsTrigger value="routing">Purpose routing</TabsTrigger>
          <TabsTrigger value="didit">Didit (Global)</TabsTrigger>
          <TabsTrigger value="digilocker">DigiLocker (India)</TabsTrigger>
          <TabsTrigger value="apisetu">API Setu (India)</TabsTrigger>
          <TabsTrigger value="anon">Anon Aadhaar</TabsTrigger>
        </TabsList>

        <TabsContent value="routing">
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Where each provider is used</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Switch providers without rewriting pages. Identity KYC ≠ exam Aadhaar.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Identity verification page</Label>
                <select aria-label="Identity verification page"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={settings.identity_kyc}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      identity_kyc: e.target.value as KycSettings['identity_kyc'],
                    })
                  }
                >
                  <option value="didit">Didit (full KYC)</option>
                  <option value="digilocker">DigiLocker (when wired)</option>
                  <option value="off">Off</option>
                </select>
                <p className="text-[11px] text-muted-foreground">/dashboard/identity-verify</p>
              </div>
              <div className="space-y-2">
                <Label>Exam / proctoring Aadhaar</Label>
                <select aria-label="Exam / proctoring Aadhaar"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={settings.exam_aadhaar}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      exam_aadhaar: e.target.value as KycSettings['exam_aadhaar'],
                    })
                  }
                >
                  <option value="off">Off (default)</option>
                  <option value="anon_aadhaar">Anon Aadhaar proof</option>
                  <option value="ocr_face">ID card photo + live selfie</option>
                </select>
                <p className="text-[11px] text-muted-foreground" aria-live="polite">
                  {settings.exam_aadhaar === 'off'
                    ? 'No extra Aadhaar step. Each exam’s own ID and face settings still apply.'
                    : settings.exam_aadhaar === 'anon_aadhaar'
                      ? 'Candidates prove they hold a valid Aadhaar with a privacy-preserving proof before the exam. No card image is stored.'
                      : 'No provider is connected for this yet, so candidates would see “not available” and could not continue. Pick another option.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Profile Aadhaar badge</Label>
                <select aria-label="Profile Aadhaar badge"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={settings.profile_aadhaar}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      profile_aadhaar: e.target.value as KycSettings['profile_aadhaar'],
                    })
                  }
                >
                  <option value="anon_aadhaar">Anon Aadhaar</option>
                  <option value="off">Off</option>
                </select>
                <p className="text-[11px] text-muted-foreground">Privacy-preserving proof</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Didit Settings */}
        <TabsContent value="didit">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Didit</h2>
                <Badge variant="outline" className="text-xs">500 free/month</Badge>
              </div>
              <div className="flex items-center gap-2">
                {testStatus.didit === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
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
                <Label>API Key (Production)</Label>
                <PasswordInput value={settings.didit_api_key} onChange={e => setSettings({...settings, didit_api_key: e.target.value})} placeholder="XqAc-..." />
              </div>
              <div className="space-y-2">
                <Label>API Key (Sandbox/Testing)</Label>
                <PasswordInput value={settings.didit_sandbox_api_key || ''} onChange={e => setSettings({...settings, didit_sandbox_api_key: e.target.value})} placeholder="1PYQw..." />
                <p className="text-xs text-muted-foreground">Sandbox sessions don't count toward free quota</p>
              </div>
              <div className="space-y-2">
                <Label>Webhook secret</Label>
                <PasswordInput value={settings.didit_webhook_secret} onChange={e => setSettings({...settings, didit_webhook_secret: e.target.value})} placeholder="MK46N..." />
              </div>
              <div className="space-y-2">
                <Label>Workflow ID</Label>
                <Input aria-label="Workflow ID" value={settings.didit_workflow_id} onChange={e => setSettings({...settings, didit_workflow_id: e.target.value})} placeholder="b4c4c9b0-..." />
              </div>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input aria-label="Webhook URL" value="https://codespectra.ai/api/kyc/didit/webhook" disabled className="bg-muted" />
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
                {testStatus.digilocker === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
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
                <Label>Client secret</Label>
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
                {testStatus.apisetu === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
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
                <Label>Client secret</Label>
                <PasswordInput value={settings.apisetu_client_secret} onChange={e => setSettings({...settings, apisetu_client_secret: e.target.value})} placeholder="Your client secret" />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <strong>Setup:</strong> Register at <a href="https://partners.apisetu.gov.in/signup" target="_blank" className="text-primary underline">partners.apisetu.gov.in</a>. Same credentials as DigiLocker.
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="anon">
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Anon Aadhaar (ZK)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Privacy-preserving Aadhaar proof for exams/profile. Free protocol; uses your nullifier seed.
                Does not replace Didit/DigiLocker for full KYC.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <Label>Test mode (UIDAI test artifacts)</Label>
                <p className="text-[11px] text-muted-foreground">Turn off only for production QR codes</p>
              </div>
              <input
                type="checkbox"
                checked={settings.anon_aadhaar_test_mode}
                onChange={(e) => setSettings({ ...settings, anon_aadhaar_test_mode: e.target.checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nullifier seed (numeric)</Label>
              <Input aria-label="Nullifier seed (numeric)"
                value={settings.anon_aadhaar_nullifier_seed}
                onChange={(e) => setSettings({ ...settings, anon_aadhaar_nullifier_seed: e.target.value.replace(/\D/g, '') })}
                placeholder="314159265358979"
              />
              <p className="text-[11px] text-muted-foreground">
                Keep stable so the same Aadhaar maps to the same nullifier. Changing it invalidates old links.
              </p>
            </div>
          </Card>
        </TabsContent>

      </Tabs>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </div>
  )
}
