/** Shared styling tokens for the live drive screens (theme tokens only). */
import type { EffectiveDriveStatus, GridStatus } from '@/lib/live-drives/types'

export const STATUS_TONE: Record<EffectiveDriveStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/10 text-primary',
  live: 'bg-green-500/15 text-green-700 dark:text-green-400',
  ended: 'bg-muted text-muted-foreground',
}

export const GRID_TONE: Record<GridStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-green-500/15 text-green-700 dark:text-green-400',
  paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  disconnected: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  flagged: 'bg-red-500/15 text-red-700 dark:text-red-400',
  submitted: 'bg-primary/10 text-primary',
  terminated: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export const selectCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function fmtClock(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}
