'use client'

/**
 * Workflow automation v1 — list, edit JSON, run.
 *
 * v1 deliberately keeps things minimal: a list of workflows + a JSON
 * editor for each (no drag-drop graph yet). Run logs show the step-by-step
 * output of the last execution.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
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
} from 'lucide-react'

interface WorkflowSummary {
  id: string
  name: string
  description?: string
  is_active: boolean
  trigger: string
  nodes: unknown[]
  edges: unknown[]
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

const STARTER_TEMPLATE = `{
  "name": "Daily problem digest",
  "description": "Fetch top 5 problems, ask the LLM to summarise.",
  "trigger": "manual",
  "is_active": true,
  "nodes": [
    { "id": "t1", "type": "trigger.manual", "label": "Start" },
    { "id": "fetch", "type": "mongo.find", "label": "Top problems",
      "config": { "collection": "problems", "filter": { "is_published": true }, "limit": 5 } },
    { "id": "ai", "type": "ai.complete", "label": "Summarise",
      "config": {
        "system": "You write 1-line digests for engineering teams.",
        "prompt": "Summarise these problems: {{fetch}}"
      } }
  ],
  "edges": [
    { "from": "t1", "to": "fetch" },
    { "from": "fetch", "to": "ai" }
  ]
}`

export default function WorkflowsPage() {
  const [items, setItems] = useState<WorkflowSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<RunResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setItems(json.items as WorkflowSummary[])
      if (!selected && json.items[0]) setSelected(json.items[0].id)
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

  async function create() {
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setCreating(false)
      setNewName('')
      await load()
      setSelected(json.id)
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
      const res = await fetch(`/api/workflows/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      await load()
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
      const res = await fetch(`/api/workflows/${current.id}/run`, {
        method: 'POST',
      })
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
    if (!confirm(`Delete workflow "${current.name}"?`)) return
    setBusy(true)
    try {
      await fetch(`/api/workflows/${current.id}`, { method: 'DELETE' })
      setSelected(null)
      setDraft('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="workflows-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <WorkflowIcon className="h-7 w-7 text-primary" />
            Workflow automation
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Compose pipelines using built-in node types
            (<code>trigger.manual</code>, <code>http.request</code>,
            <code> ai.complete</code>, <code>mongo.find</code>, <code>log</code>,
            <code> delay</code>). v1 ships with a JSON editor; a visual graph
            builder is on the roadmap.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreating(true)
            setNewName('')
          }}
          data-testid="workflow-new-btn"
        >
          <Plus className="mr-1 h-4 w-4" /> New workflow
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {creating && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Name your workflow</p>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Daily problem digest"
              data-testid="workflow-new-name"
            />
            <Button onClick={create} disabled={busy} data-testid="workflow-new-save">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-3 py-2 text-xs uppercase text-muted-foreground">
            Workflows ({items.length})
          </div>
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Loading
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="px-3 py-6 text-xs text-muted-foreground">
              No workflows yet. Click <strong>New workflow</strong> to begin.
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {items.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setSelected(w.id)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 ${
                    selected === w.id ? 'bg-muted/60' : ''
                  }`}
                  data-testid={`workflow-item-${w.id}`}
                >
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.is_active ? 'Active' : 'Paused'} · {w.trigger}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          {!current ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Select a workflow on the left, or create a new one to begin.</p>
              <p className="font-mono text-xs whitespace-pre-wrap rounded bg-muted/40 p-3">
                {STARTER_TEMPLATE}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{current.name}</h2>
                <Badge variant={current.is_active ? 'default' : 'secondary'}>
                  {current.is_active ? 'Active' : 'Paused'}
                </Badge>
                <div className="ml-auto flex gap-2">
                  <Button
                    onClick={save}
                    variant="outline"
                    disabled={busy}
                    data-testid="workflow-save-btn"
                  >
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
                  <Button
                    onClick={remove}
                    variant="ghost"
                    disabled={busy}
                    data-testid="workflow-delete-btn"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={18}
                className="font-mono text-xs"
                data-testid="workflow-json-editor"
              />
              {run && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Last run</h3>
                    <Badge
                      variant={
                        run.status === 'success'
                          ? 'default'
                          : run.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {run.status} · {run.duration_ms}ms
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {run.steps.map((s) => (
                      <li
                        key={s.node_id}
                        className="rounded border border-border/60 bg-muted/30 p-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {s.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className="font-medium">{s.label}</span>
                          <span className="ml-auto text-muted-foreground">
                            {s.duration_ms}ms
                          </span>
                        </div>
                        {s.error && <p className="mt-1 text-destructive">{s.error}</p>}
                        {s.output != null && (
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
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
        </Card>
      </div>
    </div>
  )
}
