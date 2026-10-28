'use client'

/**
 * Per-type configuration forms for a pipeline stage (assessment, bot screen,
 * interview, HR round, background verification, offer). Controlled: every
 * change goes up as a config patch.
 */
import Link from 'next/link'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import type { AtsMember, BgvCheckType, BgvRegion, BotChannel, MeetingProvider, PipelineStage, StageConfig } from '@/lib/ats/contract'
import { BGV_VENDORS, DEFAULT_BGV_CHECKS, bgvChecksFor } from '@/lib/ats/pipeline'
import { BGV_CHECK_LABELS, BGV_VENDOR_LABELS, CHANNEL_LABELS, PROVIDER_LABELS } from '../lib/labels'
import { Field, NativeSelect } from '../ui'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
  const c = stage.config
  const pid = `st-${stage.id}`
  if (!c) return null

  if (c.kind === 'screening') {
    return <p className="text-sm text-muted-foreground">{t('hiring.usesTheScreeningCriteriaAboveCandidates145')}</p>
  }

  if (c.kind === 'assessment') {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('hiring.test')} htmlFor={`${pid}-exam`} className="sm:col-span-3" hint={deps.exams.length === 0 && !deps.examsLoading ? t('hiring.noTestsYetCreateOneInd36') : undefined}>
          <NativeSelect
            id={`${pid}-exam`}
            value={c.exam_id ?? ''}
            onChange={(v) => onConfig({ exam_id: v || null })}
            placeholder={deps.examsLoading ? t('hiring.loadingTests') : t('hiring.chooseATest')}
            options={deps.exams.map((e) => ({ value: e.id, label: e.title }))}
          />
        </Field>
        <Field label={t('hiring.passScore2')} htmlFor={`${pid}-pass`}>
          <Input id={`${pid}-pass`} type="number" min={0} max={100} inputMode="numeric" value={c.pass_score} onChange={(e) => onConfig({ pass_score: num(e.target.value, 0) })} />
        </Field>
        <Field label={t('hiring.deadlineDays')} htmlFor={`${pid}-deadline`} hint={t('hiring.daysToFinishAfterTheInvite')}>
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
          <p className="text-sm font-medium text-foreground">{t('hiring.channelsTriedInOrder')}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t('hiring.theBotOnlyContactsCandidatesWho073')}</p>
          <ol className="space-y-1.5">
            {c.channels.map((ch, i) => (
              <li key={ch} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                <span className="w-5 tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 text-foreground">{CHANNEL_LABELS[ch]}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCh(i, -1)} disabled={i === 0} aria-label={t('hiring.moveValueUp', { value: CHANNEL_LABELS[ch] })}><ArrowUp aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCh(i, 1)} disabled={i === c.channels.length - 1} aria-label={t('hiring.moveValueDown', { value: CHANNEL_LABELS[ch] })}><ArrowDown aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ channels: c.channels.filter((x) => x !== ch) })} aria-label={t('hiring.removeValue', { value: CHANNEL_LABELS[ch] })}><Trash2 aria-hidden /></Button>
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
          <Field label={t('common.language')} htmlFor={`${pid}-lang`}>
            <NativeSelect
              id={`${pid}-lang`}
              value={c.language ?? 'en-IN'}
              onChange={(v) => onConfig({ language: v })}
              options={[
                { value: 'en-IN', label: t('hiring.englishIndia') },
                { value: 'en-US', label: t('hiring.englishUs') },
                { value: 'hi-IN', label: t('hiring.hindi') },
                { value: 'te-IN', label: t('hiring.telugu') },
                { value: 'ta-IN', label: t('hiring.tamil') },
                { value: 'kn-IN', label: t('hiring.kannada') },
                { value: 'mr-IN', label: t('hiring.marathi') },
              ]}
            />
          </Field>
          <Field label={t('hiring.passScore2')} htmlFor={`${pid}-bpass`}>
            <Input id={`${pid}-bpass`} type="number" min={0} max={100} value={c.pass_score} onChange={(e) => onConfig({ pass_score: num(e.target.value, 0) })} />
          </Field>
          <Field label={t('hiring.attempts')} htmlFor={`${pid}-att`} hint={t('hiring.triesBeforeGivingUp')}>
            <Input id={`${pid}-att`} type="number" min={1} max={5} value={c.max_attempts ?? 2} onChange={(e) => onConfig({ max_attempts: num(e.target.value, 2) })} />
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t('hiring.questions')}</p>
          {c.questions.map((q, i) => (
            <div key={q.id} className="space-y-3 rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
                <Textarea
                  aria-label={t('hiring.questionValue', { value: i + 1 })}
                  value={q.text}
                  rows={2}
                  onChange={(e) => setQ(i, { text: e.target.value })}
                  placeholder={t('hiring.whatShouldTheBotAsk')}
                  className="min-h-0 flex-1"
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ questions: c.questions.filter((_, j) => j !== i) })} aria-label={t('hiring.deleteQuestionValue', { value: i + 1 })}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid gap-3 pl-7 sm:grid-cols-3">
                <Field label={t('hiring.answerType')} htmlFor={`${pid}-qt-${q.id}`}>
                  <NativeSelect
                    id={`${pid}-qt-${q.id}`}
                    value={q.type}
                    onChange={(v) => setQ(i, { type: v as Question['type'], knockout: undefined, options: v === 'choice' ? q.options ?? ['', ''] : undefined })}
                    options={[
                      { value: 'open', label: t('hiring.openAnswer') },
                      { value: 'yes_no', label: t('hiring.yesNo') },
                      { value: 'number', label: t('hiring.number') },
                      { value: 'choice', label: t('hiring.choice') },
                    ]}
                  />
                </Field>
                {q.type === 'yes_no' && (
                  <Field label={t('hiring.knockout')} htmlFor={`${pid}-ko-${q.id}`} hint={t('hiring.failTheScreenOnThisAnswer')}>
                    <NativeSelect
                      id={`${pid}-ko-${q.id}`}
                      value={q.knockout?.equals === true ? 'yes' : q.knockout?.equals === false ? 'no' : ''}
                      onChange={(v) => setQ(i, { knockout: v ? { equals: v === 'yes' } : undefined })}
                      placeholder={t('hiring.noKnockout')}
                      options={[{ value: 'no', label: t('hiring.failIfNo') }, { value: 'yes', label: t('hiring.failIfYes') }]}
                    />
                  </Field>
                )}
                {q.type === 'number' && (
                  <>
                    <Field label={t('hiring.failBelow')} htmlFor={`${pid}-min-${q.id}`}>
                      <Input id={`${pid}-min-${q.id}`} type="number" value={q.knockout?.min ?? ''} onChange={(e) => setQ(i, { knockout: { ...q.knockout, min: num(e.target.value) ?? undefined } })} />
                    </Field>
                    <Field label={t('hiring.failAbove')} htmlFor={`${pid}-max-${q.id}`}>
                      <Input id={`${pid}-max-${q.id}`} type="number" value={q.knockout?.max ?? ''} onChange={(e) => setQ(i, { knockout: { ...q.knockout, max: num(e.target.value) ?? undefined } })} />
                    </Field>
                  </>
                )}
                {q.type === 'choice' && (
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium text-foreground">{t('hiring.options')}</p>
                    {(q.options ?? []).map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input aria-label={t('hiring.optionValue', { value: oi + 1 })} value={o} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, k) => (k === oi ? e.target.value : x)) })} />
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name={`${pid}-ko-${q.id}`}
                            checked={q.knockout?.equals === o && o !== ''}
                            onChange={() => setQ(i, { knockout: { equals: o } })}
                          />{t('hiring.knockout')}</label>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQ(i, { options: (q.options ?? []).filter((_, k) => k !== oi) })} aria-label={t('hiring.removeOptionValue', { value: oi + 1 })}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setQ(i, { options: [...(q.options ?? []), ''] })}><Plus aria-hidden />{' '}{t('hiring.option')}</Button>
                      {q.knockout && <Button type="button" variant="ghost" size="sm" onClick={() => setQ(i, { knockout: undefined })}>{t('hiring.clearKnockout')}</Button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onConfig({ questions: [...c.questions, { id: rid(), text: '', type: 'open' }] })}>
            <Plus aria-hidden />{' '}{t('hiring.addQuestion')}</Button>
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
          <Field label={t('hiring.format')} htmlFor={`${pid}-mode`}>
            <NativeSelect
              id={`${pid}-mode`}
              value={c.mode}
              onChange={(v) => onConfig({ mode: v, provider: v === 'virtual' ? provider : undefined })}
              options={[{ value: 'virtual', label: t('hiring.video') }, { value: 'f2f', label: t('hiring.faceToFace') }]}
            />
          </Field>
          {c.mode === 'virtual' ? (
            <Field label={t('hiring.videoProvider')} htmlFor={`${pid}-prov`} className="sm:col-span-2">
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
                <p className="text-xs text-amber-700 dark:text-amber-400">{t('hiring.valueIsntConnectedYet', { value: PROVIDER_LABELS[provider] })}{' '}<Link href="/dashboard/hiring/settings/integrations" className="font-medium underline">{t('hiring.connectItInIntegrations')}</Link>{' '}{t('hiring.orInterviewsWillNeedALinkd4b')}</p>
              )}
            </Field>
          ) : (
            <Field label={t('hiring.location')} htmlFor={`${pid}-loc`} className="sm:col-span-2">
              <Input id={`${pid}-loc`} value={c.location ?? ''} onChange={(e) => onConfig({ location: e.target.value })} placeholder={t('hiring.officeAddressAndFloor')} />
            </Field>
          )}
          <Field label={t('hiring.durationMinutes')} htmlFor={`${pid}-dur`}>
            <Input id={`${pid}-dur`} type="number" min={10} max={480} step={5} value={c.duration_min} onChange={(e) => onConfig({ duration_min: num(e.target.value, 30) })} />
          </Field>
          <Field label={t('hiring.passRule')} htmlFor={`${pid}-rule`}>
            <NativeSelect
              id={`${pid}-rule`}
              value={c.pass_rule}
              onChange={(v) => onConfig({ pass_rule: v })}
              options={[
                { value: 'majority_yes', label: t('hiring.mostOfThePanelSaysYes') },
                { value: 'all_yes', label: t('hiring.everyoneSaysYes2') },
                { value: 'avg_score', label: t('hiring.averageRating') },
              ]}
            />
          </Field>
          {c.pass_rule === 'avg_score' && (
            <Field label={t('hiring.minimumAverage15')} htmlFor={`${pid}-avg`}>
              <Input id={`${pid}-avg`} type="number" min={1} max={5} step={0.1} value={c.pass_score ?? 3.5} onChange={(e) => onConfig({ pass_score: num(e.target.value, 3.5) })} />
            </Field>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-foreground">{t('hiring.candidatePicksASlot')}</span>
            <span className="block text-xs text-muted-foreground">{t('hiring.sendALinkWithThePanels43c')}</span>
          </span>
          <Switch checked={!!c.self_schedule} onCheckedChange={(v) => onConfig({ self_schedule: v })} aria-label={t('hiring.candidatePicksASlot')} />
        </label>

        <div>
          <p className="text-sm font-medium text-foreground">{t('hiring.defaultPanel')}</p>
          {panelable.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('hiring.noInterviewersYet')}{' '}<Link href="/dashboard/hiring/team" className="font-medium text-primary hover:underline">{t('hiring.inviteYourTeam')}</Link>{' '}{t('hiring.toPickAPanel')}</p>
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
          <p className="text-sm font-medium text-foreground">{t('hiring.scorecard2')}{' '}<span className="font-normal text-muted-foreground">{t('hiring.eachRated15')}</span></p>
          {crit.map((k, i) => (
            <div key={k.id} className="flex items-center gap-2">
              <Input
                aria-label={t('hiring.criterionValue', { value: i + 1 })}
                value={k.label}
                onChange={(e) => onConfig({ scorecard: { criteria: crit.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })}
              />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onConfig({ scorecard: { criteria: crit.filter((_, j) => j !== i) } })} aria-label={t('hiring.removeCriterionValue', { value: i + 1 })}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onConfig({ scorecard: { criteria: [...crit, { id: `c_${Math.random().toString(36).slice(2, 7)}`, label: '' }] } })}>
            <Plus aria-hidden />{' '}{t('hiring.addCriterion')}</Button>
        </div>
      </div>
    )
  }

  if (c.kind === 'hr_round') {
    const iv = c.interview ?? null
    const providers: MeetingProvider[] = ['livekit', 'zoom', 'google_meet', 'teams', 'manual']
    const panelable = deps.members.filter((m) => m.status !== 'disabled' && m.user_id && m.role !== 'client')
    const setIv = (patch: Partial<NonNullable<typeof iv>>) => onConfig({ interview: { mode: 'virtual', provider: 'livekit', duration_min: 30, panel_ids: [], ...iv, ...patch } })
    return (
      <div className="space-y-5">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-foreground">{t('hiring.askTheCandidateToConfirmCompensation')}</span>
            <span className="block text-xs text-muted-foreground">{t('hiring.experiencedCurrentOrLastDrawnCtc1cc')}</span>
          </span>
          <Switch checked={c.collect_compensation} onCheckedChange={(v) => onConfig({ collect_compensation: v })} aria-label={t('hiring.askTheCandidateToConfirmCompensation')} />
        </label>
        {c.collect_compensation && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('hiring.formDeadlineDays')} htmlFor={`${pid}-hrdl`} hint={t('hiring.aReminderGoesOutHalfWay')}>
              <Input id={`${pid}-hrdl`} type="number" min={1} max={30} inputMode="numeric" value={c.form_deadline_days ?? 3} onChange={(e) => onConfig({ form_deadline_days: num(e.target.value, 3) })} />
            </Field>
          </div>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-foreground">{t('hiring.scheduleAnHrConversation')}</span>
            <span className="block text-xs text-muted-foreground">{t('hiring.booksACallThroughInterviewsThe243')}</span>
          </span>
          <Switch checked={!!iv} onCheckedChange={(v) => onConfig({ interview: v ? { mode: 'virtual', provider: 'livekit', duration_min: 30, panel_ids: [] } : null })} aria-label={t('hiring.scheduleAnHrConversation')} />
        </label>
        {iv && (
          <div className="space-y-4 rounded-2xl border border-border bg-background p-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('hiring.format')} htmlFor={`${pid}-hrmode`}>
                <NativeSelect id={`${pid}-hrmode`} value={iv.mode} onChange={(v) => setIv({ mode: v as 'virtual' | 'f2f', provider: v === 'virtual' ? iv.provider ?? 'livekit' : undefined })} options={[{ value: 'virtual', label: t('hiring.video') }, { value: 'f2f', label: t('hiring.faceToFace') }]} />
              </Field>
              {iv.mode === 'virtual' && (
                <Field label={t('hiring.videoProvider')} htmlFor={`${pid}-hrprov`}>
                  <NativeSelect
                    id={`${pid}-hrprov`}
                    value={iv.provider ?? 'livekit'}
                    onChange={(v) => setIv({ provider: v as MeetingProvider })}
                    options={providers.map((p) => ({ value: p, label: PROVIDER_LABELS[p] + (p !== 'livekit' && p !== 'manual' && !deps.connected[p] ? ' (not connected)' : '') }))}
                  />
                </Field>
              )}
              <Field label={t('hiring.durationMinutes')} htmlFor={`${pid}-hrdur`}>
                <Input id={`${pid}-hrdur`} type="number" min={10} max={240} step={5} value={iv.duration_min} onChange={(e) => setIv({ duration_min: num(e.target.value, 30) ?? 30 })} />
              </Field>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t('hiring.hrPanel')}</p>
              {panelable.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t('hiring.noTeamMembersYet')}{' '}<Link href="/dashboard/hiring/team" className="font-medium text-primary hover:underline">{t('hiring.inviteYourTeam')}</Link>.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {panelable.map((m) => {
                    const on = iv.panel_ids.includes(m.user_id!)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setIv({ panel_ids: on ? iv.panel_ids.filter((x) => x !== m.user_id) : [...iv.panel_ids, m.user_id!] })}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {m.name || m.email}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (c.kind === 'bgv') {
    const available = bgvChecksFor(c.region)
    const toggle = (k: BgvCheckType) => {
      const on = c.checks.includes(k)
      const checks = on ? c.checks.filter((x) => x !== k) : [...c.checks, k]
      onConfig({ checks, critical_checks: (c.critical_checks || []).filter((x) => checks.includes(x)) })
    }
    const toggleCritical = (k: BgvCheckType) => {
      const crit = c.critical_checks || []
      onConfig({ critical_checks: crit.includes(k) ? crit.filter((x) => x !== k) : [...crit, k] })
    }
    const setRegion = (r: string) => {
      const region = r as BgvRegion | 'auto'
      const allowed = bgvChecksFor(region)
      const kept = c.checks.filter((k) => allowed.includes(k))
      const checks = kept.length ? kept : DEFAULT_BGV_CHECKS[region]
      onConfig({ region, checks, critical_checks: (c.critical_checks || []).filter((k) => checks.includes(k)) })
    }
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('hiring.region')} htmlFor={`${pid}-bgvreg`} hint={c.region === 'auto' ? t('hiring.fromTheCandidatesCountryElseThe322') : undefined}>
            <NativeSelect id={`${pid}-bgvreg`} value={c.region} onChange={setRegion} options={[{ value: 'auto', label: t('hiring.automatic') }, { value: 'IN', label: t('hiring.india') }, { value: 'US', label: t('hiring.unitedStates') }]} />
          </Field>
          <Field label={t('hiring.verificationBy')} htmlFor={`${pid}-bgvven`}>
            <NativeSelect id={`${pid}-bgvven`} value={c.vendor} onChange={(v) => onConfig({ vendor: v })} options={BGV_VENDORS.map((v) => ({ value: v, label: BGV_VENDOR_LABELS[v] || v }))} />
          </Field>
          <Field label={t('hiring.candidateDeadlineDays')} htmlFor={`${pid}-bgvdl`} hint={t('hiring.toSubmitDetailsAndDocuments')}>
            <Input id={`${pid}-bgvdl`} type="number" min={1} max={60} inputMode="numeric" value={c.form_deadline_days ?? 7} onChange={(e) => onConfig({ form_deadline_days: num(e.target.value, 7) })} />
          </Field>
          <Field label={t('hiring.employmentHistoryYears')} htmlFor={`${pid}-bgvemp`}>
            <Input id={`${pid}-bgvemp`} type="number" min={1} max={15} inputMode="numeric" value={c.employment_years ?? ''} placeholder={c.region === 'IN' ? t('hiring.all') : '7'} onChange={(e) => onConfig({ employment_years: num(e.target.value) ?? undefined })} />
          </Field>
          <Field label={t('hiring.addressHistoryYears')} htmlFor={`${pid}-bgvaddr`}>
            <Input id={`${pid}-bgvaddr`} type="number" min={1} max={15} inputMode="numeric" value={c.address_years ?? ''} placeholder={c.region === 'IN' ? t('hiring.currentPermanent') : '7'} onChange={(e) => onConfig({ address_years: num(e.target.value) ?? undefined })} />
          </Field>
          <Field label={t('hiring.references')} htmlFor={`${pid}-bgvref`}>
            <Input id={`${pid}-bgvref`} type="number" min={0} max={5} inputMode="numeric" value={c.references_count ?? 0} onChange={(e) => onConfig({ references_count: num(e.target.value, 0) })} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-foreground">{t('hiring.checks')}</legend>
          <p className="mb-2 text-xs text-muted-foreground">{t('hiring.markACheckCriticalToFailb4d')}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {available.map((k) => {
              const on = c.checks.includes(k)
              const crit = (c.critical_checks || []).includes(k)
              return (
                <li key={k} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    <Checkbox id={`${pid}-chk-${k}`} checked={on} onCheckedChange={() => toggle(k)} />
                    <label htmlFor={`${pid}-chk-${k}`} className="truncate">{BGV_CHECK_LABELS[k]}</label>
                  </span>
                  {on && (
                    <button
                      type="button"
                      aria-pressed={crit}
                      onClick={() => toggleCritical(k)}
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${crit ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      aria-label={`${BGV_CHECK_LABELS[k]}: ${crit ? 'critical' : 'not critical'}`}
                    >
                      {crit ? t('hiring.critical2') : t('hiring.markCritical')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>
      </div>
    )
  }

  if (c.kind === 'client_review') {
    return <p className="text-sm text-muted-foreground">{t('hiring.clientContactsWithAccessSeeThe6a1')}</p>
  }

  if (c.kind === 'offer') {
    return (
      <Field label={t('hiring.offerTemplate')} htmlFor={`${pid}-offer`} hint={t('hiring.useNameJobTitleSalaryAnd0fd')}>
        <Textarea id={`${pid}-offer`} rows={5} value={c.template ?? ''} onChange={(e) => onConfig({ template: e.target.value || null })} placeholder={t('hiring.hiNameWereHappyToOfferfa6')} />
      </Field>
    )
  }

  return <p className="text-sm text-muted-foreground">{t('hiring.trackThisStepByHandAnd2c3')}</p>
}
