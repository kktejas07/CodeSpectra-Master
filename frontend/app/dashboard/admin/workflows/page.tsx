'use client'
import { useConfirm } from '@/lib/confirm-context'

/**
 * Workflow automation — Phase 8.
 *
 * Adds:
 *   - Visual graph builder (React Flow) alongside the JSON editor (tabbed).
 *   - Cron picker for `trigger === 'schedule'` workflows.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Workflow as WorkflowIcon,
  HelpCircle,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import CronPicker from '@/components/workflows/cron-picker'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonList, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

const WorkflowBuilder = dynamic(
  () => import('@/components/workflows/workflow-builder'),
  { ssr: false, loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Loading visual builder…
    </div>
  ) },
)

interface WorkflowSummary {
  id: string
  name: string
  description?: string
  is_active: boolean
  trigger: 'manual' | 'schedule' | 'webhook'
  cron_expression?: string
  nodes: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>
  edges: Array<{ from: string; to: string }>
  created_at: string
  updated_at: string
}

interface RunStep {
  node_id: string
  label: string
  ok: boolean
  output?: unknown
  error?: string
  duration_ms: number
}

interface RunResult {
  id: string
  status: 'success' | 'failed' | 'partial'
  steps: RunStep[]
  duration_ms: number
}

type Tab = 'visual' | 'json'

export default function WorkflowsPage() {
  const confirmDialog = useConfirm()
  const gate = usePageGuard('superadmin')

  const [items, setItems] = useState<WorkflowSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<RunResult | null>(null)
  const [tab, setTab] = useState<Tab>('visual')

  const load = useCallback(async (preserveSelected?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setItems(json.items as WorkflowSummary[])
      if (preserveSelected) setSelected(preserveSelected)
      else if (!selected && json.items[0]) setSelected(json.items[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    void load()
  }, [load])

  const current = useMemo(
    () => items.find((i) => i.id === selected) || null,
    [items, selected],
  )

  useEffect(() => {
    if (current) setDraft(JSON.stringify(current, null, 2))
  }, [current])

  const parsedDraft: WorkflowSummary | null = useMemo(() => {
    try {
      return JSON.parse(draft) as WorkflowSummary
    } catch {
      return null
    }
  }, [draft])

  if (!gate.ready) return null

  function patchDraft(patch: Partial<WorkflowSummary>) {
    if (!parsedDraft) return
    const merged = { ...parsedDraft, ...patch }
    setDraft(JSON.stringify(merged, null, 2))
  }

  async function create() {
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await csrfFetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setCreating(false)
      setNewName('')
      await load(json.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const parsed = JSON.parse(draft)
      const res = await csrfFetch(`/api/workflows/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      await load(current.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runWorkflow() {
    if (!current) return
    setBusy(true)
    setError(null)
    setRun(null)
    try {
      const res = await csrfFetch(`/api/workflows/${current.id}/run`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setRun(json as RunResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!current) return
    if (!await confirmDialog({ title: 'Confirmation', description: `Delete workflow "${current.name}"?` })) return
    setBusy(true)
    try {
      await csrfFetch(`/api/workflows/${current.id}`, { method: 'DELETE' })
      setSelected(null)
      setDraft('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="workflows-page">
      <PageHeader
        title={
          <>
            Workflow automation
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About workflows" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Build steps visually or as JSON. Available steps: manual trigger, HTTP request, AI completion, database lookup, log and delay.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Chain steps together and run them by hand, on a schedule or from a webhook."
        icon={<WorkflowIcon />}
        actions={
          <Button
            onClick={() => {
              setCreating(true)
              setNewName('')
            }}
            data-testid="workflow-new-btn"
          >
            <Plus className="mr-1 h-4 w-4" /> New workflow
          </Button>
        }
      />

      {error && (
        <Panel role="alert" className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Panel>
      )}

      {creating && (
        <Panel className="p-4">
          <label htmlFor="workflow-new-name" className="mb-2 block text-sm font-medium text-foreground">Name your workflow</label>
          <div className="flex gap-2">
            <Input
              id="workflow-new-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Daily problem digest"
              data-testid="workflow-new-name"
            />
            <Button onClick={create} disabled={busy} data-testid="workflow-new-save">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Workflows <span className="font-normal tabular-nums text-muted-foreground">({items.length})</span>
          </div>
          {loading && (
            <div className="py-4">
              <SkeletonList count={4} />
            </div>
          )}
          {!loading && items.length === 0 && (
            <EmptyState title="No workflows yet" description="Select New workflow to automate your first task." className="border-0 bg-transparent py-6 md:py-8" />
          )}
          <ul className="divide-y divide-border/60">
            {items.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setSelected(w.id)}
                  aria-current={selected === w.id ? 'true' : undefined}
                  className={`w-full border-l-2 px-4 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                    selected === w.id ? 'border-primary bg-primary/5' : 'border-transparent'
                  }`}
                  data-testid={`workflow-item-${w.id}`}
                >
                  <p className="font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.is_active ? 'Active' : 'Paused'} · {w.trigger}
                    {w.trigger === 'schedule' && w.cron_expression
                      ? ` · ${w.cron_expression}`
                      : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-5">
          {!current ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Select a workflow on the left, or create a new one to begin.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{current.name}</h2>
                <Badge variant={current.is_active ? 'default' : 'secondary'}>
                  {current.is_active ? 'Active' : 'Paused'}
                </Badge>
                <Badge variant="outline" className="capitalize">{current.trigger}</Badge>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant={tab === 'visual' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTab('visual')}
                    aria-pressed={tab === 'visual'}
                    data-testid="workflow-tab-visual"
                  >
                    Visual
                  </Button>
                  <Button
                    variant={tab === 'json' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTab('json')}
                    aria-pressed={tab === 'json'}
                    data-testid="workflow-tab-json"
                  >
                    JSON
                  </Button>
                  <Button onClick={save} variant="outline" disabled={busy} data-testid="workflow-save-btn">
                    Save
                  </Button>
                  <Button onClick={runWorkflow} disabled={busy} data-testid="workflow-run-btn">
                    {busy ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-1 h-4 w-4" />
                    )}
                    Run
                  </Button>
                  <Button onClick={remove} variant="ghost" disabled={busy} data-testid="workflow-delete-btn" title="Delete" aria-label="Delete workflow">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Trigger config */}
              <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 md:grid-cols-[160px_1fr]">
                <div>
                  <label htmlFor="workflow-trigger" className="text-xs font-medium text-muted-foreground">
                    Trigger
                  </label>
                  <select
                    id="workflow-trigger"
                    value={parsedDraft?.trigger || 'manual'}
                    onChange={(e) => patchDraft({ trigger: e.target.value as WorkflowSummary['trigger'] })}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="workflow-trigger-select"
                  >
                    <option value="manual">Manual</option>
                    <option value="schedule">Schedule (cron)</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
                <div>
                  {parsedDraft?.trigger === 'schedule' ? (
                    <CronPicker
                      value={parsedDraft.cron_expression || '0 9 * * *'}
                      onChange={(c) => patchDraft({ cron_expression: c })}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {parsedDraft?.trigger === 'webhook'
                        ? 'POST to /api/workflows/{id}/run to trigger this workflow programmatically.'
                        : 'Manual workflows run when you click Run.'}
                    </p>
                  )}
                </div>
              </div>

              {tab === 'visual' && parsedDraft && (
                <WorkflowBuilder
                  value={{ nodes: parsedDraft.nodes, edges: parsedDraft.edges }}
                  onChange={(next) => patchDraft({ nodes: next.nodes, edges: next.edges })}
                />
              )}

              {tab === 'json' && (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={20}
                  aria-label="Workflow JSON"
                  className="font-mono text-xs"
                  data-testid="workflow-json-editor"
                />
              )}

              {run && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Last run</h3>
                    <Badge
                      variant={
                        run.status === 'success' ? 'default' :
                        run.status === 'failed' ? 'destructive' :
                        'secondary'
                      }
                    >
                      <span className="capitalize">{run.status}</span>&nbsp;·&nbsp;<span className="tabular-nums">{run.duration_ms}ms</span>
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {run.steps.map((s) => (
                      <li
                        key={s.node_id}
                        className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {s.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Passed" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" aria-label="Failed" />
                          )}
                          <span className="font-medium text-foreground">{s.label}</span>
                          <span className="ml-auto tabular-nums text-muted-foreground">{s.duration_ms}ms</span>
                        </div>
                        {s.error && <p className="mt-1 text-destructive">{s.error}</p>}
                        {s.output != null && (
                          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                            {typeof s.output === 'string'
                              ? s.output.slice(0, 600)
                              : JSON.stringify(s.output, null, 2).slice(0, 600)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}


