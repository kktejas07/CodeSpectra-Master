'use client'

/**
 * Small pieces shared by the public contest pages, the workspace and admin:
 * format icons, phase badge, time formatting in the contest's time zone, and
 * the leaderboard table.
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

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  const tone =
    phase === 'live' ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400'
      : phase === 'registration' ? 'border-primary/30 bg-primary/10 text-primary'
        : phase === 'draft' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'text-muted-foreground'
  return <Badge variant="outline" className={cn('rounded-full', tone)}>{PHASE_LABELS[phase]}</Badge>
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

export interface BoardRow { rank: number | null; tied: boolean; name: string; kind: 'user' | 'team'; total: number; solved: number; me: boolean }

export function LeaderboardTable({ rows, unit, emptyText }: { rows: BoardRow[]; unit?: string; emptyText?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText || 'No scores yet.'}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Leaderboard</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="w-16 py-2 pr-3 font-medium">Rank</th>
            <th scope="col" className="py-2 pr-3 font-medium">Name</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Solved</th>
            <th scope="col" className="py-2 text-right font-medium">{unit || 'Score'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className={cn('border-b border-border/60', r.me && 'bg-primary/5')}>
              <td className="py-2 pr-3 font-mono tabular-nums">{r.rank === null ? '–' : `${r.rank}${r.tied ? '=' : ''}`}</td>
              <td className="py-2 pr-3">
                <span className="font-medium text-foreground">{r.name}</span>
                {r.me && <span className="ml-2 text-xs text-primary">(you)</span>}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.solved}</td>
              <td className="py-2 text-right font-mono tabular-nums">{Number.isInteger(r.total) ? r.total : r.total.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export async function jsonApi<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const { csrfFetch } = await import('@/lib/csrf-fetch')
  const res = await csrfFetch(url, init)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || `Request failed (${res.status})`)
  return d as T
}
