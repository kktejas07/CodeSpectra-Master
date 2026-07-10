'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { LLM_PROVIDERS, getProviderDefaults, type LLMConfig, type LLMProviderId } from '@/lib/llm-config'
import { Save, Loader2, Sparkles, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

export default function LlmConfigPage() {
  const gate = usePageGuard('superadmin')
  const toast = useToast()
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [draft, setDraft] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/llm-config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setConfig(d.config); setDraft(d.config) })
      .catch(() => toast({ type: 'error', title: 'Failed to load config' }))
      .finally(() => setLoading(false))
  }, [gate.ready])

  function updateField<K extends keyof LLMConfig>(key: K, value: LLMConfig[K]) {
    if (!draft) return
    const next = { ...draft, [key]: value }
    if (key === 'provider') {
      const defs = getProviderDefaults(value as LLMProviderId)
      if (defs) {
        next.model = defs.models[0] || next.model
        next.endpoint = defs.endpoint
        next.api_key = ''
      }
      setFetchedModels(null)
    }
    setDraft(next)
    setTestResult(null)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/llm-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setConfig({ ...draft })
      toast({ type: 'success', title: 'LLM config saved' })
    } catch (e) {
      toast({ type: 'error', title: 'Save failed', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!draft) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/llm-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      setTestResult({ ok: json.ok, message: json.message || (json.ok ? 'Connection successful' : 'Connection failed') })
    } catch {
      setTestResult({ ok: false, message: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }

  async function refreshModels() {
    if (!draft?.api_key || !draft?.endpoint) {
      toast({ type: 'error', title: 'API key and endpoint required to fetch models' })
      return
    }
    setFetchingModels(true)
    try {
      const prov = draft.provider
      const ep = draft.endpoint.replace(/\/+$/, '')
      let models: string[] = []
      if (prov === 'gemini') {
        const res = await fetch(`${ep}/models?key=${draft.api_key}`)
        if (!res.ok) throw new Error(`Gemini API ${res.status}`)
        const json = await res.json()
        models = (json.models || []).map((m: { name: string }) => m.name.replace(/^models\//, ''))
      } else if (prov === 'anthropic') {
        const res = await fetch(`${ep}/v1/models`, {
          headers: { 'x-api-key': draft.api_key, 'anthropic-version': '2023-06-01' },
        })
        if (!res.ok) throw new Error(`Anthropic API ${res.status}`)
        const json = await res.json()
        models = (json.data || []).map((m: { id: string }) => m.id)
      } else {
        const res = await fetch(`${ep}/models`, {
          headers: { Authorization: `Bearer ${draft.api_key}` },
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        models = (json.data || []).map((m: { id: string }) => m.id)
      }
      setFetchedModels(models)
      toast({ type: 'success', title: `Loaded ${models.length} models` })
    } catch (e) {
      toast({ type: 'error', title: 'Failed to fetch models', message: (e as Error).message })
    } finally {
      setFetchingModels(false)
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          LLM Configuration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the AI provider used across the entire platform — chat, agent, scanner, code review, hints, grading, and skill analytics.
        </p>
      </div>

      <Card className="p-6 border border-muted-foreground/10 bg-card/30 backdrop-blur-sm">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select value={draft?.provider || 'gemini'} onValueChange={v => updateField('provider', v as LLMProviderId)}>
              <SelectTrigger id="provider" className="h-10 rounded-lg border-border/60 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDERS.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.label}
                      {p.free ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 shrink-0">Free</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            {draft && (() => {
              const defs = getProviderDefaults(draft.provider)
              const hardcoded = defs?.models || []
              const allModels = fetchedModels || hardcoded
              return (
                <div className="flex gap-2">
                  <Select value={draft.model} onValueChange={v => updateField('model', v)}>
                    <SelectTrigger id="model" className="h-10 flex-1 rounded-lg border-border/60 bg-background font-mono text-sm">
                      <SelectValue placeholder="Select or type a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allModels.map(m => (
                        <SelectItem key={m} value={m}>
                          <span className="font-mono text-sm">{m}</span>
                        </SelectItem>
                      ))}
                      {draft.model && !allModels.includes(draft.model) && (
                        <SelectItem value={draft.model}>
                          <span className="font-mono text-sm text-primary">{draft.model} (custom)</span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={refreshModels}
                    disabled={fetchingModels || !draft?.api_key}
                    className="h-10 w-10 shrink-0 rounded-lg"
                    title={draft?.api_key ? 'Fetch all models from provider' : 'Enter API key first'}
                  >
                    <RefreshCw className={`h-4 w-4 ${fetchingModels ? 'animate-spin' : ''}`} />
                  </Button>
                  {draft.model && !allModels.includes(draft.model) && (
                    <Input
                      value={draft.model}
                      onChange={e => updateField('model', e.target.value)}
                      className="h-10 w-48 rounded-lg border-border/60 bg-background font-mono text-sm hidden lg:block"
                      placeholder="Custom model name..."
                    />
                  )}
                </div>
              )
            })()}
            <p className="text-xs text-muted-foreground">
              {fetchedModels
                ? `Showing ${fetchedModels.length} models from the API.`
                : 'Showing default models. Enter an API key and click the refresh button to load all available models.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint">API Endpoint</Label>
            <Input
              id="endpoint"
              value={draft?.endpoint || ''}
              onChange={e => updateField('endpoint', e.target.value)}
              placeholder="https://generativelanguage.googleapis.com/v1beta"
              className="h-10 rounded-lg border-border/60 bg-background font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Base URL for the provider API. Pre-filled for each provider — override for self-hosted or custom endpoints.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api_key">API Key</Label>
            <div className="relative">
              <Input
                id="api_key"
                type={showKey ? 'text' : 'password'}
                value={draft?.api_key || ''}
                onChange={e => updateField('api_key', e.target.value)}
                placeholder="••••••••"
                className="h-10 rounded-lg border-border/60 bg-background font-mono text-sm pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {draft?.provider === 'gemini' ? 'Get a free key from Google AI Studio.' :
               draft?.provider === 'anthropic' ? 'Get a key from console.anthropic.com.' :
               draft?.provider === 'openai' ? 'Get a key from platform.openai.com.' :
               'API key for the provider (Bearer token for OpenAI-compatible APIs).'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/60">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || saving}
              className="gap-2 rounded-lg"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test Connection
            </Button>
            {testResult ? (
              <span className={`flex items-center gap-1.5 text-xs font-medium ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {testResult.message}
              </span>
            ) : null}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || testing}
            className="gap-2 rounded-lg"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </Card>

      <Card className="p-6 border border-muted-foreground/10 bg-card/30">
        <h3 className="font-semibold text-sm mb-3">How it works</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            The configured LLM is used across all AI features: chat, agent, scanner, code review, hints, grading, problem generation, and skill analytics.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            Free providers like <strong>OpenCode</strong> and <strong>Gemini</strong> let you run the platform without paid API keys.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            Per-user model preferences under <strong>Settings → AI Models</strong> are overridden by this global configuration.
          </li>
        </ul>
      </Card>
    </div>
  )
}
