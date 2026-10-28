'use client'

/**
 * Format settings editor, rendered from the field specs in
 * lib/contests/formats. Secret fields are marked; the server splits them off
 * on save. Flags and labels are write-only (blank keeps the stored value).
 */
import { Plus, Trash2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/app/page-kit'
import { FORMATS, type FieldSpec } from '@/lib/contests/formats'
import type { ContestFormat } from '@/lib/contests/types'

type Obj = Record<string, unknown>
const selectCls = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const codeCls = 'w-full rounded-lg border border-input bg-background p-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Rows({ value, onChange, cols, addLabel, max }: {
  value: Obj[]; onChange: (v: Obj[]) => void; addLabel: string; max: number
  cols: { key: string; label: string; kind: 'text' | 'check' | 'select'; options?: string[] }[]
}) {
  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-start">
          {cols.map((c) => c.kind === 'check' ? (
            <label key={c.key} className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={row[c.key] === true} onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, [c.key]: e.target.checked } : r)))} className="h-4 w-4" /> {c.label}
            </label>
          ) : c.kind === 'select' ? (
            <select key={c.key} aria-label={c.label} className={selectCls} value={String(row[c.key] || c.options?.[0])} onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r)))}>
              {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <textarea key={c.key} aria-label={`${c.label} ${i + 1}`} placeholder={c.label} rows={2} className={codeCls} value={String(row[c.key] ?? '')} onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r)))} />
          ))}
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {value.length < max && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, {}])}><Plus className="h-4 w-4" /> {addLabel}</Button>}
    </div>
  )
}

function Field({ spec, value, onChange, idPrefix, obj }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; idPrefix: string; obj: Obj }) {
  const id = `${idPrefix}-${spec.key}`
  const label = (
    <Label htmlFor={id} className="flex items-center gap-1.5">
      {spec.label}{spec.required ? '' : ' (optional)'}
      {spec.secret && <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> hidden from entrants</span>}
    </Label>
  )
  const help = spec.help ? <p className="text-xs text-muted-foreground">{spec.help}</p> : null
  switch (spec.type) {
    case 'text':
      return <div className="space-y-1">{label}<Input id={id} value={String(value ?? '')} maxLength={spec.maxLen} onChange={(e) => onChange(e.target.value)} />{help}</div>
    case 'flag':
      return <div className="space-y-1">{label}<Input id={id} value={String(value ?? '')} autoComplete="off" spellCheck={false} placeholder={obj.flag_set ? 'Flag is set — type a new one to replace it' : 'flag{...}'} onChange={(e) => onChange(e.target.value)} className="font-mono" />{help}</div>
    case 'number':
      return <div className="space-y-1">{label}<Input id={id} type="number" min={spec.min} max={spec.max} step="any" value={value === undefined || value === null ? String(spec.default ?? '') : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />{help}</div>
    case 'select':
      return <div className="space-y-1">{label}<select id={id} className={selectCls} value={String(value ?? spec.default ?? '')} onChange={(e) => onChange(e.target.value)}>{spec.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{help}</div>
    case 'boolean':
      return <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">{label}<Switch id={id} checked={value === undefined ? spec.default === true : value === true} onCheckedChange={onChange} /></div>
    case 'string_list':
      return <div className="space-y-1">{label}<Input id={id} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => onChange(e.target.value)} />{help}</div>
    case 'textarea':
      return <div className="space-y-1">{label}<Textarea id={id} rows={5} value={String(value ?? '')} maxLength={spec.maxLen} onChange={(e) => onChange(e.target.value)} />{help}</div>
    case 'code':
      return <div className="space-y-1">{label}<textarea id={id} rows={10} spellCheck={false} className={codeCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />{help}</div>
    case 'csv':
      return (
        <div className="space-y-1">
          {label}
          {typeof obj.labels_count === 'number' && <p className="text-xs text-muted-foreground">{obj.labels_count.toLocaleString()} label rows stored. Paste or load a new file to replace them.</p>}
          <Input type="file" accept=".csv,text/csv" aria-label="Load labels CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await f.text()) }} />
          <textarea id={id} rows={4} spellCheck={false} className={codeCls} placeholder="id,target" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      )
    case 'tests':
      return <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">{label}</legend>{help}<Rows value={(Array.isArray(value) ? value : []) as Obj[]} onChange={onChange} max={50} addLabel="Add test" cols={[{ key: 'input', label: 'stdin', kind: 'text' }, { key: 'expected', label: 'Expected stdout', kind: 'text' }, { key: 'sample', label: 'Sample', kind: 'check' }]} /></fieldset>
    case 'examples':
      return <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">{label}</legend>{help}<Rows value={(Array.isArray(value) ? value : []) as Obj[]} onChange={onChange} max={10} addLabel="Add example" cols={[{ key: 'input', label: 'Input', kind: 'text' }, { key: 'output', label: 'Output', kind: 'text' }]} /></fieldset>
    case 'eval_cases':
      return <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">{label}</legend>{help}<Rows value={(Array.isArray(value) ? value : []) as Obj[]} onChange={onChange} max={25} addLabel="Add case" cols={[{ key: 'input', label: 'Input', kind: 'text' }, { key: 'expected', label: 'Expected', kind: 'text' }, { key: 'match', label: 'Match', kind: 'select', options: ['exact', 'contains', 'regex'] }]} /></fieldset>
  }
}

export function ConfigEditor({ format, value, onChange }: { format: ContestFormat; value: Obj; onChange: (v: Obj) => void }) {
  const meta = FORMATS[format]
  const tasks = (Array.isArray(value.tasks) ? value.tasks : []) as Obj[]
  const setTask = (i: number, t: Obj) => onChange({ ...value, tasks: tasks.map((x, j) => (j === i ? t : x)) })
  return (
    <div className="space-y-6">
      {meta.top.length > 0 && (
        <Panel className="space-y-4">
          <h3 className="font-semibold text-foreground">Settings</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {meta.top.map((f) => (
              <div key={f.key} className={f.type === 'textarea' || f.type === 'csv' || f.type === 'code' ? 'sm:col-span-2' : undefined}>
                <Field spec={f} value={value[f.key]} obj={value} idPrefix="top" onChange={(v) => onChange({ ...value, [f.key]: v })} />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {meta.task && (
        <div className="space-y-4">
          {tasks.map((t, i) => (
            <Panel key={String(t.id || i)} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-foreground">{meta.task!.label} {i + 1}{t.title ? `: ${String(t.title)}` : ''}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, tasks: tasks.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /> Remove</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {meta.task!.fields.map((f) => (
                  <div key={f.key} className={['textarea', 'code', 'tests', 'examples', 'eval_cases'].includes(f.type) ? 'sm:col-span-2' : undefined}>
                    <Field spec={f} value={t[f.key]} obj={t} idPrefix={`t${i}`} onChange={(v) => setTask(i, { ...t, [f.key]: v })} />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
          {tasks.length < meta.task.max && (
            <Button type="button" variant="outline" onClick={() => onChange({ ...value, tasks: [...tasks, {}] })}><Plus className="h-4 w-4" /> Add {meta.task.label.toLowerCase()}</Button>
          )}
        </div>
      )}
    </div>
  )
}
