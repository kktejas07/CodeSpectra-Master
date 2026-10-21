'use client'

/**
 * Kanban board by the job's stages. Drag a card to another column (mouse or
 * touch-capable pointer via HTML drag and drop) or use the card's "Move"
 * menu from the keyboard; both open the reason dialog before anything moves.
 */
import { useState } from 'react'
import { AlertTriangle, Clock, Hourglass, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/ats/contract'
import type { BoardApplication } from '../lib/types'
import { isOverdue, latestResult, type BoardColumn } from '../lib/board'
import { daysSince, durationLabel, initials } from '../lib/labels'
import { MatchScore } from '../ui'
import { useT } from '@/lib/i18n/client'

export function PipelineBoard({
  columns,
  onOpen,
  onRequestMove,
  onReject,
  onApprove,
}: {
  columns: BoardColumn[]
  onOpen: (app: BoardApplication) => void
  onRequestMove: (app: BoardApplication, to: string) => void
  onReject: (app: BoardApplication) => void
  onApprove: (app: BoardApplication, accept: boolean) => void
}) {
  const { t } = useT()
  const [dragging, setDragging] = useState<BoardApplication | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const stages = columns.map((c) => c.stage)

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0" role="region" aria-label={t('hiring.pipelineBoard')} tabIndex={0}>
      <div className="flex min-w-max gap-3">
        {columns.map(({ stage, applications }) => (
          <section
            key={stage.id}
            aria-label={t('hiring.nameCountCandidates', { count: applications.length, name: stage.name })}
            onDragOver={(e) => { if (dragging && dragging.stage_id !== stage.id) { e.preventDefault(); setOver(stage.id) } }}
            onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging && dragging.stage_id !== stage.id) onRequestMove(dragging, stage.id)
              setDragging(null)
              setOver(null)
            }}
            className={cn(
              'flex w-[17rem] shrink-0 flex-col rounded-3xl border bg-muted/30 transition-colors',
              over === stage.id ? 'border-primary bg-primary/5' : 'border-border/70',
            )}
          >
            <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
              <h3 className="truncate text-sm font-semibold text-foreground">{stage.name}</h3>
              <span className="rounded-full bg-background px-2 text-xs font-semibold tabular-nums text-muted-foreground">{applications.length}</span>
            </header>
            <ul className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {applications.length === 0 && (
                <li className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {dragging ? t('hiring.dropHere') : t('hiring.noOneHereYet')}
                </li>
              )}
              {applications.map((a) => (
                <BoardCard
                  key={a.id}
                  app={a}
                  stage={stage}
                  stages={stages}
                  dragging={dragging?.id === a.id}
                  onDragStart={() => setDragging(a)}
                  onDragEnd={() => { setDragging(null); setOver(null) }}
                  onOpen={() => onOpen(a)}
                  onRequestMove={(to) => onRequestMove(a, to)}
                  onReject={() => onReject(a)}
                  onApprove={(accept) => onApprove(a, accept)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function BoardCard({
  app,
  stage,
  stages,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onRequestMove,
  onReject,
  onApprove,
}: {
  app: BoardApplication
  stage: PipelineStage
  stages: PipelineStage[]
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onOpen: () => void
  onRequestMove: (to: string) => void
  onReject: () => void
  onApprove: (accept: boolean) => void
}) {
  const { t } = useT()
  const result = latestResult(app)
  const days = daysSince(app.stage_entered_at)
  const overdue = isOverdue(app, stage)
  const pendingTo = app.pending_move ? stages.find((s) => s.id === app.pending_move!.to)?.name ?? app.pending_move.to : null
  const resultStage = result ? stages.find((s) => s.id === result.stage_id)?.name : null

  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', app.id); onDragStart() }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative cursor-grab rounded-2xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(15,23,41,0.04)] transition-[border-color,opacity] hover:border-primary/40 active:cursor-grabbing dark:shadow-none',
        dragging && 'opacity-50',
        app.status === 'on_hold' && 'border-dashed',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(app.candidate?.name)}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-sm font-semibold text-foreground after:absolute after:inset-0 after:rounded-2xl hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {app.candidate?.name || t('hiring.candidate')}
          </button>
          <p className="truncate text-xs text-muted-foreground">{app.candidate?.titles?.[0] || app.candidate?.location || app.candidate?.email || ' '}</p>
        </div>
        <MatchScore score={app.match?.score} />
      </div>

      {result && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          <span className={cn('font-medium', result.outcome === 'pass' ? 'text-green-700 dark:text-green-400' : result.outcome === 'fail' ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>
            {result.outcome === 'pass' ? t('hiring.passed') : result.outcome === 'fail' ? t('hiring.failed') : t('hiring.waiting')}
          </span>
          {resultStage ? ` ${resultStage}` : ''}
          {result.score != null ? ` · ${Math.round(result.score)}` : ''}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] tabular-nums', overdue ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
          {overdue ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}
          {durationLabel(days)}
          {overdue && <span className="sr-only">{' '}{t('hiring.overTheTimeLimit')}</span>}
        </span>
        {app.status === 'on_hold' && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t('hiring.onHold')}</span>}
        {pendingTo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Hourglass className="h-3 w-3" aria-hidden />{' '}{t('hiring.approvePendingto', { pendingTo })}</span>
        )}
      </div>

      {app.pending_move && (
        <div className="relative z-10 mt-2 flex gap-1.5">
          <Button size="sm" className="h-7 flex-1" onClick={() => onApprove(true)}>{t('hiring.approve')}</Button>
          <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => onApprove(false)}>{t('hiring.decline')}</Button>
        </div>
      )}

      <div className="absolute right-1.5 top-10 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('hiring.actionsForValue', { value: app.candidate?.name ?? 'candidate' })}><MoreHorizontal aria-hidden /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onOpen}>{t('hiring.openProfile')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('hiring.moveTo2')}</DropdownMenuLabel>
            {stages.filter((s) => s.id !== app.stage_id && s.type !== 'rejected').map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => onRequestMove(s.id)}>{s.name}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onReject} className="text-red-700 focus:text-red-700 dark:text-red-400">{t('hiring.reject')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
