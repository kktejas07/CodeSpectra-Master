'use client'

/**
 * Loop-v2 UI pieces for the copilot: the plan checklist (ticked off as tools
 * finish), a clarifying question with quick answers, and the bundle card
 * (linked drafts confirmed together, run in order, stop at first failure).
 */
import { useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Circle, CircleDashed, CircleSlash, Layers, ListChecks, Loader2, MessageCircleQuestion, X } from 'lucide-react'
import type { ProposalBundle, ProposedAction } from '@/lib/agent/contract'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/lib/confirm-context'
import { useAdminT } from '@/lib/i18n/admin'
import { cn } from '@/lib/utils'
import type { PlanStep } from './types'

// ─── Plan checklist ─────────────────────────────────────────────────────────

function PlanIcon({ status }: { status: PlanStep['status'] }) {
  switch (status) {
    case 'done': return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden />
    case 'active': return <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
    case 'failed': return <X className="h-4 w-4 text-destructive" aria-hidden />
    case 'skipped': return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
    default: return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
  }
}

export function PlanChecklist({ steps }: { steps: PlanStep[] }) {
  const { t } = useAdminT()
  if (!steps.length) return null
  const done = steps.filter((s) => s.status === 'done').length
  return (
    <section className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3" aria-label={t('copilot.planLabel')}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <ListChecks className="h-4 w-4 text-primary" aria-hidden />
        {t('copilot.planLabel')}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{t('copilot.planDone', { done, total: steps.length })}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5"><PlanIcon status={s.status} /></span>
            <span className={cn('min-w-0', s.status === 'done' && 'text-muted-foreground', s.status === 'skipped' && 'text-muted-foreground line-through')}>
              {s.title}
              <span className="sr-only"> — {t(`copilot.plan.${s.status}`)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Clarifying question ────────────────────────────────────────────────────

export function ClarifyCard({ question, options, onAnswer, disabled }: { question: string; options?: string[]; onAnswer?: (text: string) => void; disabled?: boolean }) {
  const { t } = useAdminT()
  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3" aria-label={t('copilot.clarifyLabel')}>
      <p className="flex items-start gap-2 text-[15px] leading-relaxed text-foreground">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>{question}</span>
      </p>
      {!!options?.length && onAnswer && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((o) => (
            <Button key={o} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onAnswer(o)} className="min-h-9 rounded-full">
              {o}
            </Button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{options?.length ? t('copilot.replyOrPick') : t('copilot.replyBelow')}</p>
    </section>
  )
}

// ─── Bundle card ────────────────────────────────────────────────────────────

const BUNDLE_STATUS: Record<ProposalBundle['status'], { label: 'pending' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled' | 'expired'; tone: 'secondary' | 'success' | 'outline' }> = {
  pending: { label: 'pending', tone: 'secondary' },
  executing: { label: 'running', tone: 'secondary' },
  done: { label: 'done', tone: 'success' },
  partial: { label: 'partial', tone: 'outline' },
  failed: { label: 'failed', tone: 'outline' },
  cancelled: { label: 'cancelled', tone: 'outline' },
  expired: { label: 'expired', tone: 'outline' },
}

function StepState({ action }: { action?: ProposedAction }) {
  const { t } = useAdminT()
  const st = action?.status
  if (st === 'done') return <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-label={t('copilot.status.done')} />
  if (st === 'failed') return <X className="h-4 w-4 text-destructive" aria-label={t('copilot.status.failed')} />
  if (st === 'cancelled' || st === 'expired') return <CircleSlash className="h-4 w-4 text-muted-foreground" aria-label={t('copilot.notRun')} />
  if (st === 'executing' || st === 'confirmed') return <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-label={t('copilot.status.running')} />
  return <Circle className="h-4 w-4 text-muted-foreground" aria-label={t('copilot.waiting')} />
}

export function BundleCard({
  bundle,
  actions,
  onConfirm,
  onCancel,
}: {
  bundle: ProposalBundle
  actions: Record<string, ProposedAction>
  onConfirm: (id: string) => Promise<string | null>
  onCancel: (id: string) => Promise<string | null>
}) {
  const confirmDialog = useConfirm()
  const { t } = useAdminT()
  const [busy, setBusy] = useState<null | 'confirm' | 'cancel'>(null)
  const [err, setErr] = useState<string | null>(null)
  const steps = bundle.action_ids.map((id) => actions[id])
  const expired = bundle.status === 'pending' && Date.parse(bundle.expires_at) <= Date.now()
  const status = expired ? 'expired' : bundle.status
  const pending = status === 'pending'
  const risky = steps.some((a) => a && ['send', 'publish', 'delete', 'money'].includes(a.risk))
  const results = new Map((bundle.results ?? []).map((r) => [r.action_id, r]))

  const run = async (kind: 'confirm' | 'cancel') => {
    if (kind === 'confirm') {
      const ok = await confirmDialog({
        title: t('copilot.bundleRunTitle'),
        description: t(risky ? 'copilot.bundleRunDescRisky' : 'copilot.bundleRunDesc', { title: bundle.title, count: steps.length }),
        confirmText: t('copilot.runAllSteps'),
        destructive: steps.some((a) => a?.risk === 'delete' || a?.risk === 'money'),
      })
      if (!ok) return
    }
    setBusy(kind)
    setErr(null)
    try {
      setErr(await (kind === 'confirm' ? onConfirm(bundle.id) : onCancel(bundle.id)))
    } catch {
      setErr(t('copilot.requestFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className={cn('rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,41,0.04)] dark:shadow-none sm:p-5', pending ? 'border-primary/40' : 'border-border')}
      aria-label={t('copilot.bundleLabel', { title: bundle.title })}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary"><Layers className="h-3.5 w-3.5" aria-hidden /> {t('copilot.bundleOf', { count: steps.length })}</p>
          <h4 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">{bundle.title}</h4>
          {bundle.summary && <p className="mt-1 text-sm text-muted-foreground">{bundle.summary}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {risky && <Badge variant="warning" className="text-amber-700 dark:text-amber-400"><AlertTriangle aria-hidden />{t('copilot.sendsOrPublishes')}</Badge>}
          <Badge variant={BUNDLE_STATUS[status].tone}>{t(`copilot.status.${BUNDLE_STATUS[status].label}`)}</Badge>
        </div>
      </div>

      <ol className="mt-4 space-y-2">
        {bundle.action_ids.map((id, i) => {
          const a = actions[id]
          const r = results.get(id)
          return (
            <li key={id} className="flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{a?.title ?? t('copilot.draft')}</span>
                {r && <span className={cn('block text-xs', r.ok ? 'text-muted-foreground' : 'text-destructive')}>{r.message}</span>}
              </span>
              <span className="mt-0.5"><StepState action={a} /></span>
            </li>
          )
        })}
      </ol>

      {status === 'partial' || status === 'failed' ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t('copilot.stoppedAt', { n: (bundle.stopped_at ?? 0) + 1 })}
        </p>
      ) : null}
      {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}

      {pending && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => run('confirm')} disabled={!!busy} className="min-h-11 sm:min-h-9">
            {busy === 'confirm' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            {t('copilot.confirmAll')}
          </Button>
          <Button variant="ghost" onClick={() => run('cancel')} disabled={!!busy} className="min-h-11 sm:min-h-9">
            {busy === 'cancel' ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
            {t('copilot.cancelBundle')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('copilot.bundleOrderHint')}</span>
        </div>
      )}
    </section>
  )
}
