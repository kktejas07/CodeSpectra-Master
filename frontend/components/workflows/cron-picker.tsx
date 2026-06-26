'use client'

/**
 * Minimal 5-field cron picker (minute / hour / day-of-month / month / day-of-week).
 *
 * Inputs are plain strings (cron-syntax tokens). Each field offers quick
 * presets via a `<select>` next to it. Validation is best-effort: anything
 * that round-trips a 5-token string back to the parent is accepted. The
 * parent (`/api/workflows` route + engine) is responsible for actually
 * scheduling these — for now this is a UX preview that surfaces the
 * cron string so admins can save it on the workflow row.
 */
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'

interface Props {
  value: string
  onChange: (next: string) => void
}

const FIELDS: Array<{
  key: 'min' | 'hour' | 'dom' | 'month' | 'dow'
  label: string
  hint: string
  presets: Array<{ label: string; value: string }>
}> = [
  {
    key: 'min',
    label: 'Minute',
    hint: '0–59',
    presets: [
      { label: 'every minute', value: '*' },
      { label: 'every 5 min', value: '*/5' },
      { label: 'every 15 min', value: '*/15' },
      { label: 'at :00', value: '0' },
      { label: 'at :30', value: '30' },
    ],
  },
  {
    key: 'hour',
    label: 'Hour',
    hint: '0–23',
    presets: [
      { label: 'every hour', value: '*' },
      { label: '00:00', value: '0' },
      { label: '09:00', value: '9' },
      { label: '12:00', value: '12' },
      { label: '18:00', value: '18' },
    ],
  },
  {
    key: 'dom',
    label: 'Day of month',
    hint: '1–31',
    presets: [
      { label: 'any day', value: '*' },
      { label: '1st', value: '1' },
      { label: '15th', value: '15' },
    ],
  },
  {
    key: 'month',
    label: 'Month',
    hint: '1–12',
    presets: [
      { label: 'any month', value: '*' },
      { label: 'Jan', value: '1' },
      { label: 'Jun', value: '6' },
      { label: 'Dec', value: '12' },
    ],
  },
  {
    key: 'dow',
    label: 'Day of week',
    hint: '0 (Sun) – 6 (Sat)',
    presets: [
      { label: 'every day', value: '*' },
      { label: 'weekdays', value: '1-5' },
      { label: 'Mondays', value: '1' },
      { label: 'Fridays', value: '5' },
    ],
  },
]

const PRESET_EXPRESSIONS: Array<{ label: string; value: string }> = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at 09:00', value: '0 9 * * *' },
  { label: 'Weekdays at 09:00', value: '0 9 * * 1-5' },
  { label: 'Weekly (Mon 09:00)', value: '0 9 * * 1' },
  { label: '1st of month 00:00', value: '0 0 1 * *' },
]

function parse(value: string): { min: string; hour: string; dom: string; month: string; dow: string } {
  const parts = (value || '* * * * *').trim().split(/\s+/)
  return {
    min: parts[0] ?? '*',
    hour: parts[1] ?? '*',
    dom: parts[2] ?? '*',
    month: parts[3] ?? '*',
    dow: parts[4] ?? '*',
  }
}

function describe(parts: ReturnType<typeof parse>): string {
  const { min, hour, dom, month, dow } = parts
  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Runs every minute'
  }
  const bits: string[] = []
  if (min !== '*') bits.push(`minute=${min}`)
  if (hour !== '*') bits.push(`hour=${hour}`)
  if (dom !== '*') bits.push(`day-of-month=${dom}`)
  if (month !== '*') bits.push(`month=${month}`)
  if (dow !== '*') bits.push(`day-of-week=${dow}`)
  return `Runs when ${bits.join(', ')}`
}

export default function CronPicker({ value, onChange }: Props) {
  const parsed = useMemo(() => parse(value), [value])
  const [local, setLocal] = useState(parsed)

  useEffect(() => {
    setLocal(parsed)
  }, [parsed])

  function emit(next: typeof local) {
    setLocal(next)
    onChange(`${next.min} ${next.hour} ${next.dom} ${next.month} ${next.dow}`)
  }

  return (
    <div className="space-y-3" data-testid="cron-picker">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Preset</p>
        <select
          className="h-7 rounded border border-border/80 bg-background px-2 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="cron-preset"
        >
          {PRESET_EXPRESSIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {f.label}
            </label>
            <Input
              value={local[f.key]}
              onChange={(e) => emit({ ...local, [f.key]: e.target.value })}
              className="h-7 font-mono text-xs"
              data-testid={`cron-field-${f.key}`}
            />
            <select
              className="mt-1 h-6 w-full rounded border border-border/60 bg-background text-[10px]"
              value=""
              onChange={(e) =>
                e.target.value && emit({ ...local, [f.key]: e.target.value })
              }
            >
              <option value="">{f.hint}</option>
              {f.presets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p className="rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {`${local.min} ${local.hour} ${local.dom} ${local.month} ${local.dow}`}
        </span>{' '}
        — {describe(local)}
      </p>
    </div>
  )
}
