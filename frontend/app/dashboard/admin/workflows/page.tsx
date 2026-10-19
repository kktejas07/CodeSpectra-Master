'use client'

/**
 * Workflow builder (v2).
 *
 * Superadmins build platform workflows (and see every organisation's);
 * organisation admins build workflows for their own organisation.
 *   - Trigger: event (+ filter), schedule, signed webhook, manual
 *   - Steps: add / reorder / configure, if-else, for-each, waits, variable picker
 *   - Test runs against a sample payload, run history, re-run from failed step
 *   - Templates gallery (every template runs as-is in a test run)
 * The JSON tab still edits older (v1) workflows.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, LayoutTemplate, Loader2, Plus, Save, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { usePageGuard } from '@/lib/use-page-guard'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { eventTypeDef } from '@/lib/automation/event-types'
import { normalizeSteps, validateDefinition, type StepDef } from '@/lib/automation/steps-catalog'
import type { Condition } from '@/lib/automation/conditions'
import { StepList } from '@/components/workflows/v2/step-list'
import { TriggerEditor, type TriggerValue } from '@/components/workflows/v2/trigger-editor'
import { RunPanel, RunStatusBadge } from '@/components/workflows/v2/run-panel'

interface Workflow {
  id: string
  name: string
  description?: string
  is_active: boolean
  trigger: TriggerValue['trigger']
  cron_expression?: string
  event_type?: string | null
  event_filter?: Condition | null
  steps?: StepDef[]
  nodes?: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>
  edges?: Array<{ from: string; to: string }>
  sample_payload?: Record<string, unknown> | null
  tenant_id?: string | null
  has_webhook_secret?: boolean
  webhook_secret_hint?: string | null
  last_run_at?: string | null
  last_run_status?: string | null
  template_id?: string | null
  updated_at: string
}

interface TemplateSummary {
  id: string
  name: string
  description: string
  category: string
  trigger: string
  event_type: string | null
  setup: string | null
  step_count: number
  platform_only: boolean
}

function triggerSummary(w: Pick<Workflow, 'trigger' | 'event_type' | 'cron_expression'>): string {
  if (w.trigger === 'event') return w.event_type ? eventTypeDef(w.event_type)?.label || w.event_type : 'Event (not chosen)'
  if (w.trigger === 'schedule') return `Schedule · ${w.cron_expression || '—'}`
  if (w.trigger === 'webhook') return 'Webhook'
  return 'Manual'
}

/** Steps for the builder: v2 steps, or the v1 graph shown as a list. */
function editableSteps(w: Workflow): StepDef[] {
  if (w.steps?.length) return w.steps
  return (w.nodes || []).filter((n) => !n.type.startsWith('trigger.')).map((n) => ({ id: n.id, type: n.type, label: n.label, config: n.config || {} }))
}

