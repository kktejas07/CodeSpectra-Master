'use client'

/**
 * Pipeline builder: ordered stage cards with drag-to-reorder (mouse/touch via
 * HTML drag and drop) and keyboard reorder (focus the handle, use arrow keys),
 * per-stage settings and per-type config. State lives in pipelineReducer.
 */
import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Lock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/ats/contract'
import { ADDABLE_STAGE_TYPES, FIXED_TYPES, PIPELINE_TEMPLATES, movableRange, type PipelineAction } from '../lib/pipeline-builder'
import { STAGE_TYPE_HINTS, STAGE_TYPE_LABELS } from '../lib/labels'
import { Field, NativeSelect } from '../ui'
import { StageConfigForm, type StageConfigDeps } from './stage-config'

export function PipelineBuilder({
  stages,
  dispatch,
  deps,
  onTemplate,
}: {
  stages: PipelineStage[]
  dispatch: (a: PipelineAction) => void
  deps: StageConfigDeps
  onTemplate: (build: () => PipelineStage[]) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [announce, setAnnounce] = useState('')
  const [lo, hi] = movableRange(stages)
  const handles = useRef(new Map<string, HTMLButtonElement | null>())

  const shift = (s: PipelineStage, delta: -1 | 1) => {
    const i = stages.findIndex((x) => x.id === s.id)
    const to = i + delta
    if (to < lo || to > hi) return
    dispatch({ type: 'shift', id: s.id, delta })
    setAnnounce(`${s.name} moved to position ${to + 1} of ${stages.length}`)
    requestAnimationFrame(() => handles.current.get(s.id)?.focus())
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Start from a template:</span>
        {PIPELINE_TEMPLATES.map((t) => (
          <Button key={t.id} type="button" variant="outline" size="sm" className="rounded-full" title={t.description} onClick={() => onTemplate(t.build)}>
            {t.name}
          </Button>
        ))}
      </div>

      <p className="sr-only" aria-live="assertive">{announce}</p>
      <ol className="space-y-2" aria-label="Pipeline stages">
        {stages.map((s, i) => {
          const fixed = FIXED_TYPES.has(s.type)
          const expanded = open === s.id
          return (
            <li
              key={s.id}
              onDragOver={(e) => {
                if (!dragId || i < lo || i > hi) return
                e.preventDefault()
                setOverIdx(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && overIdx != null) dispatch({ type: 'move', id: dragId, to: overIdx })
                setDragId(null)
                setOverIdx(null)
              }}
              className={cn(
                'rounded-2xl border bg-card transition-colors',
                overIdx === i && dragId && dragId !== s.id ? 'border-primary' : 'border-border/70',
                dragId === s.id && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-2 p-3">
                {fixed ? (
                  <span className="flex h-8 w-8 items-center justify-center text-muted-foreground" title="This stage stays in place">
                    <Lock className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Fixed stage</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    ref={(el) => { handles.current.set(s.id, el) }}
                    draggable
                    onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id) }}
                    onDragEnd={() => { setDragId(null); setOverIdx(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); shift(s, -1) }
                      if (e.key === 'ArrowDown') { e.preventDefault(); shift(s, 1) }
                    }}
                    className="flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    aria-label={`Reorder ${s.name}. Use the up and down arrow keys.`}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <span className="w-6 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s.id)}
                  aria-expanded={expanded}
                  aria-controls={`stage-panel-${s.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{s.name || 'Untitled stage'}</span>
                    <span className="block truncate text-xs text-muted-foreground">{STAGE_TYPE_LABELS[s.type]}</span>
                  </span>
                  {!fixed && s.type !== 'applied' && (
                    <Badge variant={s.advance === 'auto' ? 'secondary' : 'outline'} className="hidden sm:inline-flex">
                      {s.advance === 'auto' ? 'Moves automatically' : 'Needs approval'}
                    </Badge>
                  )}
                  {s.client_visible && <Badge variant="outline" className="hidden md:inline-flex">Client sees</Badge>}
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
                </button>
                {!fixed && (
                  <div className="flex shrink-0 items-center">
                    <Button type="button" variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={() => shift(s, -1)} disabled={i <= lo} aria-label={`Move ${s.name} up`}><ArrowUp aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={() => shift(s, 1)} disabled={i >= hi} aria-label={`Move ${s.name} down`}><ArrowDown aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => dispatch({ type: 'remove', id: s.id })} aria-label={`Remove ${s.name}`}><Trash2 aria-hidden /></Button>
                  </div>
                )}
              </div>

              {expanded && (
                <div id={`stage-panel-${s.id}`} className="space-y-5 border-t border-border/70 p-4">
                  <p className="text-xs text-muted-foreground">{STAGE_TYPE_HINTS[s.type]}</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Stage name" htmlFor={`sn-${s.id}`} className="sm:col-span-2">
                      <Input id={`sn-${s.id}`} value={s.name} maxLength={60} onChange={(e) => dispatch({ type: 'update', id: s.id, patch: { name: e.target.value } })} />
                    </Field>
                    {s.type !== 'hired' && s.type !== 'rejected' && (
                      <>
                        <Field label="When they pass" htmlFor={`adv-${s.id}`}>
                          <NativeSelect
                            id={`adv-${s.id}`}
                            value={s.advance}
                            onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { advance: v as PipelineStage['advance'] } })}
                            options={[{ value: 'auto', label: 'Move on automatically' }, { value: 'approval', label: 'Wait for my approval' }]}
                          />
                        </Field>
                        <Field label="When they fail" htmlFor={`fail-${s.id}`}>
                          <NativeSelect
                            id={`fail-${s.id}`}
                            value={s.on_fail}
                            onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { on_fail: v as PipelineStage['on_fail'] } })}
                            options={[{ value: 'reject', label: 'Reject' }, { value: 'hold', label: 'Put on hold' }, { value: 'review', label: 'Ask me to review' }]}
                          />
                        </Field>
                        <Field label="Time limit (days)" htmlFor={`sla-${s.id}`} hint="Flag candidates stuck longer. Empty = no limit.">
                          <Input
                            id={`sla-${s.id}`}
                            type="number"
                            min={1}
                            max={180}
                            value={s.sla_days ?? ''}
                            onChange={(e) => dispatch({ type: 'update', id: s.id, patch: { sla_days: e.target.value ? Math.max(1, Number(e.target.value)) : null } })}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Toggle label="Client can see" checked={!!s.client_visible} onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { client_visible: v } })} />
                    <Toggle label="Email the candidate" checked={!!s.notify?.email} onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { notify: { ...s.notify, email: v } } })} />
                    <Toggle label="WhatsApp the candidate" checked={!!s.notify?.whatsapp} onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { notify: { ...s.notify, whatsapp: v } } })} />
                    <Toggle label="Tell the client" checked={!!s.notify?.client} onChange={(v) => dispatch({ type: 'update', id: s.id, patch: { notify: { ...s.notify, client: v } } })} />
                  </div>
                  <StageConfigForm stage={s} deps={deps} onConfig={(patch) => dispatch({ type: 'config', id: s.id, patch })} />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="rounded-full"><Plus aria-hidden /> Add stage</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {ADDABLE_STAGE_TYPES.map((t) => (
            <DropdownMenuItem key={t} onSelect={() => dispatch({ type: 'add', stageType: t })} className="flex-col items-start gap-0.5">
              <span className="font-medium">{STAGE_TYPE_LABELS[t]}</span>
              <span className="text-xs text-muted-foreground">{STAGE_TYPE_HINTS[t]}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}
