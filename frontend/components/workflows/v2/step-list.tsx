'use client'

/**
 * Step list editor: add, reorder, remove and configure steps; if/else and
 * for-each steps hold nested lists. Each step's form comes from the step
 * catalog (lib/automation/steps-catalog.ts).
 */
import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitBranch, Plus, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { nextStepId, STEP_TYPES, stepTypeDef, type StepDef } from '@/lib/automation/steps-catalog'
import type { Condition } from '@/lib/automation/conditions'
import { ConditionEditor, JsonField, selectClass, VarField } from './fields'
import { BUILTIN_VARS, priorStepVariables, triggerVariables, type TriggerInfo } from './variables'

interface Props {
  steps: StepDef[]
  onChange: (steps: StepDef[]) => void
  /** The whole workflow's steps (for variable lookup across nesting). */
  root: StepDef[]
  trigger: TriggerInfo
  platform: boolean
  depth?: number
}

function AddStepMenu({ onAdd, platform, label = 'Add step' }: { onAdd: (type: string) => void; platform: boolean; label?: string }) {
  const [open, setOpen] = useState(false)
  const groups = [...new Set(STEP_TYPES.map((s) => s.group))]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm"><Plus className="h-3.5 w-3.5" aria-hidden /> {label}</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="max-h-80 overflow-y-auto">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g}</p>
              {STEP_TYPES.filter((s) => s.group === g && (platform || !s.platformOnly)).map((s) => (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => {
                    onAdd(s.type)
                    setOpen(false)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function newStep(type: string, root: StepDef[]): StepDef {
  const td = stepTypeDef(type)
  const s: StepDef = { id: nextStepId(root, type), type, label: td?.label || type, config: {} }
  if (type === 'condition') Object.assign(s, { then: [], else: [], config: { if: null } })
  if (type === 'for_each') s.steps = []
  if (type === 'delay') s.config = { amount: 1, unit: 'hours' }
  if (type === 'email.send') s.config = { category: 'transactional' }
  if (type === 'mongo.find') s.config = { mode: 'list', limit: 10 }
  return s
}

function StepForm({ step, onChange, root, trigger }: { step: StepDef; onChange: (s: StepDef) => void; root: StepDef[]; trigger: TriggerInfo }) {
  const td = stepTypeDef(step.type)
  const vars = [...triggerVariables(trigger), ...priorStepVariables(root, step.id), ...BUILTIN_VARS]
  const cfg = step.config || {}
  const setCfg = (k: string, v: unknown) => onChange({ ...step, config: { ...cfg, [k]: v } })
  if (!td) return <p className="text-xs text-muted-foreground">Legacy step “{step.type}” — edit it in the JSON tab.</p>
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{td.description}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`label-${step.id}`}>Step name</label>
          <Input id={`label-${step.id}`} value={step.label || ''} onChange={(e) => onChange({ ...step, label: e.target.value })} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`id-${step.id}`}>Step id (for {'{{steps.<id>}}'})</label>
          <Input id={`id-${step.id}`} value={step.id} readOnly className="h-9 font-mono text-xs" />
        </div>
      </div>
      {td.fields.map((f) => {
        const v = cfg[f.key]
        if (f.kind === 'condition') return <ConditionEditor key={f.key} label={f.label} value={(v as Condition) || null} onChange={(c) => setCfg(f.key, c)} vars={vars} />
        if (f.kind === 'json') return <JsonField key={`${step.id}-${f.key}`} label={f.label} help={f.help} value={v} onChange={(x) => setCfg(f.key, x)} vars={f.vars ? vars : undefined} />
        if (f.kind === 'select') {
          return (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`${step.id}-${f.key}`}>{f.label}{f.required && <span className="text-destructive"> *</span>}</label>
              <select id={`${step.id}-${f.key}`} className={selectClass} value={String(v ?? '')} onChange={(e) => setCfg(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )
        }
        if (f.kind === 'number') return <VarField key={f.key} label={f.label} required={f.required} type="text" value={v === undefined || v === null ? '' : String(v)} onChange={(x) => setCfg(f.key, x !== '' && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)} vars={f.vars ? vars : undefined} help={f.help} />
        return <VarField key={f.key} label={f.label} required={f.required} multiline={f.kind === 'textarea'} placeholder={f.placeholder} value={String(v ?? '')} onChange={(x) => setCfg(f.key, x)} vars={f.vars ? vars : undefined} help={f.help} />
      })}
      {td.sideEffect && (
        <details className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Reliability</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor={`${step.id}-retries`}>Retries (0–5)</label>
              <Input id={`${step.id}-retries`} inputMode="numeric" value={String(cfg.retries ?? 2)} onChange={(e) => setCfg('retries', Math.max(0, Math.min(5, Number(e.target.value) || 0)))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor={`${step.id}-timeout`}>Timeout (seconds)</label>
              <Input id={`${step.id}-timeout`} inputMode="numeric" value={String(Math.round(Number(cfg.timeout_ms ?? 30000) / 1000))} onChange={(e) => setCfg('timeout_ms', Math.max(1, Math.min(120, Number(e.target.value) || 30)) * 1000)} className="h-9 text-sm" />
            </div>
            <label className="flex items-center gap-2 pt-5 text-xs text-muted-foreground">
              <Switch checked={cfg.continue_on_error === true} onCheckedChange={(c) => setCfg('continue_on_error', c)} aria-label="Continue if this step fails" />
              Continue if it fails
            </label>
          </div>
        </details>
      )}
    </div>
  )
}

export function StepList({ steps, onChange, root, trigger, platform, depth = 0 }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const replace = (i: number, s: StepDef) => onChange(steps.map((x, j) => (j === i ? s : x)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = (type: string) => {
    const s = newStep(type, root)
    onChange([...steps, s])
    setOpen(s.id)
  }
  return (
    <div className="space-y-2">
      {!steps.length && <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No steps here yet.</p>}
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const td = stepTypeDef(s.type)
          const isOpen = open === s.id
          return (
            <li key={s.id} className="rounded-2xl border border-border/70 bg-card">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-primary">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="tabular-nums text-xs text-muted-foreground">{i + 1}</span>
                  {s.type === 'condition' && <GitBranch className="h-4 w-4 text-primary" aria-hidden />}
                  {s.type === 'for_each' && <Repeat className="h-4 w-4 text-primary" aria-hidden />}
                  <span className="truncate text-sm font-medium text-foreground">{s.label || td?.label || s.type}</span>
                  <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{td?.label || s.type}</Badge>
                </button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${s.label || s.type}`} onClick={() => onChange(steps.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" aria-hidden /></Button>
              </div>
              {isOpen && (
                <div className="border-t border-border/60 px-3 py-3">
                  <StepForm step={s} onChange={(n) => replace(i, n)} root={root} trigger={trigger} />
                </div>
              )}
              {s.type === 'condition' && depth < 3 && (
                <div className="grid gap-3 border-t border-border/60 px-3 py-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400">Then</p>
                    <StepList steps={s.then || []} onChange={(n) => replace(i, { ...s, then: n })} root={root} trigger={trigger} platform={platform} depth={depth + 1} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Else</p>
                    <StepList steps={s.else || []} onChange={(n) => replace(i, { ...s, else: n })} root={root} trigger={trigger} platform={platform} depth={depth + 1} />
                  </div>
                </div>
              )}
              {s.type === 'for_each' && depth < 3 && (
                <div className="space-y-2 border-t border-border/60 px-3 py-3">
                  <p className="text-xs font-semibold text-muted-foreground">For each item</p>
                  <StepList steps={s.steps || []} onChange={(n) => replace(i, { ...s, steps: n })} root={root} trigger={trigger} platform={platform} depth={depth + 1} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <AddStepMenu onAdd={add} platform={platform} label={depth ? 'Add' : 'Add step'} />
    </div>
  )
}
