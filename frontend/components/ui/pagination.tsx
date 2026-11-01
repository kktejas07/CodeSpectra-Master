'use client'

/**
 * Shared pagination for card grids.
 *
 * Arena reached 126 items, problems 58, challenges 26 — the grid pages render
 * everything they fetch, so the list became one long scroll with no sense of
 * place. The admin `DataTable` has pagination built in; this is the same
 * behaviour for the learner-facing grids.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

export interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** Total items, shown as "x–y of n" when provided. */
  totalItems?: number
  pageSize?: number
  className?: string
}

/** Page numbers with ellipses — 1 … 4 5 6 … 12. */
export function pageWindow(page: number, totalPages: number, span = 1): (number | '…')[] {
  const pages = new Set<number>()
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= span) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

export function Pagination({ page, totalPages, onChange, totalItems, pageSize, className }: PaginationProps) {
  const { t } = useT()
  if (totalPages <= 1) return null

  const from = pageSize ? (page - 1) * pageSize + 1 : undefined
  const to = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : undefined

  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-3 pt-2', className)} aria-label="Pagination">
      <p className="text-xs text-muted-foreground tabular-nums">
        {totalItems !== undefined && from !== undefined && to !== undefined
          ? `${from}–${to} / ${totalItems}`
          : t('dash.pageSafepageOfTotalpages', { safePage: page, totalPages })}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('common.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="sm"
              className="h-8 min-w-8 px-2 text-xs tabular-nums"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('common.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
