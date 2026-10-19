'use client'

/**
 * Per-type configuration forms for a pipeline stage (assessment, bot screen,
 * interview, offer). Controlled: every change goes up as a config patch.
 */
import Link from 'next/link'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import type { AtsMember, BotChannel, MeetingProvider, PipelineStage, StageConfig } from '@/lib/ats/contract'
import { CHANNEL_LABELS, PROVIDER_LABELS } from '../lib/labels'
import { Field, NativeSelect } from '../ui'

type Cfg<K extends StageConfig['kind']> = Extract<StageConfig, { kind: K }>
type Question = Cfg<'bot_screen'>['questions'][number]

export interface StageConfigDeps {
  exams: { id: string; title: string }[]
  examsLoading?: boolean
  members: AtsMember[]
  /** provider → connected; livekit and manual are always available */
  connected: Partial<Record<MeetingProvider, boolean>>
}

const num = (v: string, fallback: number | null = null) => {
  if (v.trim() === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const rid = () => `q_${Math.random().toString(36).slice(2, 8)}`

export function StageConfigForm({
  stage,
  onConfig,
  deps,
}: {
  stage: PipelineStage
  onConfig: (patch: Record<string, unknown>) => void
  deps: StageConfigDeps
}) {
  const c = stage.config
  const pid = `st-${stage.id}`
  if (!c) return null

  if (c.kind === 'screening') {
    return <p className="text-sm text-muted-foreground">Uses the screening criteria above. Candidates at or above the pass score move on.</p>
  }

  if (c.kind === 'assessment') {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Test" htmlFor={`${pid}-exam`} className="sm:col-span-3" hint={deps.exams.length === 0 && !deps.examsLoading ? 'No tests yet — create one in Assessments first.' : undefined}>
          <NativeSelect
            id={`${pid}-exam`}
            value={c.exam_id ?? ''}
            onChange={(v) => onConfig({ exam_id: v || null })}
            placeholder={deps.examsLoading ? 'Loading tests…' : 'Choose a test'}
            options={deps.exams.map((e) => ({ value: e.id, label: e.title }))}
          />
        </Field>
        <Field label="Pass score (%)" htmlFor={`${pid}-pass`}>
          <Input id={`${pid}-pass`} type="number" min={0} max={100} inputMode="numeric" value={c.pass_score} onChange={(e) => onConfig({ pass_score: num(e.target.value, 0) })} />
        </Field>
        <Field label="Deadline (days)" htmlFor={`${pid}-deadline`} hint="Days to finish after the invite.">
          <Input id={`${pid}-deadline`} type="number" min={1} max={60} inputMode="numeric" value={c.deadline_days ?? ''} onChange={(e) => onConfig({ deadline_days: num(e.target.value) ?? undefined })} />
        </Field>
      </div>
    )
  }

  if (c.kind === 'bot_screen') {
    const all: BotChannel[] = ['whatsapp_chat', 'whatsapp_call', 'phone_call']
    const setQ = (i: number, patch: Partial<Question>) => onConfig({ questions: c.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
    const moveCh = (i: number, d: -1 | 1) => {
      const next = c.channels.slice()
      const j = i + d
      if (j < 0 || j >= next.length) return
      ;[next[i], next[j]] = [next[j], next[i]]
      onConfig({ channels: next })
    }
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-foreground">Channels, tried in order</p>
          <p className="mb-2 text-xs text-muted-foreground">The bot only contacts candidates who agreed to WhatsApp messages or calls.</p>
          <ol className="space-y-1.5">
            {c.channels.map((ch, i) => (
              <li key={ch} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <span className="w-5 tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 text-foreground">{CHANNEL_LABELS[ch]}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCh(i, -1)} disabled={i === 0} aria-label={`Move ${CHANNEL_LABELS[ch]} up`}><ArrowUp aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCh(i, 1)} disabled={i === c.channels.length - 1} aria-label={`Move ${CHANNEL_LABELS[ch]} down`}><ArrowDown aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ channels: c.channels.filter((x) => x !== ch) })} aria-label={`Remove ${CHANNEL_LABELS[ch]}`}><Trash2 aria-hidden /></Button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap gap-2">
            {all.filter((ch) => !c.channels.includes(ch)).map((ch) => (
              <Button key={ch} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onConfig({ channels: [...c.channels, ch] })}>
                <Plus aria-hidden /> {CHANNEL_LABELS[ch]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Language" htmlFor={`${pid}-lang`}>
            <NativeSelect
              id={`${pid}-lang`}
              value={c.language ?? 'en-IN'}
              onChange={(v) => onConfig({ language: v })}
              options={[
                { value: 'en-IN', label: 'English (India)' },
                { value: 'en-US', label: 'English (US)' },
                { value: 'hi-IN', label: 'Hindi' },
                { value: 'te-IN', label: 'Telugu' },
                { value: 'ta-IN', label: 'Tamil' },
                { value: 'kn-IN', label: 'Kannada' },
                { value: 'mr-IN', label: 'Marathi' },
              ]}
            />
          </Field>
          <Field label="Pass score (%)" htmlFor={`${pid}-bpass`}>
            <Input id={`${pid}-bpass`} type="number" min={0} max={100} value={c.pass_score} onChange={(e) => onConfig({ pass_score: num(e.target.value, 0) })} />
          </Field>
          <Field label="Attempts" htmlFor={`${pid}-att`} hint="Tries before giving up.">
            <Input id={`${pid}-att`} type="number" min={1} max={5} value={c.max_attempts ?? 2} onChange={(e) => onConfig({ max_attempts: num(e.target.value, 2) })} />
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Questions</p>
          {c.questions.map((q, i) => (
            <div key={q.id} className="space-y-3 rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
                <Textarea
                  aria-label={`Question ${i + 1}`}
                  value={q.text}
                  rows={2}
                  onChange={(e) => setQ(i, { text: e.target.value })}
                  placeholder="What should the bot ask?"
                  className="min-h-0 flex-1"
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ questions: c.questions.filter((_, j) => j !== i) })} aria-label={`Delete question ${i + 1}`}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid gap-3 pl-7 sm:grid-cols-3">
                <Field label="Answer type" htmlFor={`${pid}-qt-${q.id}`}>
                  <NativeSelect
                    id={`${pid}-qt-${q.id}`}
                    value={q.type}
                    onChange={(v) => setQ(i, { type: v as Question['type'], knockout: undefined, options: v === 'choice' ? q.options ?? ['', ''] : undefined })}
                    options={[
                      { value: 'open', label: 'Open answer' },
                      { value: 'yes_no', label: 'Yes / no' },
                      { value: 'number', label: 'Number' },
                      { value: 'choice', label: 'Choice' },
                    ]}
                  />
                </Field>
                {q.type === 'yes_no' && (
                  <Field label="Knockout" htmlFor={`${pid}-ko-${q.id}`} hint="Fail the screen on this answer.">
                    <NativeSelect
                      id={`${pid}-ko-${q.id}`}
                      value={q.knockout?.equals === true ? 'yes' : q.knockout?.equals === false ? 'no' : ''}
                      onChange={(v) => setQ(i, { knockout: v ? { equals: v === 'yes' } : undefined })}
                      placeholder="No knockout"
                      options={[{ value: 'no', label: 'Fail if "no"' }, { value: 'yes', label: 'Fail if "yes"' }]}
                    />
                  </Field>
                )}
                {q.type === 'number' && (
                  <>
                    <Field label="Fail below" htmlFor={`${pid}-min-${q.id}`}>
                      <Input id={`${pid}-min-${q.id}`} type="number" value={q.knockout?.min ?? ''} onChange={(e) => setQ(i, { knockout: { ...q.knockout, min: num(e.target.value) ?? undefined } })} />
                    </Field>
                    <Field label="Fail above" htmlFor={`${pid}-max-${q.id}`}>
                      <Input id={`${pid}-max-${q.id}`} type="number" value={q.knockout?.max ?? ''} onChange={(e) => setQ(i, { knockout: { ...q.knockout, max: num(e.target.value) ?? undefined } })} />
                    </Field>
                  </>
                )}
                {q.type === 'choice' && (
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium text-foreground">Options</p>
                    {(q.options ?? []).map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input aria-label={`Option ${oi + 1}`} value={o} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, k) => (k === oi ? e.target.value : x)) })} />
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name={`${pid}-ko-${q.id}`}
                            checked={q.knockout?.equals === o && o !== ''}
                            onChange={() => setQ(i, { knockout: { equals: o } })}
                          />
                          Knockout
                        </label>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQ(i, { options: (q.options ?? []).filter((_, k) => k !== oi) })} aria-label={`Remove option ${oi + 1}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setQ(i, { options: [...(q.options ?? []), ''] })}><Plus aria-hidden /> Option</Button>
                      {q.knockout && <Button type="button" variant="ghost" size="sm" onClick={() => setQ(i, { knockout: undefined })}>Clear knockout</Button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onConfig({ questions: [...c.questions, { id: rid(), text: '', type: 'open' }] })}>
            <Plus aria-hidden /> Add question
          </Button>
        </div>
      </div>
    )
  }

  if (c.kind === 'interview') {
    const providers: MeetingProvider[] = ['livekit', 'zoom', 'google_meet', 'teams', 'manual']
    const provider = c.provider ?? 'livekit'
    const needsConnect = provider !== 'livekit' && provider !== 'manual' && !deps.connected[provider]
    const panelable = deps.members.filter((m) => m.status !== 'disabled' && m.user_id && m.role !== 'client')
    const togglePanel = (uid: string) =>
      onConfig({ panel_ids: c.panel_ids.includes(uid) ? c.panel_ids.filter((x) => x !== uid) : [...c.panel_ids, uid] })
    const crit = c.scorecard.criteria
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Format" htmlFor={`${pid}-mode`}>
            <NativeSelect
              id={`${pid}-mode`}
              value={c.mode}
              onChange={(v) => onConfig({ mode: v, provider: v === 'virtual' ? provider : undefined })}
              options={[{ value: 'virtual', label: 'Video' }, { value: 'f2f', label: 'Face to face' }]}
            />
          </Field>
          {c.mode === 'virtual' ? (
            <Field label="Video provider" htmlFor={`${pid}-prov`} className="sm:col-span-2">
              <NativeSelect
                id={`${pid}-prov`}
                value={provider}
                onChange={(v) => onConfig({ provider: v })}
                options={providers.map((p) => ({
                  value: p,
                  label: PROVIDER_LABELS[p] + (p !== 'livekit' && p !== 'manual' && !deps.connected[p] ? ' (not connected)' : ''),
                }))}
              />
              {needsConnect && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {PROVIDER_LABELS[provider]} isn&apos;t connected yet.{' '}
                  <Link href="/dashboard/hiring/settings/integrations" className="font-medium underline">Connect it in integrations</Link>
                  {' '}or interviews will need a link pasted by hand.
                </p>
              )}
            </Field>
          ) : (
            <Field label="Location" htmlFor={`${pid}-loc`} className="sm:col-span-2">
              <Input id={`${pid}-loc`} value={c.location ?? ''} onChange={(e) => onConfig({ location: e.target.value })} placeholder="Office address and floor" />
            </Field>
          )}
          <Field label="Duration (minutes)" htmlFor={`${pid}-dur`}>
            <Input id={`${pid}-dur`} type="number" min={10} max={480} step={5} value={c.duration_min} onChange={(e) => onConfig({ duration_min: num(e.target.value, 30) })} />
          </Field>
          <Field label="Pass rule" htmlFor={`${pid}-rule`}>
            <NativeSelect
              id={`${pid}-rule`}
              value={c.pass_rule}
              onChange={(v) => onConfig({ pass_rule: v })}
              options={[
                { value: 'majority_yes', label: 'Most of the panel says yes' },
                { value: 'all_yes', label: 'Everyone says yes' },
                { value: 'avg_score', label: 'Average rating' },
              ]}
            />
          </Field>
          {c.pass_rule === 'avg_score' && (
            <Field label="Minimum average (1–5)" htmlFor={`${pid}-avg`}>
              <Input id={`${pid}-avg`} type="number" min={1} max={5} step={0.1} value={c.pass_score ?? 3.5} onChange={(e) => onConfig({ pass_score: num(e.target.value, 3.5) })} />
            </Field>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-foreground">Candidate picks a slot</span>
            <span className="block text-xs text-muted-foreground">Send a link with the panel&apos;s free times instead of scheduling by hand.</span>
          </span>
          <Switch checked={!!c.self_schedule} onCheckedChange={(v) => onConfig({ self_schedule: v })} aria-label="Candidate picks a slot" />
        </label>

        <div>
          <p className="text-sm font-medium text-foreground">Default panel</p>
          {panelable.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No interviewers yet. <Link href="/dashboard/hiring/team" className="font-medium text-primary hover:underline">Invite your team</Link> to pick a panel.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {panelable.map((m) => {
                const on = c.panel_ids.includes(m.user_id!)
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePanel(m.user_id!)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {m.name || m.email}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Scorecard <span className="font-normal text-muted-foreground">· each rated 1–5</span></p>
          {crit.map((k, i) => (
            <div key={k.id} className="flex items-center gap-2">
              <Input
                aria-label={`Criterion ${i + 1}`}
                value={k.label}
                onChange={(e) => onConfig({ scorecard: { criteria: crit.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })}
              />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ scorecard: { criteria: crit.filter((_, j) => j !== i) } })} aria-label={`Remove criterion ${i + 1}`}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onConfig({ scorecard: { criteria: [...crit, { id: `c_${Math.random().toString(36).slice(2, 7)}`, label: '' }] } })}>
            <Plus aria-hidden /> Add criterion
          </Button>
        </div>
      </div>
    )
  }

  if (c.kind === 'client_review') {
    return <p className="text-sm text-muted-foreground">Client contacts with access see the profile, résumé and earlier results, then approve or decline.</p>
  }

  if (c.kind === 'offer') {
    return (
      <Field label="Offer template" htmlFor={`${pid}-offer`} hint="Use {{name}}, {{job_title}}, {{salary}} and {{start_date}} as placeholders.">
        <Textarea id={`${pid}-offer`} rows={5} value={c.template ?? ''} onChange={(e) => onConfig({ template: e.target.value || null })} placeholder="Hi {{name}}, we're happy to offer you the {{job_title}} role…" />
      </Field>
    )
  }

  return <p className="text-sm text-muted-foreground">Track this step by hand and move candidates when they&apos;re done.</p>
}
