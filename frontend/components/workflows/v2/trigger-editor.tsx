'use client'

/**
 * Trigger picker: manual, schedule (cron), platform event (+ filter), or a
 * signed inbound webhook (URL + signing secret, shown once).
 */
import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CronPicker from '@/components/workflows/cron-picker'
import { EVENT_TYPES, eventTypeDef } from '@/lib/automation/event-types'
import type { Condition } from '@/lib/automation/conditions'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ConditionEditor, selectClass } from './fields'
import { triggerVariables } from './variables'

export interface TriggerValue {
  trigger: 'manual' | 'schedule' | 'webhook' | 'event'
  cron_expression?: string
  event_type?: string | null
  event_filter?: Condition | null
}

const OPTIONS: { value: TriggerValue['trigger']; label: string; hint: string }[] = [
  { value: 'event', label: 'When something happens', hint: 'A platform event, like a test submitted or a payment failed' },
  { value: 'schedule', label: 'On a schedule', hint: 'Every hour, day or week (UTC)' },
  { value: 'webhook', label: 'From another system', hint: 'A signed HTTPS request to this workflow’s URL' },
  { value: 'manual', label: 'Only when I run it', hint: 'Use Run now' },
]

export function TriggerEditor({ value, onChange, workflowId, hookUrl, secretHint }: {
  value: TriggerValue
  onChange: (v: TriggerValue) => void
  workflowId: string
  hookUrl: string
  secretHint?: string | null
}) {
  const [secret, setSecret] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(secretHint ?? null)
  const [err, setErr] = useState<string | null>(null)
  const groups = [...new Set(EVENT_TYPES.map((e) => e.group))]
  const def = value.event_type ? eventTypeDef(value.event_type) : undefined

  async function rotate() {
    setErr(null)
    const res = await csrfFetch(`/api/workflows/${workflowId}/secret`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setErr(json.error || 'Could not create the secret')
    setSecret(json.secret)
    setHint(json.hint)
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Trigger" className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value.trigger === o.value}
            onClick={() => onChange({ ...value, trigger: o.value, ...(o.value === 'schedule' && !value.cron_expression ? { cron_expression: '0 9 * * 1' } : {}) })}
            className={`rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${value.trigger === o.value ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-muted/40'}`}
          >
            <span className="block text-sm font-medium text-foreground">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>

      {value.trigger === 'event' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="wf-event-type" className="text-xs font-medium text-muted-foreground">Event</label>
            <select id="wf-event-type" className={selectClass} value={value.event_type || ''} onChange={(e) => onChange({ ...value, event_type: e.target.value || null })}>
              <option value="">Choose an event…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {EVENT_TYPES.filter((e) => e.group === g).map((e) => <option key={e.type} value={e.type}>{e.label}</option>)}
                </optgroup>
              ))}
            </select>
            {def && <p className="text-xs text-muted-foreground">{def.description}</p>}
          </div>
          {def && (
            <ConditionEditor
              label="Only when (optional)"
              value={value.event_filter || null}
              onChange={(c) => onChange({ ...value, event_filter: c })}
              vars={triggerVariables({ trigger: 'event', event_type: value.event_type })}
            />
          )}
        </div>
      )}

      {value.trigger === 'schedule' && (
        <div className="space-y-1">
          <CronPicker value={value.cron_expression || '0 9 * * 1'} onChange={(c) => onChange({ ...value, cron_expression: c })} />
          <p className="text-xs text-muted-foreground">Times are in UTC.</p>
        </div>
      )}

      {value.trigger === 'webhook' && (
        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1 font-mono text-xs text-foreground">{hookUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(hookUrl)} aria-label="Copy webhook URL"><Copy className="h-3.5 w-3.5" aria-hidden /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={rotate}><KeyRound className="h-3.5 w-3.5" aria-hidden /> {hint ? 'Rotate signing secret' : 'Create signing secret'}</Button>
            {hint && !secret && <span className="font-mono text-xs text-muted-foreground">{hint}</span>}
          </div>
          {secret && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground" role="status">
              Copy this secret now — it won’t be shown again:
              <code className="mt-1 block break-all font-mono">{secret}</code>
            </div>
          )}
          {err && <p className="text-xs text-destructive" role="alert">{err}</p>}
          <p className="text-xs text-muted-foreground">
            Send a JSON body with header <code className="font-mono">X-CodeSpectra-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256(secret, t + &quot;.&quot; + body)&gt;</code>.
            Requests older than 5 minutes are refused; an <code className="font-mono">Idempotency-Key</code> header prevents duplicate runs. The body becomes {'{{trigger.*}}'}.
          </p>
        </div>
      )}
    </div>
  )
}
