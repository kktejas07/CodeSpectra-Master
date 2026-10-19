'use client'

/**
 * Small client helpers shared by the seller dashboard and the marketplace
 * admin console: API calls (csrfFetch), money formatting / parsing (minor
 * units on the wire), status badges, labelled fields and a native select.
 */
import { csrfFetch } from '@/lib/csrf-fetch'
import { formatCurrencyAmount } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; raw?: BodyInit } = {}): Promise<T> {
  const res = await csrfFetch(path, {
    method: init.method || (init.body !== undefined || init.raw ? 'POST' : 'GET'),
    headers: init.raw ? { 'Content-Type': 'application/octet-stream' } : init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

/** Append `as=platform` when a superadmin manages the CodeSpectra store. */
export function withAs(path: string, asPlatform: boolean): string {
  if (!asPlatform) return path
  return `${path}${path.includes('?') ? '&' : '?'}as=platform`
}

export const money = (minor: number | null | undefined, currency: string) => formatCurrencyAmount(Number(minor || 0), currency || 'INR')

/** "499.50" → 49950; '' → null; invalid → NaN */
export function toMinor(v: string): number | null {
  const s = String(v ?? '').replace(/[,\s]/g, '')
  if (!s) return null
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN
  return Math.round(Number(s) * 100)
}
export const toMajor = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : (minor / 100).toFixed(2).replace(/\.00$/, ''))

export const pct = (bps: number | null | undefined) => `${((bps ?? 0) / 100).toFixed(2).replace(/\.?0+$/, '')}%`

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'secondary'> = {
  approved: 'success', published: 'success', paid: 'success', delivered: 'success', delivered_digital: 'success', completed: 'success', fulfilled: 'success', verified: 'success', refunded: 'secondary',
  pending: 'warning', pending_review: 'warning', requested: 'warning', open: 'warning', submitted: 'warning', processing: 'info', shipped: 'info', booked: 'info', partially_fulfilled: 'info', unfulfilled: 'warning', pending_payment: 'outline',
  rejected: 'danger', suspended: 'danger', failed: 'danger', cancelled: 'outline', archived: 'outline', draft: 'outline', partially_refunded: 'secondary', returned: 'secondary',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = String(status || '').replace(/_/g, ' ')
  return <Badge variant={TONES[status] ?? 'outline'} className={cn('capitalize', className)}>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>
}

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn('h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50', className)}
    />
  )
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')

/** Responsive table wrapper (horizontal scroll on phones). */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-2 overflow-x-auto px-2"><table className="w-full min-w-[640px] text-sm">{children}</table></div>
}
export const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground'
export const td = 'border-t border-border/60 px-3 py-2.5 align-top'
