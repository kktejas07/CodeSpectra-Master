'use client'

/**
 * Job editor (new + edit): details, screening criteria and the pipeline.
 * Saves through POST /api/ats/jobs or PATCH /api/ats/jobs/[id]; the server
 * validates everything again and scopes the job to the caller's tenant.
 */
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Panel, Section } from '@/components/app/page-kit'
import { useToast } from '@/lib/toast-context'
import type { AtsClient, AtsJob, AtsMember, JobStatus, MeetingProvider, PipelineStage, ScreeningCriteria } from '@/lib/ats/contract'
import { atsSend, errorMessage, useAts } from '../lib/api'
import { PIPELINE_TEMPLATES, defaultCriteria, pipelineReducer, pipelineWarnings, validatePipeline } from '../lib/pipeline-builder'
import { EMPLOYMENT_LABELS, JOB_STATUS_LABELS, JOB_TRANSITIONS, WORK_MODE_LABELS } from '../lib/labels'
import { Field, InlineError, NativeSelect, Segmented } from '../ui'
import { CriteriaEditor } from './criteria-editor'
import { PipelineBuilder } from './pipeline-builder'

export type JobDraft = Omit<AtsJob, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at' | 'legacy_job_id'>

export function emptyDraft(): JobDraft {
  return {
    client_id: null,
    title: '',
    department: null,
    location: '',
    work_mode: 'onsite',
    employment_type: 'full_time',
    experience_min: null,
    experience_max: null,
    salary: { currency: 'INR', period: 'year' },
    openings: 1,
    description: '',
    requirements: '',
    skills: [],
    status: 'draft',
    is_public: true,
    recruiter_ids: [],
    hiring_manager_ids: [],
    criteria: defaultCriteria(),
    pipeline: PIPELINE_TEMPLATES[0].build(),
  }
}

/** Normalise GET /api/ats/integrations/meetings into provider → connected. */
export function connectedProviders(raw: unknown): Partial<Record<MeetingProvider, boolean>> {
  const out: Partial<Record<MeetingProvider, boolean>> = { livekit: true, manual: true }
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Array.isArray((raw as { providers?: unknown }).providers)
        ? (raw as { providers: unknown[] }).providers
        : Object.entries(raw as Record<string, unknown>).map(([provider, v]) => ({ provider, ...(typeof v === 'object' && v ? v : { connected: !!v }) }))
      : []
  for (const p of list as { provider?: string; id?: string; connected?: boolean; status?: string }[]) {
    const key = (p.provider || p.id) as MeetingProvider | undefined
    if (key) out[key] = p.connected === true || p.status === 'connected'
  }
  return out
}

type Tab = 'details' | 'screening' | 'pipeline'

