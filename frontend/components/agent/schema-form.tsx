'use client'

/**
 * A small form generated from a tool's JSON-schema parameters (AGT-005), so
 * admins edit a draft through labelled fields instead of raw JSON. Text,
 * numbers, yes/no, choices and lists of text get real inputs; nested objects
 * and lists of objects fall back to a per-field JSON box. Internal keys
 * (sealed AI draft, nonce) are never shown — the server keeps them.
 */
import type { JsonSchema } from '@/lib/agent/contract'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAdminT } from '@/lib/i18n/admin'

export type FieldValue = string | boolean

const humanKey = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : k
}

type FieldKind = 'text' | 'longtext' | 'number' | 'boolean' | 'enum' | 'list' | 'json'

export function fieldKind(s: JsonSchema | undefined): FieldKind {
  if (!s) return 'json'
  if (s.enum?.length) return 'enum'
  if (s.type === 'boolean') return 'boolean'
  if (s.type === 'integer' || s.type === 'number') return 'number'
  if (s.type === 'string') return (s.maxLength ?? 0) > 300 || /description|instructions|statement|body|notes|summary|requirements/i.test(s.description ?? '') ? 'longtext' : 'text'
  if (s.type === 'array' && s.items?.type === 'string' && !s.items.enum) return 'list'
  return 'json'
}

/** Args → editable string/boolean values per field. Pure. */
export function toFormValues(schema: JsonSchema, args: Record<string, unknown>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const [k, s] of Object.entries(schema.properties ?? {})) {
    if (k.startsWith('_')) continue
    const v = args[k]
    const kind = fieldKind(s)
    if (kind === 'boolean') out[k] = v === true
    else if (v === undefined || v === null) out[k] = ''
    else if (kind === 'list') out[k] = Array.isArray(v) ? v.join(', ') : String(v)
    else if (kind === 'json') out[k] = JSON.stringify(v, null, 2)
    else out[k] = String(v)
  }
  return out
}

export interface FormErrors { notNumber: (field: string) => string; notJson: (field: string) => string }
const EN_ERRORS: FormErrors = { notNumber: (f) => `${f} must be a number.`, notJson: (f) => `${f} is not valid JSON.` }

/** Form values → args (empty fields omitted). Throws with a field-specific message (in `errors`' language). Pure. */
export function fromFormValues(schema: JsonSchema, values: Record<string, FieldValue>, errors: FormErrors = EN_ERRORS): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, s] of Object.entries(schema.properties ?? {})) {
    if (k.startsWith('_') || !(k in values)) continue
    const v = values[k]
    const kind = fieldKind(s)
    if (kind === 'boolean') {
      out[k] = v === true
      continue
    }
    const t = String(v ?? '').trim()
    if (!t) continue
    if (kind === 'number') {
      const n = Number(t)
      if (!Number.isFinite(n)) throw new Error(errors.notNumber(humanKey(k)))
      out[k] = s.type === 'integer' ? Math.round(n) : n
    } else if (kind === 'list') out[k] = t.split(',').map((x) => x.trim()).filter(Boolean)
    else if (kind === 'json') {
      try { out[k] = JSON.parse(t) } catch { throw new Error(errors.notJson(humanKey(k))) }
    } else out[k] = t
  }
  return out
}

export function SchemaForm({
  idPrefix,
  schema,
  values,
  onChange,
}: {
  idPrefix: string
  schema: JsonSchema
  values: Record<string, FieldValue>
  onChange: (key: string, value: FieldValue) => void
}) {
  const { t } = useAdminT()
  const required = new Set(schema.required ?? [])
  const entries = Object.entries(schema.properties ?? {}).filter(([k]) => !k.startsWith('_'))
  return (
    <div className="grid gap-4">
      {entries.map(([k, s]) => {
        const id = `${idPrefix}-${k}`
        const kind = fieldKind(s)
        const label = (
          <Label htmlFor={id} className="text-sm font-medium text-foreground">
            {humanKey(k)}{required.has(k) ? <span className="text-destructive" aria-hidden> *</span> : null}
          </Label>
        )
        const help = s?.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null
        if (kind === 'boolean') {
          return (
            <div key={k} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-3 py-2.5">
              <div>{label}{help}</div>
              <Switch id={id} checked={values[k] === true} onCheckedChange={(c) => onChange(k, c)} />
            </div>
          )
        }
        return (
          <div key={k} className="grid gap-1.5">
            {label}
            {kind === 'enum' ? (
              <select
                id={id}
                value={String(values[k] ?? '')}
                onChange={(e) => onChange(k, e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <option value="">—</option>
                {s.enum!.map((o) => <option key={String(o)} value={String(o)}>{String(o).replace(/_/g, ' ')}</option>)}
              </select>
            ) : kind === 'longtext' || kind === 'json' ? (
              <Textarea id={id} value={String(values[k] ?? '')} onChange={(e) => onChange(k, e.target.value)} className={kind === 'json' ? 'min-h-24 font-mono text-xs' : 'min-h-28'} spellCheck={kind !== 'json'} />
            ) : (
              <Input
                id={id}
                type={kind === 'number' ? 'number' : 'text'}
                inputMode={kind === 'number' ? 'decimal' : undefined}
                value={String(values[k] ?? '')}
                onChange={(e) => onChange(k, e.target.value)}
                {...(kind === 'number' && s.minimum !== undefined ? { min: s.minimum } : {})}
                {...(kind === 'number' && s.maximum !== undefined ? { max: s.maximum } : {})}
              />
            )}
            {kind === 'list' ? <p className="text-xs text-muted-foreground">{t('copilot.separateCommas')}</p> : help}
          </div>
        )
      })}
    </div>
  )
}
