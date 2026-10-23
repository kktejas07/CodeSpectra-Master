'use client'

/** Contest leaderboard table (public contest page, workspace, admin). SEO-043: text in the compete area catalog. */
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

export interface BoardRow { rank: number | null; tied: boolean; name: string; kind: 'user' | 'team'; total: number; solved: number; me: boolean }

export function LeaderboardTable({ rows, unit, emptyText }: { rows: BoardRow[]; unit?: string; emptyText?: string }) {
  const { t } = useT()
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText || t('compete.ctNoScores')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('compete.ctLeaderboard')}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="w-16 py-2 pr-3 font-medium">{t('compete.ctRank')}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t('compete.ctName')}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">{t('compete.ctSolved')}</th>
            <th scope="col" className="py-2 text-right font-medium">{unit || t('compete.ctScore')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className={cn('border-b border-border/60', r.me && 'bg-primary/5')}>
              <td className="py-2 pr-3 font-mono tabular-nums">{r.rank === null ? '–' : `${r.rank}${r.tied ? '=' : ''}`}</td>
              <td className="py-2 pr-3">
                <span className="font-medium text-foreground">{r.name}</span>
                {r.me && <span className="ml-2 text-xs text-primary">{t('compete.ctYou')}</span>}
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
