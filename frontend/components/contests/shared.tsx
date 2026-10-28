'use client'

/**
 * Small pieces shared by the public contest pages, the workspace and admin:
 * format icons, phase badge and time formatting in the contest's time zone.
 */
import {
  Bug, Brain, Database, FileCode2, Flag, GitPullRequest, Lightbulb, Network, Ruler, Undo2, type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PHASE_LABELS } from '@/lib/contests/config'
import type { ContestFormat, ContestPhase } from '@/lib/contests/types'

export const FORMAT_ICONS: Record<ContestFormat, LucideIcon> = {
  theory_to_code: FileCode2, reverse_coding: Undo2, debug_a_thon: Bug, ctf: Flag, datathon: Database,
  prompt_a_thon: Brain, ideathon: Lightbulb, code_golf: Ruler, system_design_jam: Network, open_source_sprint: GitPullRequest,
}

export function FormatIcon({ format, className }: { format: ContestFormat; className?: string }) {
  const Icon = FORMAT_ICONS[format] || FileCode2
  return <Icon className={className} aria-hidden />
}

export function PhaseBadge({ phase, label }: { phase: ContestPhase; /** Translated label (public pages); defaults to English. */ label?: string }) {
  const tone =
    phase === 'live' ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400'
      : phase === 'registration' ? 'border-primary/30 bg-primary/10 text-primary'
        : phase === 'draft' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'text-muted-foreground'
  return <Badge variant="outline" className={cn('rounded-full', tone)}>{label ?? PHASE_LABELS[phase]}</Badge>
}

/** "21 Oct 2026, 18:30 IST" in the contest's zone. */
export function fmtWhen(iso: string | null | undefined, timeZone = 'UTC'): string {
  if (!iso) return 'Not set'
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone, timeZoneName: 'short' }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

// BoardRow / LeaderboardTable live in ./leaderboard (translated, compete area), so the
// cached public /contests hub that imports this file doesn't need that catalog.
export type { BoardRow } from './leaderboard'

export async function jsonApi<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const { csrfFetch } = await import('@/lib/csrf-fetch')
  const res = await csrfFetch(url, init)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || `Request failed (${res.status})`)
  return d as T
}
