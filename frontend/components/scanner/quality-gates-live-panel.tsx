'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Loader, Plus, Shield, Pencil, Trash2 } from 'lucide-react'
import { COMPLIANCE_GATE_PRESETS, type ComplianceGatePreset } from '@/lib/compliance-templates'

type GateDTO = {
  id: string
  gate_name: string
  description: string
  min_quality_score: number
  max_bugs_count: number
  max_vulnerabilities_count: number
  max_code_smells_count: number
  min_test_coverage_percent: number
  max_security_hotspots_count: number
  max_duplicated_code_percentage: number
  is_default: boolean
  is_active: boolean
  standards: string[]
  enforce_on_push: boolean
}

function makeEmptyForm() {
  return {
    gate_name: '',
    description: '',
    min_quality_score: 70,
    max_bugs_count: 5,
    max_vulnerabilities_count: 1,
    max_code_smells_count: 40,
    min_test_coverage_percent: 50,
    max_security_hotspots_count: 5,
    max_duplicated_code_percentage: 10,
    enforce_on_push: false,
    is_active: true,
    standards: [] as string[],
  }
}

export function QualityGatesLivePanel() {
  const [gates, setGates] = useState<GateDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(makeEmptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/quality-gates', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Could not load gates')
        setGates([])
        return
      }
      setGates(Array.isArray(json.gates) ? json.gates : [])
    } catch {
      setError('Could not load gates')
      setGates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditingId(null)
    setForm(makeEmptyForm())
    setShowForm(true)
    setError(null)
  }

  const applyPreset = (p: ComplianceGatePreset) => {
    setForm((f) => ({
      ...f,
      description: p.description,
      standards: [...p.standards],
      min_quality_score: p.min_quality_score,
      max_bugs_count: p.max_bugs_count,
      max_vulnerabilities_count: p.max_vulnerabilities_count,
      max_code_smells_count: p.max_code_smells_count,
      min_test_coverage_percent: p.min_test_coverage_percent,
      max_security_hotspots_count: p.max_security_hotspots_count,
      max_duplicated_code_percentage: p.max_duplicated_code_percentage,
      enforce_on_push: p.enforce_on_push,
    }))
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  const startEdit = (g: GateDTO) => {
    setEditingId(g.id)
    setForm({
      gate_name: g.gate_name,
      description: g.description || '',
      min_quality_score: g.min_quality_score,
      max_bugs_count: g.max_bugs_count,
      max_vulnerabilities_count: g.max_vulnerabilities_count,
      max_code_smells_count: g.max_code_smells_count,
      min_test_coverage_percent: g.min_test_coverage_percent,
      max_security_hotspots_count: g.max_security_hotspots_count,
      max_duplicated_code_percentage: g.max_duplicated_code_percentage,
      enforce_on_push: g.enforce_on_push,
      is_active: g.is_active,
      standards: Array.isArray(g.standards) ? [...g.standards] : [],
    })
    setShowForm(true)
    setError(null)
  }

  const saveGate = async () => {
    const name = form.gate_name.trim()
    if (!name) {
      setError('Gate name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        gate_name: name,
        description: form.description || null,
        min_quality_score: form.min_quality_score,
        max_bugs_count: form.max_bugs_count,
        max_vulnerabilities_count: form.max_vulnerabilities_count,
        max_code_smells_count: form.max_code_smells_count,
        min_test_coverage_percent: form.min_test_coverage_percent,
        max_security_hotspots_count: form.max_security_hotspots_count,
        max_duplicated_code_percentage: form.max_duplicated_code_percentage,
        enforce_on_push: form.enforce_on_push,
        standards: form.standards,
        is_default: false,
        is_active: form.is_active,
      }
      if (editingId) {
        body.id = editingId
      }
      const res = await fetch('/api/quality-gates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Save failed')
        return
      }
      setForm(makeEmptyForm())
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch {
      setError('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const exportGatesJson = async () => {
    setError(null)
    try {
      const res = await fetch('/api/quality-gates/export', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok || !json.gates) {
        setError(typeof json.error === 'string' ? json.error : 'Export failed')
        return
      }
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quality-gates-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed')
    }
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { gates?: unknown }
      if (!Array.isArray(parsed.gates)) {
        setError('Invalid file: expected { gates: [...] }')
        return
      }
      const res = await fetch('/api/quality-gates/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gates: parsed.gates }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Import failed')
        return
      }
      await load()
    } catch {
      setError('Import failed — check JSON')
    } finally {
      setImportBusy(false)
    }
  }

  const duplicateGate = async (id: string) => {
    setDuplicatingId(id)
    setError(null)
    try {
      const res = await fetch('/api/quality-gates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate_from_id: id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Duplicate failed')
        return
      }
      await load()
    } catch {
      setError('Duplicate failed')
    } finally {
      setDuplicatingId(null)
    }
  }

  const deleteGate = async (id: string) => {
    if (!window.confirm('Delete this quality gate?')) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/quality-gates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Delete failed')
        return
      }
      if (editingId === id) {
        setEditingId(null)
        setForm(makeEmptyForm())
        setShowForm(false)
      }
      await load()
    } catch {
      setError('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Quality gates</h1>
        <p className="text-foreground/60">
          Gates are stored per account and used with <code className="rounded bg-muted px-1 text-sm">POST /api/check-quality-gate</code>.
        </p>
      </div>

      <Card className="border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Compliance presets</h2>
        </div>
        <p className="mb-3 text-xs text-foreground/60">
          Applies suggested thresholds and <code className="rounded bg-muted px-0.5">standards</code> to the form below — adjust and save.
        </p>
        <div className="flex flex-wrap gap-2">
          {COMPLIANCE_GATE_PRESETS.map((p) => (
            <Button key={p.id} type="button" size="sm" variant="secondary" onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void exportGatesJson()}>
          Export JSON
        </Button>
        <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(ev) => void onImportFile(ev)} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importBusy}
          onClick={() => importInputRef.current?.click()}
        >
          {importBusy ? 'Importing…' : 'Import JSON'}
        </Button>
        <Button type="button" variant="default" className="gap-2" onClick={() => (showForm ? setShowForm(false) : openNew())}>
          <Plus className="h-4 w-4" />
          {showForm ? 'Close form' : 'New gate'}
        </Button>
      </div>

      {showForm && (
        <Card className="space-y-4 border-2 border-primary/40 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit gate' : 'Create gate'}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-foreground/80">Name</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                value={form.gate_name}
                onChange={(e) => setForm((f) => ({ ...f, gate_name: e.target.value }))}
                placeholder="e.g. Main branch gate"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-foreground/80">Description</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <NumberField label="Min quality score" v={form.min_quality_score} on={(n) => setForm((f) => ({ ...f, min_quality_score: n }))} />
            <NumberField label="Max bugs" v={form.max_bugs_count} on={(n) => setForm((f) => ({ ...f, max_bugs_count: n }))} />
            <NumberField
              label="Max vulnerabilities"
              v={form.max_vulnerabilities_count}
              on={(n) => setForm((f) => ({ ...f, max_vulnerabilities_count: n }))}
            />
            <NumberField
              label="Max code smells"
              v={form.max_code_smells_count}
              on={(n) => setForm((f) => ({ ...f, max_code_smells_count: n }))}
            />
            <NumberField
              label="Min test coverage %"
              v={form.min_test_coverage_percent}
              on={(n) => setForm((f) => ({ ...f, min_test_coverage_percent: n }))}
            />
            <NumberField
              label="Max security hotspots"
              v={form.max_security_hotspots_count}
              on={(n) => setForm((f) => ({ ...f, max_security_hotspots_count: n }))}
            />
            <NumberField
              label="Max duplication %"
              v={form.max_duplicated_code_percentage}
              on={(n) => setForm((f) => ({ ...f, max_duplicated_code_percentage: n }))}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.enforce_on_push}
                onChange={(e) => setForm((f) => ({ ...f, enforce_on_push: e.target.checked }))}
              />
              Enforce on push (metadata for CI / webhook worker)
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Gate active
            </label>
          </div>
          {form.standards.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {form.standards.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" disabled={saving} onClick={() => void saveGate()}>
            {saving ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : editingId ? (
              'Update gate'
            ) : (
              'Save gate'
            )}
          </Button>
        </Card>
      )}

      <Card className="border border-border p-6">
        <h2 className="mb-4 text-lg font-semibold">Your gates</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : gates.length === 0 ? (
          <p className="text-sm text-foreground/60">No gates yet — create one or apply a preset.</p>
        ) : (
          <ul className="space-y-3">
            {gates.map((g) => (
              <li key={g.id} className="rounded-lg border border-border bg-background/50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{g.gate_name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {g.is_active ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                      {g.enforce_on_push ? <Badge variant="secondary">On push</Badge> : null}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => startEdit(g)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1"
                      disabled={duplicatingId === g.id}
                      onClick={() => void duplicateGate(g.id)}
                    >
                      {duplicatingId === g.id ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 gap-1"
                      disabled={deletingId === g.id}
                      onClick={() => void deleteGate(g.id)}
                    >
                      {deletingId === g.id ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
                {g.description ? <p className="mt-2 text-foreground/70">{g.description}</p> : null}
                <p className="mt-2 text-xs text-foreground/50">
                  Quality ≥ {g.min_quality_score} · bugs ≤ {g.max_bugs_count} · vulns ≤ {g.max_vulnerabilities_count} ·
                  smells ≤ {g.max_code_smells_count}
                </p>
                {g.standards?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {g.standards.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function NumberField({
  label,
  v,
  on,
}: {
  label: string
  v: number
  on: (n: number) => void
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-foreground/80">{label}</span>
      <input
        type="number"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
        value={v}
        onChange={(e) => on(Number(e.target.value) || 0)}
        step="any"
      />
    </label>
  )
}
