'use client'

import { useEffect, useRef, useState } from 'react'
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
import { useToast } from '@/lib/toast-context'
import { LLM_PROVIDERS, getProviderDefaults, type LLMConfig, type LLMProviderId } from '@/lib/llm-config'
import { Save, Loader2, Sparkles, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { LlmKeysManager } from './llm-keys-manager'

export function LlmSettingsSection() {
  const toast = useToast()
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [draft, setDraft] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)

  useEffect(() => {
    fetch('/api/admin/llm-config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setConfig(d.config); setDraft(d.config) })
      .catch(() => toast({ type: 'error', title: 'Failed to load config' }))
      .finally(() => setLoading(false))
  }, [])

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
      const res = await csrfFetch('/api/admin/llm-config', {
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
      const res = await csrfFetch('/api/admin/llm-config/test', {
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
    if (!draft?.endpoint) {
      toast({ type: 'error', title: 'Endpoint required to fetch models' })
      return
    }
    setFetchingModels(true)
    try {
      const res = await csrfFetch('/api/admin/llm-config/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message || `Error ${res.status}`)
      }
      const models: string[] = json.models || []
      setFetchedModels(models)
      toast({ type: 'success', title: `Loaded ${models.length} models` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to fetch models', message: e?.message || 'Connection failed' })
    } finally {
      setFetchingModels(false)
    }
  }



  if (loading) {
    return <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">LLM Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure the AI provider used across the entire platform.
          </p>
        </div>
      </div>

      <Card className="p-6 border border-muted-foreground/10 bg-card/30">
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
          </div>

          <div className="pt-4 border-t border-border/60">
            <LlmKeysManager
              provider={draft?.provider || 'gemini'}
              keys={draft?.keys || {}}
              onChange={(newKeys) => updateField('keys', newKeys)}
            />
          </div>

          <div className="pt-8 border-t border-border/60 space-y-6">
            <div>
              <h3 className="text-lg font-medium">Task Routing (Overrides)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Assign specific models to specific platform tasks. If a task isn't overridden here, it will fall back to the global default model above.
              </p>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { id: 'chat_model', label: 'AI Assistants & Chat' },
                  { id: 'review_model', label: 'Code Reviews & AI Fixes' },
                  { id: 'hints_model', label: 'Code Analysis & Hints' },
                  { id: 'grade_model', label: 'Mock Tests & Exam Grading' },
                  { id: 'interview_model', label: 'AI Interview Generation' },
                  { id: 'cover_letter_model', label: 'AI Cover Letters' },
                  { id: 'practice_model', label: 'Practice Challenges' },
                ].map(task => {
                  const override = draft?.taskOverrides?.[task.id]
                  return (
                    <div key={task.id} className="space-y-2 p-4 border border-border/60 rounded-lg bg-background/50">
                      <Label className="text-sm font-semibold">{task.label}</Label>
                      
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Provider</Label>
                          <Select 
                            value={override?.provider || 'default'} 
                            onValueChange={v => {
                              const newOverrides = { ...draft?.taskOverrides }
                              if (v === 'default') {
                                delete newOverrides[task.id]
                              } else {
                                const defs = getProviderDefaults(v as LLMProviderId)
                                newOverrides[task.id] = { 
                                  provider: v as LLMProviderId, 
                                  model: defs?.models[0] || '',
                                  endpoint: defs?.endpoint || ''
                                }
                              }
                              updateField('taskOverrides', newOverrides)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Use global default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Use Global Default</SelectItem>
                              {LLM_PROVIDERS.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {override?.provider && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Model</Label>
                            <Input
                              value={override.model}
                              onChange={e => {
                                const newOverrides = { ...draft?.taskOverrides }
                                if (newOverrides[task.id]) {
                                  newOverrides[task.id] = { ...newOverrides[task.id]!, model: e.target.value }
                                }
                                updateField('taskOverrides', newOverrides)
                              }}
                              className="h-8 text-xs font-mono"
                              placeholder="e.g. stealth/ox-alpha"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/60">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleTest} disabled={testing || saving} className="gap-2 rounded-lg">
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
          <Button onClick={handleSave} disabled={saving || testing} className="gap-2 rounded-lg">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </Card>
    </div>
  )
}