export default function WorkflowsPage() {
  const gate = usePageGuard('tenant_admin')
  const confirm = useConfirm()

  const [items, setItems] = useState<Workflow[]>([])
  const [platform, setPlatform] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Workflow | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [serverProblems, setServerProblems] = useState<string[]>([])
  const [tab, setTab] = useState('build')
  const [jsonText, setJsonText] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [hookBase, setHookBase] = useState('')

  const load = useCallback(async (keep?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setItems(json.items as Workflow[])
      setPlatform(json.scope === 'platform')
      const want = keep ?? selected
      if (want && (json.items as Workflow[]).some((w) => w.id === want)) setSelected(want)
      else if (json.items[0]) setSelected(json.items[0].id)
      else setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    // ?workflow=<id> (links from failure alerts) preselects a workflow.
    if (gate.ready) void load(new URLSearchParams(window.location.search).get('workflow'))
  }, [gate.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHookBase(window.location.origin)
  }, [])

  const current = useMemo(() => items.find((i) => i.id === selected) || null, [items, selected])

  useEffect(() => {
    if (!current) {
      setDraft(null)
      return
    }
    setDraft({ ...current, steps: editableSteps(current) })
    setJsonText(JSON.stringify(current, null, 2))
    setDirty(false)
    setServerProblems([])
    setNotice(null)
  }, [current])

  const patch = (p: Partial<Workflow>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    setDirty(true)
  }

  const problems = useMemo(() => {
    if (!draft) return []
    return validateDefinition({ trigger: draft.trigger, cron_expression: draft.cron_expression, event_type: draft.event_type, event_filter: draft.event_filter, steps: normalizeSteps(draft.steps || []) }, { platform: platform && !draft.tenant_id })
  }, [draft, platform])

  if (!gate.ready) return null

  async function api(url: string, method: string, body?: unknown) {
    const res = await csrfFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setServerProblems(Array.isArray(json.errors) ? json.errors : [])
      throw new Error(json.error || 'Request failed')
    }
    return json
  }

  async function save(extra: Partial<Workflow> = {}) {
    if (!draft) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const body = {
        name: draft.name, description: draft.description || '', trigger: draft.trigger, cron_expression: draft.cron_expression || '',
        event_type: draft.event_type || null, event_filter: draft.event_filter || null, steps: draft.steps || [],
        sample_payload: draft.sample_payload || {}, ...extra,
      }
      const json = await api(`/api/workflows/${draft.id}`, 'PATCH', body)
      setNotice(json.warnings?.length ? 'Saved as a draft — fix the problems below before switching it on.' : 'Saved.')
      setServerProblems(json.warnings || [])
      await load(draft.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(on: boolean) {
    if (!draft) return
    if (dirty) return save({ is_active: on })
    setBusy(true)
    setError(null)
    try {
      await api(`/api/workflows/${draft.id}`, 'PATCH', { is_active: on })
      await load(draft.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveJson() {
    if (!draft) return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setError('The JSON is not valid.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { id: _id, has_webhook_secret: _h, webhook_secret_hint: _w, ...rest } = parsed
      void _id; void _h; void _w
      await api(`/api/workflows/${draft.id}`, 'PATCH', rest)
      setNotice('Saved.')
      await load(draft.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function create(templateId?: string) {
    setBusy(true)
    setError(null)
    try {
      const json = await api('/api/workflows', 'POST', templateId ? { template_id: templateId } : { name: newName.trim() })
      setCreating(false)
      setNewName('')
      setGalleryOpen(false)
      setNotice(templateId ? 'Template added (paused). Review the steps, then switch it on.' : null)
      await load(json.id)
      setTab('build')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function openGallery() {
    setGalleryOpen(true)
    if (templates.length) return
    const res = await fetch('/api/workflows/templates', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) setTemplates(json.items || [])
  }

  async function remove() {
    if (!draft) return
    if (!(await confirm({ title: 'Delete workflow', description: `Delete “${draft.name}”? Waiting runs are cancelled.` }))) return
    setBusy(true)
    try {
      await api(`/api/workflows/${draft.id}`, 'DELETE')
      setSelected(null)
      await load(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="workflows-page">
      <PageHeader
        illustration="integrations"
        title="Workflow automation"
        description={platform ? 'Automate the platform: react to events, run on a schedule or from other systems, and send emails, WhatsApp, Slack messages and more.' : 'Automate your organisation’s hiring and assessments: react to events, run on a schedule, and notify people.'}
        icon={<WorkflowIcon />}
        actions={
          <>
            <Button variant="outline" onClick={openGallery} data-testid="workflow-templates-btn"><LayoutTemplate className="h-4 w-4" aria-hidden /> Templates</Button>
            <Button onClick={() => { setCreating(true); setNewName('') }} data-testid="workflow-new-btn"><Plus className="h-4 w-4" aria-hidden /> New workflow</Button>
          </>
        }
      />

      {error && <Panel role="alert" className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Panel>}
      {notice && !error && <Panel role="status" className="p-3 text-sm text-foreground">{notice}</Panel>}

      {creating && (
        <Panel className="p-4">
          <label htmlFor="workflow-new-name" className="mb-2 block text-sm font-medium text-foreground">Name your workflow</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="workflow-new-name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Nudge recruiters about idle candidates" data-testid="workflow-new-name" />
            <div className="flex gap-2">
              <Button onClick={() => create()} disabled={busy || !newName.trim()} data-testid="workflow-new-save">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : 'Create'}</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Workflows <span className="font-normal tabular-nums text-muted-foreground">({items.length})</span>
          </div>
          {loading && <div className="py-4"><SkeletonList count={4} /></div>}
          {!loading && items.length === 0 && (
            <EmptyState illustration="integrations" title="No workflows yet" description="Start from a template or create one from scratch." className="border-0 bg-transparent py-6 md:py-8" />
          )}
          <ul className="max-h-[70vh] divide-y divide-border/60 overflow-y-auto">
            {items.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setSelected(w.id)}
                  aria-current={selected === w.id ? 'true' : undefined}
                  className={`w-full border-l-2 px-4 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${selected === w.id ? 'border-primary bg-primary/5' : 'border-transparent'}`}
                  data-testid={`workflow-item-${w.id}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${w.is_active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                    <span className="truncate font-medium text-foreground">{w.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {w.is_active ? 'On' : 'Off'} · {triggerSummary(w)}
                    {platform && w.tenant_id ? ' · organisation' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="min-w-0 p-4 sm:p-5">
          {!draft ? (
            <p className="text-sm text-muted-foreground">Select a workflow, add a template, or create a new one.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input aria-label="Workflow name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} className="h-10 max-w-md flex-1 text-base font-semibold" />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={draft.is_active} onCheckedChange={toggleActive} disabled={busy || (!draft.is_active && problems.length > 0)} aria-label="Workflow on" data-testid="workflow-active-switch" />
                  {draft.is_active ? 'On' : 'Off'}
                </label>
                {draft.last_run_status && <span className="flex items-center gap-1 text-xs text-muted-foreground">Last run <RunStatusBadge status={draft.last_run_status as never} /></span>}
                <div className="ml-auto flex gap-2">
                  <Button onClick={() => save()} disabled={busy || !dirty} data-testid="workflow-save-btn">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Save</Button>
                  <Button onClick={remove} variant="ghost" size="icon" disabled={busy} aria-label="Delete workflow" data-testid="workflow-delete-btn"><Trash2 className="h-4 w-4 text-destructive" aria-hidden /></Button>
                </div>
              </div>
              <Textarea aria-label="Description" value={draft.description || ''} onChange={(e) => patch({ description: e.target.value })} rows={2} placeholder="What does this workflow do?" className="text-sm" />

              {(problems.length > 0 || serverProblems.length > 0) && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">
                  <p className="flex items-center gap-2 font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden /> Fix before switching on</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {[...new Set([...problems, ...serverProblems])].slice(0, 8).map((p) => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="build" data-testid="workflow-tab-visual">Build</TabsTrigger>
                  <TabsTrigger value="runs" data-testid="workflow-tab-runs">Test &amp; history</TabsTrigger>
                  <TabsTrigger value="json" data-testid="workflow-tab-json">JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="build" className="space-y-5 pt-4">
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-foreground">1. Trigger</h2>
                    <TriggerEditor
                      value={{ trigger: draft.trigger, cron_expression: draft.cron_expression, event_type: draft.event_type, event_filter: draft.event_filter }}
                      onChange={(t) => patch(t)}
                      workflowId={draft.id}
                      hookUrl={`${hookBase}/api/workflows/hooks/${draft.id}`}
                      secretHint={draft.webhook_secret_hint}
                    />
                  </section>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-foreground">2. Steps</h2>
                    <StepList
                      steps={draft.steps || []}
                      root={draft.steps || []}
                      onChange={(steps) => patch({ steps })}
                      trigger={{ trigger: draft.trigger, event_type: draft.event_type, sample_payload: draft.sample_payload }}
                      platform={platform && !draft.tenant_id}
                    />
                  </section>
                </TabsContent>

                <TabsContent value="runs" className="pt-4">
                  {dirty && <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">You have unsaved changes — runs use the saved version.</p>}
                  <RunPanel
                    workflowId={draft.id}
                    isActive={draft.is_active}
                    trigger={draft.trigger}
                    eventType={draft.event_type}
                    samplePayload={draft.sample_payload}
                    onSamplePayload={(p) => patch({ sample_payload: p })}
                  />
                </TabsContent>

                <TabsContent value="json" className="space-y-2 pt-4">
                  <p className="text-xs text-muted-foreground">Advanced: edit the stored definition directly (older workflows use nodes and edges).</p>
                  <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={20} aria-label="Workflow JSON" className="font-mono text-xs" data-testid="workflow-json-editor" />
                  <Button variant="outline" onClick={saveJson} disabled={busy}>Save JSON</Button>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Workflow templates</DialogTitle>
            <DialogDescription>Each template is added switched off so you can review it. All of them run as-is in a test run.</DialogDescription>
          </DialogHeader>
          {!templates.length && <SkeletonList count={3} />}
          <ul className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
                  <Badge variant="outline">{t.category}</Badge>
                </div>
                <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t.trigger === 'event' && t.event_type ? `When: ${eventTypeDef(t.event_type)?.label || t.event_type}` : t.trigger === 'schedule' ? 'On a schedule' : t.trigger} · {t.step_count} steps</p>
                {t.setup && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Setup: {t.setup}</p>}
                <Button size="sm" className="mt-3 self-start" onClick={() => create(t.id)} disabled={busy} data-testid={`template-use-${t.id}`}>Use template</Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