export function JobEditor({ initial, jobId }: { initial?: AtsJob; jobId?: string }) {
  const router = useRouter()
  const addToast = useToast()
  const [draft, setDraft] = useState<JobDraft>(() => (initial ? { ...emptyDraft(), ...initial, criteria: { ...defaultCriteria(), ...initial.criteria } } : emptyDraft()))
  const [pipeline, dispatch] = useReducer(pipelineReducer, draft.pipeline)
  const [tab, setTab] = useState<Tab>('details')
  const [saving, setSaving] = useState<null | 'draft' | 'publish'>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  /** removed stage id → stage that receives its candidates (edit only) */
  const [stageMoves, setStageMoves] = useState<Record<string, string>>({})

  const clients = useAts<AtsClient[]>('/api/ats/clients', 'clients')
  const members = useAts<AtsMember[]>('/api/ats/team', 'members')
  const exams = useAts<{ id: string; title: string }[]>('/api/ats/exams', 'exams')
  const integrations = useAts<unknown>('/api/ats/integrations/meetings')
  const connected = useMemo(() => connectedProviders(integrations.data), [integrations.data])

  const set = (patch: Partial<JobDraft>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true) }
  const setCriteria = (patch: Partial<ScreeningCriteria>) => { setDraft((d) => ({ ...d, criteria: { ...d.criteria, ...patch } })); setDirty(true) }
  const pipeDispatch: typeof dispatch = (a) => { dispatch(a); setDirty(true) }

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const detailErrors = [
    !draft.title.trim() && 'Add a job title.',
    !draft.description.trim() && 'Add a description.',
    draft.openings < 1 && 'Openings must be at least 1.',
    draft.experience_min != null && draft.experience_max != null && draft.experience_min > draft.experience_max && 'Minimum experience is above the maximum.',
    draft.salary?.min != null && draft.salary?.max != null && draft.salary.min > draft.salary.max && 'Minimum salary is above the maximum.',
  ].filter(Boolean) as string[]
  const pipelineErrors = validatePipeline(pipeline)
  const pipelineAdvice = pipelineWarnings(pipeline)
  const keptIds = new Set(pipeline.map((s) => s.id))
  const removed = (initial?.pipeline ?? []).filter((s) => !keptIds.has(s.id))
  /** Default target for a removed stage: the nearest earlier stage that still exists. */
  const defaultTarget = (id: string) => {
    const old = initial?.pipeline ?? []
    for (let i = old.findIndex((s) => s.id === id) - 1; i >= 0; i--) if (keptIds.has(old[i].id) && old[i].type !== 'rejected') return old[i].id
    return pipeline[0]?.id ?? ''
  }
  const statusOptions = (initial ? [initial.status, ...JOB_TRANSITIONS[initial.status]] : (['draft', 'open'] as JobStatus[]))
    .map((v) => ({ value: v, label: JOB_STATUS_LABELS[v] }))

  const save = async (publish: boolean) => {
    setError(null)
    const errs = publish ? [...detailErrors, ...pipelineErrors] : draft.title.trim() ? [] : ['Add a job title.']
    if (errs.length) {
      setError(errs.join(' '))
      setTab(detailErrors.length ? 'details' : 'pipeline')
      return
    }
    setSaving(publish ? 'publish' : 'draft')
    const status: JobStatus = publish ? (draft.status === 'draft' ? 'open' : draft.status) : draft.status
    const body: JobDraft & { stage_moves?: Record<string, string> } = {
      ...draft,
      title: draft.title.trim(),
      status,
      skills: draft.skills.length ? draft.skills : draft.criteria.must_have_skills,
      pipeline,
      ...(removed.length ? { stage_moves: Object.fromEntries(removed.map((s) => [s.id, stageMoves[s.id] || defaultTarget(s.id)])) } : {}),
    }
    try {
      const job = jobId
        ? await atsSend<AtsJob>(`/api/ats/jobs/${jobId}`, 'PATCH', body, 'job')
        : await atsSend<AtsJob>('/api/ats/jobs', 'POST', body, 'job')
      setDirty(false)
      addToast({ type: 'success', title: publish ? 'Job published' : 'Saved' })
      const id = job?.id ?? jobId
      router.push(id ? `/dashboard/hiring/jobs/${id}` : '/dashboard/hiring/jobs')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(null)
    }
  }

  const salary = draft.salary ?? {}
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

  return (
    <div className="space-y-6 pb-24">
      <Segmented<Tab>
        label="Job editor sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'screening', label: 'Screening' },
          { value: 'pipeline', label: 'Pipeline', count: pipeline.length },
        ]}
      />

      {tab === 'details' && (
        <Panel>
          <Section title="Job details" description="What candidates see on the apply page.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Job title" htmlFor="j-title" className="sm:col-span-2">
                <Input id="j-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Senior frontend engineer" maxLength={140} required />
              </Field>
              <Field label="Client" htmlFor="j-client" hint={(clients.data?.length ?? 0) === 0 ? 'Hiring for a client? Add them under Clients.' : undefined}>
                <NativeSelect
                  id="j-client"
                  value={draft.client_id ?? ''}
                  onChange={(v) => set({ client_id: v || null })}
                  placeholder="In-house (no client)"
                  options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Department" htmlFor="j-dept">
                <Input id="j-dept" value={draft.department ?? ''} onChange={(e) => set({ department: e.target.value || null })} placeholder="e.g. Engineering" />
              </Field>
              <Field label="Location" htmlFor="j-loc">
                <Input id="j-loc" value={draft.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Hyderabad" />
              </Field>
              <Field label="Work mode" htmlFor="j-mode">
                <NativeSelect id="j-mode" value={draft.work_mode ?? ''} onChange={(v) => set({ work_mode: (v || null) as JobDraft['work_mode'] })} options={Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Job type" htmlFor="j-type">
                <NativeSelect id="j-type" value={draft.employment_type ?? ''} onChange={(v) => set({ employment_type: (v || null) as JobDraft['employment_type'] })} options={Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Openings" htmlFor="j-open">
                <Input id="j-open" type="number" min={1} max={999} value={draft.openings} onChange={(e) => set({ openings: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Experience from (years)" htmlFor="j-xmin">
                <Input id="j-xmin" type="number" min={0} max={50} value={draft.experience_min ?? ''} onChange={(e) => set({ experience_min: num(e.target.value) ?? null })} />
              </Field>
              <Field label="Experience to (years)" htmlFor="j-xmax">
                <Input id="j-xmax" type="number" min={0} max={50} value={draft.experience_max ?? ''} onChange={(e) => set({ experience_max: num(e.target.value) ?? null })} />
              </Field>
              <Field label="Status" htmlFor="j-status">
                <NativeSelect id="j-status" value={draft.status} onChange={(v) => set({ status: v as JobStatus })} options={statusOptions} />
              </Field>
              <Field label="Salary from" htmlFor="j-smin">
                <Input id="j-smin" type="number" min={0} value={salary.min ?? ''} onChange={(e) => set({ salary: { ...salary, min: num(e.target.value) } })} />
              </Field>
              <Field label="Salary to" htmlFor="j-smax">
                <Input id="j-smax" type="number" min={0} value={salary.max ?? ''} onChange={(e) => set({ salary: { ...salary, max: num(e.target.value) } })} />
              </Field>
              <Field label="Currency" htmlFor="j-cur">
                <NativeSelect id="j-cur" value={salary.currency ?? 'INR'} onChange={(v) => set({ salary: { ...salary, currency: v } })} options={['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label="Per" htmlFor="j-per">
                <NativeSelect id="j-per" value={salary.period ?? 'year'} onChange={(v) => set({ salary: { ...salary, period: v as 'year' | 'month' | 'hour' } })} options={[{ value: 'year', label: 'Year' }, { value: 'month', label: 'Month' }, { value: 'hour', label: 'Hour' }]} />
              </Field>
              <Field label="Description" htmlFor="j-desc" className="sm:col-span-2 lg:col-span-4">
                <Textarea id="j-desc" rows={8} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="What the role is, the team, and what a great first year looks like." />
              </Field>
              <Field label="Requirements" htmlFor="j-req" className="sm:col-span-2 lg:col-span-4">
                <Textarea id="j-req" rows={6} value={draft.requirements ?? ''} onChange={(e) => set({ requirements: e.target.value })} placeholder="One per line: skills, experience, qualifications." />
              </Field>
            </div>
            <label className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium text-foreground">Public apply page</span>
                <span className="block text-xs text-muted-foreground">Lists the job on the jobs board with a link anyone can apply through.</span>
              </span>
              <Switch checked={draft.is_public} onCheckedChange={(v) => set({ is_public: v })} aria-label="Public apply page" />
            </label>
          </Section>
        </Panel>
      )}

      {tab === 'screening' && (
        <Panel>
          <Section title="Screening criteria" description="Every résumé is scored against these as it comes in.">
            <CriteriaEditor value={draft.criteria} onChange={setCriteria} currency={salary.currency} skillSuggestions={draft.skills} />
          </Section>
        </Panel>
      )}

      {tab === 'pipeline' && (
        <Panel>
          <Section title="Pipeline" description="The steps for this job, in order. Open a stage to set how candidates move on.">
            <PipelineBuilder
              stages={pipeline}
              dispatch={pipeDispatch}
              onTemplate={(build) => pipeDispatch({ type: 'set', stages: build() as PipelineStage[] })}
              deps={{ exams: exams.data ?? [], examsLoading: exams.loading, members: members.data ?? [], connected }}
            />
            {removed.length > 0 && (
              <div className="mt-4 space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-foreground">Candidates in removed stages</p>
                <p className="text-xs text-muted-foreground">Anyone still in a stage you removed moves to the stage you pick here when you save.</p>
                {removed.map((s) => (
                  <Field key={s.id} label={`From "${s.name}" to`} htmlFor={`mv-${s.id}`}>
                    <NativeSelect
                      id={`mv-${s.id}`}
                      value={stageMoves[s.id] || defaultTarget(s.id)}
                      onChange={(v) => setStageMoves((m) => ({ ...m, [s.id]: v }))}
                      options={pipeline.map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Field>
                ))}
              </div>
            )}
            {pipelineErrors.length > 0 && (
              <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-400">
                {pipelineErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            {pipelineAdvice.length > 0 && (
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground" aria-label="Suggestions">
                {pipelineAdvice.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </Section>
        </Panel>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1"><InlineError message={error} /></div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => save(false)} disabled={!!saving}>
              {saving === 'draft' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Save aria-hidden />}
              Save
            </Button>
            <Button type="button" onClick={() => save(true)} disabled={!!saving} className="min-h-11 sm:min-h-9">
              {saving === 'publish' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send aria-hidden />}
              {draft.status === 'draft' ? 'Publish' : 'Save and publish'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
