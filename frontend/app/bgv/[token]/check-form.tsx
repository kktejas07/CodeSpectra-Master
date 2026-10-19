'use client'

/**
 * One BGV check's form for the candidate portal, rendered from the catalog
 * (lib/ats/bgv/catalog.ts): fields, a repeatable group (education entries,
 * employers, addresses, references) and document slots with uploads.
 * Server validates everything again; this only guides.
 */
import { useId, useRef, useState } from 'react'
import { FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/hiring/ui'
import type { CheckDef, DocDef, FieldDef } from '@/lib/ats/bgv/catalog'
import { cn } from '@/lib/utils'

type Values = Record<string, unknown>
export interface PortalDoc { id: string; slot: string; item: number | null; name: string; size: number; type: string }

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function active(f: { when?: { key: string; equals: unknown } }, values: Values): boolean {
  if (!f.when) return true
  const v = values[f.when.key]
  return (v === undefined || v === null || v === '' ? false : v) === f.when.equals
}

function FieldInput({ f, value, onChange, disabled, mask }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; disabled: boolean; mask?: string }) {
  const id = useId()
  const hintId = `${id}-hint`
  const hint = f.sensitive && mask ? `Saved as ${mask}. Leave empty to keep it, or type it again to change it.` : f.hint || (f.pattern ? f.patternHint : undefined)
  if (f.type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm text-foreground hover:bg-muted/40 sm:col-span-2">
        <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span>{f.label}{f.required && <span className="sr-only"> (required)</span>}</span>
      </label>
    )
  }
  const common = { id, disabled, 'aria-describedby': hint ? hintId : undefined, 'aria-required': f.required || undefined }
  let control: React.ReactNode
  if (f.type === 'select') {
    control = <NativeSelect {...common} value={String(value ?? '')} onChange={onChange} options={f.options || []} placeholder="Choose…" className="h-11" />
  } else if (f.type === 'textarea') {
    control = <Textarea {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={f.max ?? 2000} rows={3} />
  } else {
    const type = f.type === 'number' ? 'text' : f.type === 'tel' ? 'tel' : f.type
    control = (
      <Input
        {...common}
        type={type}
        inputMode={f.type === 'number' || f.key === 'last4' || f.key === 'uan' ? 'numeric' : undefined}
        value={String(value ?? '')}
        placeholder={f.sensitive && mask ? mask : undefined}
        onChange={(e) => onChange(e.target.value)}
        maxLength={f.max ?? 200}
        autoComplete={f.autoComplete || (f.sensitive ? 'off' : undefined)}
        className={cn('h-11', f.upper && 'uppercase')}
      />
    )
  }
  return (
    <div className={cn('space-y-1.5', f.type === 'textarea' && 'sm:col-span-2')}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {f.label}{f.required ? <span aria-hidden className="text-red-600 dark:text-red-400"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function DocSlot({ d, docs, item, disabled, onUpload, onRemove, busy, required }: {
  d: DocDef; docs: PortalDoc[]; item: number | null; disabled: boolean; busy: string | null; required: boolean
  onUpload: (slot: string, item: number | null, file: File) => void; onRemove: (id: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  const mine = docs.filter((x) => x.slot === d.slot && x.item === item)
  const max = d.multiple || 1
  const key = `${d.slot}:${item ?? '-'}`
  return (
    <div className="rounded-2xl border border-border p-3 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p id={id} className="text-sm font-medium text-foreground">
            {d.label}{required ? <span aria-hidden className="text-red-600 dark:text-red-400"> *</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{d.hint ? `${d.hint}. ` : ''}PDF, JPG or PNG, up to 10 MB{max > 1 ? ` · up to ${max} files` : ''}</p>
        </div>
        {!disabled && mine.length < max && (
          <>
            <input
              ref={ref}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only"
              aria-labelledby={id}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(d.slot, item, f); e.target.value = '' }}
            />
            <Button type="button" variant="outline" className="min-h-11" disabled={!!busy} onClick={() => ref.current?.click()}>
              {busy === key ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {busy === key ? 'Uploading…' : mine.length ? 'Add another' : 'Upload'}
            </Button>
          </>
        )}
      </div>
      {mine.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {mine.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="truncate">{x.name}</span><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{kb(x.size)}</span></span>
              {!disabled && (
                <button type="button" onClick={() => onRemove(x.id)} disabled={!!busy} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remove ${x.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CheckForm({ def, values, setValues, docs, disabled, busy, onUpload, onRemove, minItems, hintText }: {
  def: CheckDef
  values: Values
  setValues: (v: Values) => void
  docs: PortalDoc[]
  disabled: boolean
  busy: string | null
  onUpload: (slot: string, item: number | null, file: File) => void
  onRemove: (id: string) => void
  minItems: number
  hintText?: string | null
}) {
  const [note, setNote] = useState<string | null>(null)
  const g = def.group
  const items = (g && Array.isArray(values[g.key]) ? values[g.key] : []) as Values[]
  const skipGroup = !!def.skipGroupWith && values[def.skipGroupWith] === true
  const setItem = (i: number, k: string, v: unknown) => {
    const next = items.map((it, j) => (j === i ? { ...it, [k]: v } : it))
    setValues({ ...values, [g!.key]: next })
  }
  const removeItem = (i: number) => {
    if (docs.some((d) => d.item !== null && d.item >= i)) {
      setNote(`Remove the files of ${g!.itemLabel.toLowerCase()} ${i + 1}${i < items.length - 1 ? ' and the ones after it' : ''} first.`)
      return
    }
    setNote(null)
    setValues({ ...values, [g!.key]: items.filter((_, j) => j !== i) })
  }
  const docRequired = (d: DocDef, v: Values, item: number | null) =>
    d.required && active(d, v) && (d.requiredWhen === 'first_item' ? item === 0 : d.requiredWhen === 'not_current' ? v.current !== true : true)

  return (
    <div className="space-y-5">
      {def.notice && <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">{def.notice}</p>}
      {hintText && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{hintText}</p>}
      {(def.fields.length > 0 || def.documents.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {def.fields.filter((f) => active(f, values)).map((f) => (
            <FieldInput key={f.key} f={f} value={values[f.key]} mask={typeof values[`${f.key}_masked`] === 'string' ? String(values[`${f.key}_masked`]) : undefined} onChange={(v) => setValues({ ...values, [f.key]: v })} disabled={disabled} />
          ))}
          {def.documents.filter((d) => active(d, values)).map((d) => (
            <DocSlot key={d.slot} d={d} docs={docs} item={null} disabled={disabled} busy={busy} onUpload={onUpload} onRemove={onRemove} required={docRequired(d, values, null)} />
          ))}
        </div>
      )}
      {g && !skipGroup && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground">{g.label} <span className="font-normal text-muted-foreground">(at least {minItems})</span></legend>
          {items.map((it, i) => (
            <div key={i} className="space-y-4 rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{g.itemLabel} {i + 1}</h3>
                {!disabled && (
                  <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => removeItem(i)} aria-label={`Remove ${g.itemLabel.toLowerCase()} ${i + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.filter((f) => active(f, it)).map((f) => (
                  <FieldInput key={f.key} f={f} value={it[f.key]} onChange={(v) => setItem(i, f.key, v)} disabled={disabled} />
                ))}
                {g.documents.filter((d) => active(d, it)).map((d) => (
                  <DocSlot key={d.slot} d={d} docs={docs} item={i} disabled={disabled} busy={busy} onUpload={onUpload} onRemove={onRemove} required={docRequired(d, it, i)} />
                ))}
              </div>
            </div>
          ))}
          {note && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{note}</p>}
          {!disabled && items.length < g.max && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setValues({ ...values, [g.key]: [...items, {}] })}>
              <Plus className="h-4 w-4" aria-hidden /> Add {g.itemLabel.toLowerCase()}
            </Button>
          )}
        </fieldset>
      )}
    </div>
  )
}
