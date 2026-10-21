'use client'

/** Small shared bits for the campus pages (theme tokens only). */
import { cn } from '@/lib/utils'
import { formatMinor } from '@/lib/campus/types'

export const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const TONE: Record<string, string> = {
  verified: 'bg-green-500/15 text-green-700 dark:text-green-400',
  live: 'bg-green-500/15 text-green-700 dark:text-green-400',
  upcoming: 'bg-primary/10 text-primary',
  ended: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  final: 'bg-muted text-muted-foreground',
  open: 'bg-green-500/15 text-green-700 dark:text-green-400',
  accepted: 'bg-green-500/15 text-green-700 dark:text-green-400',
  offered: 'bg-primary/10 text-primary',
  shortlisted: 'bg-primary/10 text-primary',
  in_process: 'bg-primary/10 text-primary',
  applied: 'bg-muted text-muted-foreground',
  invited: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
  completed: 'bg-muted text-muted-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  rejected: 'bg-destructive/10 text-destructive',
  declined: 'bg-destructive/10 text-destructive',
  revoked: 'bg-destructive/10 text-destructive',
}

export function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ')
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', TONE[status] ?? 'bg-muted text-muted-foreground')}>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
}

export function money(minor: number | null | undefined, currency = 'INR') {
  return formatMinor(minor, currency)
}

export function ctcRange(min: number | null, max: number | null, currency: string): string | null {
  if (min === null && max === null) return null
  if (min !== null && max !== null && min !== max) return `${money(min, currency)} – ${money(max, currency)}`
  return money(min ?? max, currency)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}

/** Read a JSON error from a failed response. */
export async function errorOf(r: Response): Promise<string> {
  const j = await r.json().catch(() => null)
  return (j && typeof j.error === 'string' && j.error) || `Request failed (${r.status})`
}
