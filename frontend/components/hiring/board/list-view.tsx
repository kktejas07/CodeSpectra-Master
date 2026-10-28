'use client'

/** Table view of a job's applications with selection and bulk actions. */
import { useMemo, useState } from 'react'
import { ArrowRightLeft, Ban, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import type { PipelineStage } from '@/lib/ats/contract'
import type { BoardApplication } from '../lib/types'
import { isOverdue, latestResult, type BoardColumn } from '../lib/board'
import { APP_STATUS_LABELS, SOURCE_LABELS, daysSince, durationLabel } from '../lib/labels'
import { MatchScore } from '../ui'
import { useT } from '@/lib/i18n/client'

export function ApplicationsList({
  columns,
  onOpen,
  onBulkMove,
  onBulkReject,
  onBulkRescreen,
  rescreening,
}: {
  columns: BoardColumn[]
  onOpen: (a: BoardApplication) => void
  onBulkMove: (ids: string[]) => void
  onBulkReject: (ids: string[]) => void
  onBulkRescreen: (ids: string[]) => void
  rescreening?: boolean
}) {
  const { t } = useT()
  const rows = useMemo(() => columns.flatMap((c) => c.applications.map((a) => ({ a, stage: c.stage }))), [columns])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const visible = new Set(rows.map((r) => r.a.id))
  const selected = [...sel].filter((id) => visible.has(id))
  const allOn = rows.length > 0 && selected.length === rows.length
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-3">
      <div className="flex min-h-10 flex-wrap items-center gap-2" aria-live="polite">
        {selected.length > 0 ? (
          <>
            <span className="text-sm font-medium tabular-nums text-foreground">{t('hiring.countSelected', { count: selected.length })}</span>
            <Button size="sm" variant="outline" onClick={() => onBulkMove(selected)}><ArrowRightLeft aria-hidden />{' '}{t('hiring.move')}</Button>
            <Button size="sm" variant="outline" onClick={() => onBulkReject(selected)}><Ban aria-hidden />{' '}{t('hiring.reject')}</Button>
            <Button size="sm" variant="outline" onClick={() => onBulkRescreen(selected)} disabled={rescreening}><RefreshCcw aria-hidden />{' '}{t('hiring.rescreen')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>{t('hiring.clear')}</Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{t('hiring.selectCandidatesToMoveRejectOr181')}</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  checked={allOn ? true : selected.length ? 'indeterminate' : false}
                  onCheckedChange={(v) => setSel(v ? new Set(rows.map((r) => r.a.id)) : new Set())}
                  aria-label={t('hiring.selectAll')}
                />
              </th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.candidate')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.stage')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.match')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.latestResult')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.inStage')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('hiring.source')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ a, stage }) => (
              <Row key={a.id} a={a} stage={stage} checked={sel.has(a.id)} onToggle={() => toggle(a.id)} onOpen={() => onOpen(a)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ a, stage, checked, onToggle, onOpen }: { a: BoardApplication; stage: PipelineStage; checked: boolean; onToggle: () => void; onOpen: () => void }) {
  const { t } = useT()
  const r = latestResult(a)
  const overdue = isOverdue(a, stage)
  return (
    <tr className={checked ? 'bg-primary/5' : 'hover:bg-muted/30'}>
      <td className="px-3 py-2.5"><Checkbox checked={checked} onCheckedChange={onToggle} aria-label={t('hiring.selectValue', { value: a.candidate?.name ?? 'candidate' })} /></td>
      <td className="px-3 py-2.5">
        <button type="button" onClick={onOpen} className="text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {a.candidate?.name || t('hiring.candidate')}
        </button>
        <p className="text-xs text-muted-foreground">{a.candidate?.email || a.candidate?.phone}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-foreground">{stage.name}</span>
        <div className="mt-0.5 flex gap-1">
          {a.status !== 'active' && <Badge variant="outline">{APP_STATUS_LABELS[a.status]}</Badge>}
          {a.pending_move && <Badge variant="secondary">{t('hiring.needsApproval')}</Badge>}
        </div>
      </td>
      <td className="px-3 py-2.5"><MatchScore score={a.match?.score} /></td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {r ? `${r.outcome === 'pass' ? 'Passed' : r.outcome === 'fail' ? 'Failed' : 'Waiting'}${r.score != null ? ` · ${Math.round(r.score)}` : ''}` : '—'}
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${overdue ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{durationLabel(daysSince(a.stage_entered_at))}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{SOURCE_LABELS[a.source] ?? a.source}</td>
    </tr>
  )
}
