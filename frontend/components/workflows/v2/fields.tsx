'use client'

/**
 * Builder form controls: a text/textarea field with a variable picker that
 * inserts {{variables}} at the cursor, a JSON field, and the condition editor.
 */
import { useId, useRef, useState } from 'react'
import { Braces, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CONDITION_OPS, OP_LABELS, UNARY_OPS, type Condition } from '@/lib/automation/conditions'
import type { VarOption } from './variables'

export const selectClass =
  'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function VariablePicker({ vars, onPick, label = 'Insert a variable' }: { vars: VarOption[]; onPick: (path: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const list = vars.filter((v) => !q || v.label.toLowerCase().includes(q.toLowerCase()) || v.path.toLowerCase().includes(q.toLowerCase()))
  const groups = [...new Set(list.map((v) => v.group))]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}>
          <Braces className="h-4 w-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search variables" aria-label="Search variables" className="mb-2 h-8" />
        <div className="max-h-72 overflow-y-auto">
          {!list.length && <p className="px-2 py-3 text-xs text-muted-foreground">No variables yet. Pick a trigger or add a step above this one.</p>}
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g}</p>
              <ul>
                {list.filter((v) => v.group === g).map((v) => (
                  <li key={v.path}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => {
                        onPick(v.path)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate text-foreground">{v.label}</span>
                      <code className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">{v.path}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Text input / textarea with a variable picker that inserts at the caret. */
export function VarField({ value, onChange, multiline, placeholder, vars, label, help, required, type }: {
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  vars?: VarOption[]
  label: string
  help?: string
  required?: boolean
  type?: string
}) {
  const id = useId()
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const insert = (path: string) => {
    const el = ref.current
    const token = `{{${path}}}`
    if (!el) return onChange(value + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        {vars && <VariablePicker vars={vars} onPick={insert} />}
      </div>
      {multiline ? (
        <Textarea id={id} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="text-sm" />
      ) : (
        <Input id={id} ref={ref} type={type || 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
      )}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

/** JSON editor that keeps invalid text locally and reports parse errors. */
export function JsonField({ value, onChange, label, help, vars }: { value: unknown; onChange: (v: unknown) => void; label: string; help?: string; vars?: VarOption[] }) {
  const [text, setText] = useState(() => (value === undefined || value === null || value === '' ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)))
  const [err, setErr] = useState<string | null>(null)
  const commit = (t: string) => {
    setText(t)
    if (!t.trim()) {
      setErr(null)
      return onChange(undefined)
    }
    try {
      onChange(JSON.parse(t))
      setErr(null)
    } catch {
      setErr('Not valid JSON yet')
    }
  }
  return (
    <div className="space-y-1">
      <VarField label={label} value={text} onChange={commit} multiline vars={vars} help={help} />
      {err && <p className="text-xs text-amber-700 dark:text-amber-400" role="status">{err}</p>}
    </div>
  )
}

interface RuleRow { field: string; op: string; value?: unknown }

/** Flat condition editor: all / any of a list of rules. */
export function ConditionEditor({ value, onChange, vars, label = 'Condition' }: { value: Condition | null | undefined; onChange: (c: Condition | null) => void; vars: VarOption[]; label?: string }) {
  const mode: 'all' | 'any' = value?.any?.length ? 'any' : 'all'
  const rules: RuleRow[] = ((value?.[mode] || []) as RuleRow[]).filter((r) => r && typeof r === 'object' && 'field' in r)
  const set = (nextRules: RuleRow[], nextMode = mode) => onChange(nextRules.length ? { [nextMode]: nextRules } : null)
  const update = (i: number, patch: Partial<RuleRow>) => set(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <fieldset className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      {rules.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Match
          <select aria-label="Match all or any" className={`${selectClass} h-8 w-auto`} value={mode} onChange={(e) => set(rules, e.target.value as 'all' | 'any')}>
            <option value="all">all rules</option>
            <option value="any">any rule</option>
          </select>
        </div>
      )}
      {rules.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto] sm:items-end">
          <div className="flex items-center gap-1">
            <Input aria-label="Field" value={r.field} onChange={(e) => update(i, { field: e.target.value })} placeholder="trigger.percent" className="h-9 font-mono text-xs" />
            <VariablePicker vars={vars} onPick={(p) => update(i, { field: p })} label="Pick a field" />
          </div>
          <select aria-label="Comparison" className={selectClass} value={r.op} onChange={(e) => update(i, { op: e.target.value })}>
            {CONDITION_OPS.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
          </select>
          {UNARY_OPS.has(r.op) ? <span className="hidden sm:block" /> : (
            <Input aria-label="Value" value={r.value === undefined || r.value === null ? '' : String(r.value)} onChange={(e) => {
              const raw = e.target.value
              update(i, { value: raw !== '' && /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw })
            }} placeholder="value or {{variable}}" className="h-9 text-sm" />
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove rule" onClick={() => set(rules.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => set([...rules, { field: vars[0]?.path || 'trigger.', op: 'eq', value: '' }])}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add rule
      </Button>
      {!rules.length && <p className="text-xs text-muted-foreground">No rules — always matches.</p>}
    </fieldset>
  )
}
