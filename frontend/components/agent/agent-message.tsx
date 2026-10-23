'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Bot, Check, ChevronDown, ExternalLink, FileText, Loader2, RotateCw, Sparkles, X } from 'lucide-react'
import type { KnowledgeHit, ProposedAction } from '@/lib/agent/contract'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { AgentMarkdown, safeHref } from './agent-markdown'
import { ProposalCard } from './proposal-card'
import { BundleCard, ClarifyCard, PlanChecklist } from './loop-parts'
import { actionIdsOf, citationsOf, stepLabel, STEP_LABEL_EN, type StepLabelT } from './transcript'
import type { ActionMap, BundleMap, UiItem, UiStep } from './types'
import { useAdminT, type AdminT } from '@/lib/i18n/admin'

type Step = UiStep

/** SEO-044: step labels, specialist names and source types from the admin catalog (copilot.*). */
function useStepT(): { a: AdminT; tr: StepLabelT; label: (tool: string, args: unknown, running: boolean) => string; agentName: (s: Step) => string; summary: (s: string) => string } {
  const a = useAdminT()
  const tr: StepLabelT = { step: (k, p) => a.td(`copilot.step.${k}`, STEP_LABEL_EN[k] ?? k, p), agent: (id, fb) => a.td(`copilot.specialist.${id}`, fb) }
  const DEFAULT_SUMMARY: Record<string, string> = { Stopped: a.t('copilot.stepStopped'), Failed: a.t('copilot.status.failed'), Done: a.t('copilot.status.done') }
  return {
    a,
    tr,
    label: (tool, args, running) => stepLabel(tool, args, running, tr),
    agentName: (s) => (s.agent ? tr.agent(s.agent.id, s.agent.label) : tr.agent('specialist', 'Specialist')),
    summary: (x) => DEFAULT_SUMMARY[x] ?? x,
  }
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground">
        {text}
      </div>
    </div>
  )
}

function StepIcon({ status }: { status: Step['status'] }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
  if (status === 'ok') return <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden />
  return <X className="h-3.5 w-3.5 text-destructive" aria-hidden />
}

function StepRow({ s }: { s: Step }) {
  const L = useStepT()
  return (
    <li className="text-sm">
      <span className="flex items-start gap-2">
        <span className="mt-0.5">{s.agent ? <Bot className="h-3.5 w-3.5 text-primary" aria-hidden /> : <StepIcon status={s.status} />}</span>
        <span className="min-w-0">
          <span className="text-foreground">{L.label(s.tool, s.args, s.status === 'running')}</span>
          {s.summary && s.status !== 'running' && <span className="text-muted-foreground"> — {L.summary(s.summary)}</span>}
          {!!s.retries && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <RotateCw className="h-3 w-3" aria-hidden /> {L.a.t('copilot.retried', { count: s.retries })}
            </span>
          )}
        </span>
      </span>
      {s.agent && (s.children?.length ?? 0) > 0 && (
        // Sub-agent timeline: the specialist's own steps, same permissions as yours.
        <ol className="ml-[7px] mt-1.5 space-y-1.5 border-l border-border/70 pl-4" aria-label={L.a.t('copilot.agentSteps', { agent: L.agentName(s) })}>
          {s.children!.map((c) => <StepRow key={c.id} s={c} />)}
        </ol>
      )}
    </li>
  )
}

function ToolSteps({ steps }: { steps: Step[] }) {
  const running = steps.some((s) => s.status === 'running' || s.children?.some((c) => c.status === 'running'))
  const [open, setOpen] = useState(false)
  const L = useStepT()
  const last = steps[steps.length - 1]
  const lastChild = last.children?.[last.children.length - 1]
  const heading = running
    ? lastChild && lastChild.status === 'running' ? `${L.agentName(last)}: ${L.label(lastChild.tool, lastChild.args, true)}` : L.label(last.tool, last.args, true)
    : steps.length === 1
      ? L.label(last.tool, last.args, false)
      : L.a.t('copilot.nSteps', { count: steps.length })
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{heading}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-border/70 px-3 py-2">
          {steps.map((s) => <StepRow key={s.id} s={s} />)}
        </ol>
      )}
    </div>
  )
}

