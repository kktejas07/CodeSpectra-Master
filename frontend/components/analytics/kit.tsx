'use client'

/**
 * Shared analytics UI: date range picker (+ compare to previous period),
 * KPI grid with change, funnel bars with step conversion, a time-series chart
 * and a small ranked table. Design-system tokens only; works in light / dark
 * and down to phone width.
 */
import { useId } from 'react'
import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export interface RangeValue { preset: string; from: string; to: string; compare: boolean }
export const DEFAULT_RANGE: RangeValue = { preset: '30d', from: '', to: '', compare: true }

export function rangeQuery(r: RangeValue): string {
  const p = new URLSearchParams()
  if (r.preset === 'custom' && r.from) { p.set('from', r.from); if (r.to) p.set('to', r.to) } else p.set('preset', r.preset === 'custom' ? '30d' : r.preset)
  if (r.compare) p.set('compare', '1')
  return p.toString()
}

const PRESETS: [string, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['365d', 'Last 12 months'], ['custom', 'Custom']]

export function RangePicker({ value, onChange, csvHref, showCompare = true }: { value: RangeValue; onChange: (v: RangeValue) => void; csvHref?: string; showCompare?: boolean }) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-p`} className="text-xs font-medium text-muted-foreground">Period</label>
        <select
          id={`${id}-p`}
          value={value.preset}
          onChange={(e) => onChange({ ...value, preset: e.target.value })}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {value.preset === 'custom' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-f`} className="text-xs font-medium text-muted-foreground">From</label>
            <Input id={`${id}-f`} type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-10 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-t`} className="text-xs font-medium text-muted-foreground">To</label>
            <Input id={`${id}-t`} type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-10 w-40" />
          </div>
        </>
      )}
      {showCompare && (
        <div className="flex h-10 items-center gap-2">
          <Switch id={`${id}-c`} checked={value.compare} onCheckedChange={(v) => onChange({ ...value, compare: v === true })} />
          <label htmlFor={`${id}-c`} className="text-sm text-foreground">Compare to previous period</label>
        </div>
      )}
      {csvHref && (
        <Button asChild variant="outline" size="sm" className="h-10">
          <a href={csvHref} download><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Export CSV</a>
        </Button>
      )}
    </div>
  )
}

export interface KpiItem { key: string; label: string; value: number | null; unit?: string; currency?: string; previous?: number | null; change?: number | null; hint?: string }

export function formatValue(v: number | null | undefined, unit?: string, currency?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (unit === 'percent') return `${Math.round(v * 10) / 10}%`
  if (unit === 'days') return `${Math.round(v * 10) / 10} d`
  if (unit === 'money') {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v) } catch { return `${currency || ''} ${v.toFixed(2)}` }
  }
  return new Intl.NumberFormat().format(Math.round(v))
}

export function Change({ change, invert }: { change: number | null | undefined; invert?: boolean }) {
  if (change === null || change === undefined) return <span className="text-xs text-muted-foreground">No earlier data</span>
  const up = change > 0
  const good = invert ? !up : up
  const Icon = change === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', change === 0 ? 'text-muted-foreground' : good ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? '+' : ''}{change}%<span className="sr-only"> vs previous period</span>
    </span>
  )
}

export function KpiGrid({ items, compare }: { items: KpiItem[]; compare: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((k) => (
        <Panel key={k.key} className="p-5">
          <p className="text-sm font-medium text-muted-foreground">{k.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{formatValue(k.value, k.unit, k.currency)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {compare && 'previous' in k && <Change change={k.change} />}
            {compare && k.previous !== undefined && k.previous !== null && <span className="text-xs text-muted-foreground">was {formatValue(k.previous, k.unit, k.currency)}</span>}
          </div>
          {k.hint && <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>}
        </Panel>
      ))}
    </div>
  )
}

export interface FunnelData { name: string; label: string; overall: number | null; note?: string; steps: { key: string; label: string; count: number; step_conversion: number | null; overall_conversion: number | null }[] }

export function FunnelView({ funnel }: { funnel: FunnelData }) {
  const top = Math.max(1, ...funnel.steps.map((s) => s.count))
  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{funnel.label}</h3>
        <span className="text-sm text-muted-foreground">Overall <span className="font-semibold tabular-nums text-foreground">{funnel.overall === null ? '—' : `${funnel.overall}%`}</span></span>
      </div>
      <ol className="space-y-3">
        {funnel.steps.map((s, i) => (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{i + 1}. {s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{formatValue(s.count)}</span>
                {i > 0 && <> · {s.step_conversion === null ? '—' : `${s.step_conversion}%`} of previous</>}
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted/60" aria-hidden="true">
              <div className="h-3 rounded-full bg-primary/80" style={{ width: `${Math.max(s.count > 0 ? 2 : 0, (s.count / top) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {funnel.note && <p className="text-xs text-muted-foreground">{funnel.note}</p>}
    </Panel>
  )
}

const PRIMARY = 'hsl(var(--primary))'

export function SeriesChart({ data, xKey, yKey, label, previous, height = 240 }: { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; previous?: Record<string, unknown>[] | null; height?: number }) {
  const merged = data.map((d, i) => ({ ...d, __prev: previous?.[i]?.[yKey] ?? null }))
  return (
    <figure aria-label={label} className="w-full">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: string) => String(v).slice(5)} minTickGap={16} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, color: 'hsl(var(--foreground))' }} />
            <Area type="monotone" dataKey={yKey} name={label} stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            {previous && <Line type="monotone" dataKey="__prev" name="Previous period" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{label} per day</figcaption>
    </figure>
  )
}

export function RankTable({ title, rows, valueLabel = 'Count', empty = 'Nothing recorded in this period yet.' }: { title: string; rows: { key: string; count: number; extra?: string }[]; valueLabel?: string; empty?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Panel className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sr-only"><tr><th scope="col">Item</th><th scope="col">{valueLabel}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="align-middle">
                  <th scope="row" className="max-w-0 py-1.5 pr-3 text-left font-normal">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 rounded-md bg-primary/10" style={{ width: `${(r.count / top) * 100}%` }} aria-hidden="true" />
                      <span className="relative block truncate px-2 py-0.5 text-foreground" title={r.key}>{r.key}{r.extra ? <span className="text-muted-foreground"> · {r.extra}</span> : null}</span>
                    </div>
                  </th>
                  <td className="w-20 py-1.5 text-right font-medium tabular-nums text-foreground">{formatValue(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
