'use client'
import { useConfirm } from '@/lib/confirm-context'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Loader, Plus, Shield, Pencil, Trash2 } from 'lucide-react'
import { COMPLIANCE_GATE_PRESETS, type ComplianceGatePreset } from '@/lib/compliance-templates'
import { csrfFetch } from '@/lib/csrf-fetch'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
  const confirmDialog = useConfirm()
  const [gates, setGates] = useState<GateDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
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
    setLoadFailed(false)
    try {
      const res = await fetch('/api/quality-gates', { credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setError(typeof json?.error === 'string' ? json.error : t('tools.couldNotLoadGates'))
        setGates([])
        setLoadFailed(true)
        return
      }
      setGates(Array.isArray(json.gates) ? json.gates : [])
    } catch {
      setError(t('tools.couldNotLoadGates'))
      setGates([])
      setLoadFailed(true)
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
      setError(t('tools.gateNameIsRequired'))
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
      const res = await csrfFetch('/api/quality-gates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : t('tools.saveFailed'))
        return
      }
      setForm(makeEmptyForm())
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch {
      setError(t('tools.saveFailed'))
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
        setError(typeof json.error === 'string' ? json.error : t('tools.exportFailed'))
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
      setError(t('tools.exportFailed'))
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
        setError(t('tools.invalidFileExpectedGates'))
        return
      }
      const res = await csrfFetch('/api/quality-gates/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gates: parsed.gates }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : t('tools.importFailed'))
        return
      }
      await load()
    } catch {
      setError(t('tools.importFailedCheckJson'))
    } finally {
      setImportBusy(false)
    }
  }

  const duplicateGate = async (id: string) => {
    setDuplicatingId(id)
    setError(null)
    try {
      const res = await csrfFetch('/api/quality-gates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate_from_id: id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : t('tools.duplicateFailed'))
        return
      }
      await load()
    } catch {
      setError(t('tools.duplicateFailed'))
    } finally {
      setDuplicatingId(null)
    }
  }

  const deleteGate = async (id: string) => {
    if (!await confirmDialog({ title: t('tools.confirmation'), description: t('tools.deleteThisQualityGate') })) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await csrfFetch(`/api/quality-gates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : t('tools.deleteFailed'))
        return
      }
      if (editingId === id) {
        setEditingId(null)
        setForm(makeEmptyForm())
        setShowForm(false)
      }
      await load()
    } catch {
      setError(t('tools.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="sr-only">{t('tools.qualityGates')}</h2>
        <p className="text-sm text-muted-foreground">{t('tools.gatesAreStoredPerAccountAndbca')}{' '}<code className="rounded bg-muted px-1 text-sm">POST /api/check-quality-gate</code>.
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t('tools.compliancePresets')}</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('tools.appliesSuggestedThresholdsAnd')}{' '}<code className="rounded bg-muted px-0.5">standards</code>{' '}{t('tools.toTheFormBelowAdjustAnd8e9')}</p>
        <div className="flex flex-wrap gap-2">
          {COMPLIANCE_GATE_PRESETS.map((p) => (
            <Button key={p.id} type="button" size="sm" variant="secondary" onClick={() => applyPreset(p)}>
              {p.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void exportGatesJson()}>{t('tools.exportJson')}</Button>
        <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(ev) => void onImportFile(ev)} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importBusy}
          onClick={() => importInputRef.current?.click()}
        >
          {importBusy ? t('tools.importing') : t('tools.importJson')}
        </Button>
        <Button type="button" variant="default" className="gap-2" onClick={() => (showForm ? setShowForm(false) : openNew())}>
          <Plus className="h-4 w-4" />
          {showForm ? t('tools.closeForm') : t('tools.newGate')}
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-3xl space-y-4 border-2 border-primary/40 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold">{editingId ? t('tools.editGate') : t('tools.createGate')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-foreground/80">{t('tools.name')}</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                value={form.gate_name}
                onChange={(e) => setForm((f) => ({ ...f, gate_name: e.target.value }))}
                placeholder={t('tools.eGMainBranchGate')}
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-foreground/80">{t('tools.description')}</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <NumberField label={t('tools.minQualityScore')} v={form.min_quality_score} on={(n) => setForm((f) => ({ ...f, min_quality_score: n }))} />
            <NumberField label={t('tools.maxBugs')} v={form.max_bugs_count} on={(n) => setForm((f) => ({ ...f, max_bugs_count: n }))} />
            <NumberField
              label={t('tools.maxVulnerabilities')}
              v={form.max_vulnerabilities_count}
              on={(n) => setForm((f) => ({ ...f, max_vulnerabilities_count: n }))}
            />
            <NumberField
              label={t('tools.maxCodeSmells')}
              v={form.max_code_smells_count}
              on={(n) => setForm((f) => ({ ...f, max_code_smells_count: n }))}
            />
            <NumberField
              label={t('tools.minTestCoverage')}
              v={form.min_test_coverage_percent}
              on={(n) => setForm((f) => ({ ...f, min_test_coverage_percent: n }))}
            />
            <NumberField
              label={t('tools.maxSecurityHotspots')}
              v={form.max_security_hotspots_count}
              on={(n) => setForm((f) => ({ ...f, max_security_hotspots_count: n }))}
            />
            <NumberField
              label={t('tools.maxDuplication')}
              v={form.max_duplicated_code_percentage}
              on={(n) => setForm((f) => ({ ...f, max_duplicated_code_percentage: n }))}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.enforce_on_push}
                onChange={(e) => setForm((f) => ({ ...f, enforce_on_push: e.target.checked }))}
              />{t('tools.enforceOnPushMetadataForCif28')}</label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />{t('tools.gateActive')}</label>
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
                <Loader className="mr-2 h-4 w-4 animate-spin" />{t('common.saving')}</>
            ) : editingId ? (
              t('tools.updateGate')
            ) : (
              t('tools.saveGate')
            )}
          </Button>
        </Card>
      )}

      <Card className="rounded-3xl p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('tools.yourGates')}</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader className="h-4 w-4 animate-spin" />{t('common.loading')}</p>
        ) : loadFailed ? (
          <EmptyState
            compact
            illustration="error"
            title={t('tools.couldntLoadYourGates')}
            description={t('tools.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => void load()}
          />
        ) : gates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tools.noGatesYetCreateOneOr4c0')}</p>
        ) : (
          <ul className="space-y-3">
            {gates.map((g) => (
              <li key={g.id} className="rounded-lg border border-border bg-background/50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{g.gate_name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {g.is_active ? (
                        <Badge>{t('tools.active')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('tools.inactive')}</Badge>
                      )}
                      {g.enforce_on_push ? <Badge variant="secondary">{t('tools.onPush')}</Badge> : null}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => startEdit(g)}>
                      <Pencil className="h-3.5 w-3.5" />{t('tools.edit')}</Button>
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
                      )}{t('tools.duplicate')}</Button>
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
                      )}{t('common.delete')}</Button>
                  </div>
                </div>
                {g.description ? <p className="mt-2 text-foreground/70">{g.description}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">{t('tools.qualityMinQualityScoreBugsMaxd33', { min_quality_score: g.min_quality_score, max_bugs_count: g.max_bugs_count, max_vulnerabilities_count: g.max_vulnerabilities_count, max_code_smells_count: g.max_code_smells_count })}</p>
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