function CitationChips({ hits }: { hits: KnowledgeHit[] }) {
  const { t, td } = useAdminT()
  if (!hits.length) return null
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={t('copilot.sources')}>
      {hits.slice(0, 10).map((h, i) => {
        const href = h.url ? safeHref(h.url) : ''
        return (
          <Popover key={`${h.source_type}:${h.source_id}`}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">{i + 1}</span>
                <span className="truncate">{h.title || t('copilot.source')}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] space-y-2" align="start">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                {td(`copilot.src.${h.source_type}`, h.source_type)}
              </div>
              <p className="text-sm font-semibold text-foreground">{h.title || t('copilot.source')}</p>
              {h.snippet && <p className="line-clamp-6 text-sm text-muted-foreground">{h.snippet}</p>}
              {href && (
                <Link
                  href={href}
                  target={href.startsWith('/') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t('copilot.openSource')} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </PopoverContent>
          </Popover>
        )
      })}
    </div>
  )
}

export function AssistantMessage({
  item,
  actions,
  bundles,
  onConfirm,
  onCancel,
  onEdit,
  onConfirmBundle,
  onCancelBundle,
  onAnswer,
  loadEditForm,
  canAnswer,
}: {
  item: Extract<UiItem, { kind: 'assistant' }>
  actions: ActionMap
  bundles?: BundleMap
  onConfirm: (id: string) => Promise<string | null>
  onCancel: (id: string) => Promise<string | null>
  onEdit: (id: string, args: Record<string, unknown>) => Promise<string | null>
  onConfirmBundle?: (id: string) => Promise<string | null>
  onCancelBundle?: (id: string) => Promise<string | null>
  onAnswer?: (text: string) => void
  loadEditForm?: (id: string) => Promise<{ schema: Record<string, unknown> | null; args: Record<string, unknown> } | string>
  canAnswer?: boolean
}) {
  // Group consecutive steps; proposals / bundles render right after their step group.
  const blocks: ({ kind: 'text'; text: string } | { kind: 'steps'; steps: Step[] } | { kind: 'clarify'; question: string; options?: string[] })[] = []
  for (const p of item.parts) {
    if (p.type === 'text') {
      if (p.text.trim()) blocks.push({ kind: 'text', text: p.text })
    } else if (p.type === 'clarify') {
      blocks.push({ kind: 'clarify', question: p.question, options: p.options })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'steps') last.steps.push(p)
      else blocks.push({ kind: 'steps', steps: [p] })
    }
  }
  const { t } = useAdminT()
  const citations = citationsOf(item.parts)
  const empty = !blocks.length && !item.error && !item.plan?.length

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary" aria-hidden>
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {item.plan && item.plan.length > 0 && <PlanChecklist steps={item.plan} />}
        {empty && item.streaming && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('copilot.thinking')}
          </p>
        )}
        {blocks.map((b, i) =>
          b.kind === 'text' ? (
            <AgentMarkdown key={i} text={b.text} />
          ) : b.kind === 'clarify' ? (
            <ClarifyCard key={i} question={b.question} options={b.options} onAnswer={onAnswer} disabled={!canAnswer} />
          ) : (
            <div key={i} className="space-y-3">
              <ToolSteps steps={b.steps} />
              {actionIdsOf(b.steps)
                .map((id) => actions[id])
                .filter((a): a is ProposedAction => !!a && !a.bundle_id)
                .map((a) => (
                  <ProposalCard key={a.id} action={a} onConfirm={onConfirm} onCancel={onCancel} onEdit={onEdit} loadEditForm={loadEditForm} />
                ))}
              {b.steps
                .map((s) => (s.bundleId && bundles ? bundles[s.bundleId] : undefined))
                .filter((x): x is NonNullable<typeof x> => !!x)
                .map((bd) => (
                  <BundleCard key={bd.id} bundle={bd} actions={actions} onConfirm={onConfirmBundle ?? (async () => t('copilot.bundlesUnavailable'))} onCancel={onCancelBundle ?? (async () => null)} />
                ))}
            </div>
          ),
        )}
        {item.streaming && item.revised && (
          <p className="text-xs text-muted-foreground" role="status">{t('copilot.selfCheck')}</p>
        )}
        {citations.length > 0 && <CitationChips hits={citations} />}
        {item.error && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {item.error}
          </p>
        )}
      </div>
    </div>
  )
}
