'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isSubmitEnter } from '@/lib/keyboard'

interface NumberFieldProps {
  label?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  disabled?: boolean
  className?: string
}

/**
 * Number input with +/- steppers and a mouse-wheel guard, styled like the
 * steppers you'd find in event tools (Devpost / Eventbrite style).
 *
 * Uses a plain `inputMode="numeric"` text field (no native spinners) so
 * scrolling the page never silently rewrites the value. A draft string keeps
 * the field editable while typing and clamps to [min,max] on blur/Enter.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  disabled,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => { setDraft(null) }, [value])

  const clamp = (n: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))

  const commit = (raw: string) => {
    const n = raw === '' || Number.isNaN(Number(raw)) ? 0 : Number(raw)
    onChange(clamp(Number.isFinite(n) ? n : 0))
    setDraft(null)
  }

  const bump = (delta: number) => {
    const current = draft !== null && draft !== '' ? Number(draft) || 0 : value
    onChange(clamp(current + delta))
    setDraft(null)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      <div
        className={cn(
          'flex h-9 items-center overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[box-shadow]',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(-step)}
          aria-label={`Decrease${label ? ` ${label}` : ''}`}
          className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) {
              commit((e.target as HTMLInputElement).value)
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'ArrowUp') { e.preventDefault(); bump(step) }
            if (e.key === 'ArrowDown') { e.preventDefault(); bump(-step) }
          }}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className="w-full min-w-0 flex-1 bg-transparent px-1 py-1 text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(step)}
          aria-label={`Increase${label ? ` ${label}` : ''}`}
          className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {unit && <span className="pr-2.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}