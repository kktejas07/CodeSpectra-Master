'use client'

/**
 * Small shared pieces for the hiring screens: loading / error
 * states, chip input, match score chip, labelled field, native select and a
 * single-series bar list (funnel, sources). Theme tokens only.
 */
import { useId, useState } from 'react'
import { AlertCircle, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Illustration } from '@/components/illustrations/spot'
import { cn } from '@/lib/utils'
import { scoreTone } from './lib/labels'
import { isSubmitEnter } from '@/lib/keyboard'

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry, compact }: { message?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-dashed border-border text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
      )}
    >
      <Illustration name="error" className={compact ? 'mb-2 w-24' : 'mb-4 w-40'} />
      <p className="font-semibold text-foreground">We couldn&apos;t load this</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message || 'Check your connection and try again.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={onRetry}>
          <RefreshCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
    </p>
  )
}

export function MatchScore({ score, className }: { score: number | null | undefined; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', scoreTone(score), className)}
      title={score == null ? 'Not scored yet' : `Match score ${Math.round(score)} of 100`}
    >
      {score == null ? '—' : Math.round(score)}
      <span className="sr-only"> match score</span>
    </span>
  )
}

/** Label + control + optional hint, wired with ids for screen readers. */
export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export const selectClass =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50'

export function NativeSelect({
  value,
  onChange,
  options,
  id,
  className,
  placeholder,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  id?: string
  className?: string
  placeholder?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  )
}

/** Type and press Enter/comma to add chips; Backspace on empty removes the last. */
export function ChipInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  suggestions,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  hint?: string
  suggestions?: string[]
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const seen = new Set(value.map((v) => v.toLowerCase()))
    const next = [...value]
    for (const p of parts) if (!seen.has(p.toLowerCase())) { next.push(p); seen.add(p.toLowerCase()) }
    onChange(next)
    setDraft('')
  }
  const extra = (suggestions ?? []).filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/60">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) { e.preventDefault(); add(draft) }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Suggestions for ${label}`}>
          {extra.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Single-series horizontal bars (one hue, value labels in text tokens).
 * Each row has a title tooltip; pass `caption` for the accessible name.
 */
export function BarList({
  rows,
  caption,
  format = (n) => String(n),
  max,
}: {
  rows: { label: string; value: number; hint?: string }[]
  caption: string
  format?: (n: number) => string
  max?: number
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr><th scope="col">Item</th><th scope="col">Value</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ''}`} className="group">
            <th scope="row" className="w-[40%] max-w-0 truncate pr-3 text-left font-normal text-muted-foreground">{r.label}</th>
            <td className="relative">
              <div className="flex items-center gap-2">
                <div className="h-5 flex-1 rounded-md bg-muted/60">
                  <div
                    className="h-5 rounded-md bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-medium tabular-nums text-foreground">{format(r.value)}</span>
              </div>
              {r.hint && <span className="text-xs text-muted-foreground">{r.hint}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Simple segmented tabs (buttons with aria-pressed) for view switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-border/70 bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {o.label}
          {o.count != null && <span className="tabular-nums text-xs opacity-80">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
