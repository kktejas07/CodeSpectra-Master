'use client'

/**
 * Mock interview: set up a practice interview with the AI interviewer and
 * see past reports. Sessions and reports are private; a report can be shared
 * by link from its page. API: /api/interview-sim.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Mic, RotateCcw, Share2, Trash2, Video } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { CODE_LANGUAGES } from '@/lib/code-languages'
import {
  LEVELS, READINESS_LABEL, ROUNDS, SIM_LANGUAGES, levelLabel, roundLabel, type RoundType, type SimHistoryItem, type SimLanguage, type SimLevel, type SimMode,
} from '@/lib/interview-sim/types'
import { cn } from '@/lib/utils'

interface Options {
  companies: Array<{ slug: string; name: string; patterns: Array<{ id: string; name: string }> }>
  settings: { enabled: boolean; allow_voice: boolean; allow_recordings: boolean; recording_retention_days: number; questions_per_session: number; daily_sessions_per_user: number }
  started_today: number
  server_transcription: boolean
}

const ROLE_SUGGESTIONS = ['Software engineer', 'Frontend developer', 'Backend developer', 'Full stack developer', 'Data analyst', 'Data scientist', 'DevOps engineer', 'QA engineer']
const selectCls = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function InterviewSimPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const addToast = useToast()
  const [options, setOptions] = useState<Options | null>(null)
  const [history, setHistory] = useState<SimHistoryItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)

  const [company, setCompany] = useState('')
  const [patternId, setPatternId] = useState('')
  const [role, setRole] = useState('Software engineer')
  const [level, setLevel] = useState<SimLevel>('entry')
  const [round, setRound] = useState<RoundType>('technical')
  const [language, setLanguage] = useState<SimLanguage>('en-IN')
  const [mode, setMode] = useState<SimMode>('text')
  const [codeLanguage, setCodeLanguage] = useState('python')
  const [record, setRecord] = useState(false)
  const [consent, setConsent] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    setLoadError(false)
    fetch('/api/interview-sim', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) { setOptions(d.options); setHistory(Array.isArray(d.sessions) ? d.sessions : []) } })
      .catch(() => { if (live) { setLoadError(true); setHistory([]) } })
    return () => { live = false }
  }, [gate.ready, reload])

  const companyRow = useMemo(() => options?.companies.find((c) => c.slug === company) ?? null, [options, company])
  const needsConsent = mode === 'voice' || record
  const left = options ? Math.max(0, options.settings.daily_sessions_per_user - options.started_today) : 0
  const voiceAllowed = !!options?.settings.allow_voice

  const start = async (retakeOf?: string) => {
    setStartError(null)
    if (!retakeOf && role.trim().length < 2) { setStartError('Enter the role you are preparing for.'); return }
    if (needsConsent && !consent) { setStartError('Please read and accept the microphone notice first.'); return }
    if (retakeOf) setBusyId(retakeOf)
    else setStarting(true)
    try {
      const prev = retakeOf ? history?.find((h) => h.id === retakeOf) : null
      const res = await csrfFetch('/api/interview-sim', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || null, pattern_id: patternId || null, role: prev?.role ?? role.trim(), level: prev?.level ?? level, round: prev?.round ?? round,
          language, mode: retakeOf ? 'text' : mode, code_language: codeLanguage, record: retakeOf ? false : record, consent: retakeOf ? false : consent,
          ...(retakeOf ? { retake_of: retakeOf } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.session?.id) throw new Error(j.error || 'The interview could not start. Try again.')
      router.push(`/dashboard/interview-sim/${encodeURIComponent(j.session.id)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The interview could not start. Try again.'
      if (retakeOf) addToast({ type: 'error', title: 'Could not start', message: msg })
      else setStartError(msg)
    } finally {
      setStarting(false)
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this interview, its report and any recording? This cannot be undone.')) return
    setBusyId(id)
    try {
      const res = await csrfFetch(`/api/interview-sim/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error()
      setHistory((h) => (h ? h.filter((x) => x.id !== id) : h))
    } catch {
      addToast({ type: 'error', title: 'Could not delete', message: 'Try again in a moment.' })
    } finally {
      setBusyId(null)
    }
  }

  if (!gate.ready || history === null) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonList count={4} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader
        illustration="interview"
        className="mb-0"
        icon={<Mic aria-hidden />}
        title="Mock interview"
        description="Practise a real interview round with an AI interviewer, then get scored feedback, model answers and what to study next."
        actions={<Button asChild variant="outline" size="sm"><Link href="/dashboard/interview-prep">Interview prep questions</Link></Button>}
      />

      {loadError && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-red-500/30">
          <p className="text-sm text-foreground">We couldn’t load mock interviews.</p>
          <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>Try again</Button>
        </Panel>
      )}

      {options && !options.settings.enabled ? (
        <EmptyState illustration="interview" title="Mock interviews are switched off" description="Your platform admin has paused mock interviews. Check back later, or practise with interview prep questions." actionLabel="Interview prep" actionHref="/dashboard/interview-prep" />
      ) : options && (
        <Section title="Set up your interview" description={`${options.settings.questions_per_session} questions, about ${options.settings.questions_per_session * 3} minutes. ${left} of ${options.settings.daily_sessions_per_user} left today.`}>
          <Panel>
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void start() }}>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">Round</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ROUNDS.map((r) => (
                    <label key={r.id} className={cn('flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring', round === r.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}>
                      <input type="radio" name="round" value={r.id} checked={round === r.id} onChange={() => setRound(r.id)} className="sr-only" />
                      <span className="font-medium text-foreground">{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sim-role">Role</Label>
                  <Input id="sim-role" list="sim-role-list" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} className="h-11 rounded-xl" />
                  <datalist id="sim-role-list">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sim-level">Level</Label>
                  <select id="sim-level" className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as SimLevel)}>
                    {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sim-company">Company (optional)</Label>
                  <select id="sim-company" className={selectCls} value={company} onChange={(e) => { setCompany(e.target.value); setPatternId('') }}>
                    <option value="">General interview</option>
                    {options.companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                {companyRow && companyRow.patterns.length > 1 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="sim-pattern">Hiring track</Label>
                    <select id="sim-pattern" className={selectCls} value={patternId} onChange={(e) => setPatternId(e.target.value)}>
                      <option value="">Any</option>
                      {companyRow.patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="sim-language">Interview language</Label>
                  <select id="sim-language" className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value as SimLanguage)}>
                    {SIM_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                {round === 'coding' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="sim-code-lang">Coding language</Label>
                    <select id="sim-code-lang" className={selectCls} value={codeLanguage} onChange={(e) => setCodeLanguage(e.target.value)}>
                      {CODE_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">How you answer</legend>
                <div className="flex flex-wrap gap-3">
                  {(['text', 'voice'] as const).map((m) => (
                    <label key={m} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring', mode === m ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground hover:border-primary/40', m === 'voice' && !voiceAllowed && 'cursor-not-allowed opacity-50')}>
                      <input type="radio" name="mode" value={m} checked={mode === m} disabled={m === 'voice' && !voiceAllowed} onChange={() => setMode(m)} className="sr-only" />
                      {m === 'voice' ? <Mic className="h-4 w-4" aria-hidden /> : null}
                      {m === 'text' ? 'Type answers' : 'Speak answers'}
                    </label>
                  ))}
                </div>
                {mode === 'voice' && <p className="text-xs text-muted-foreground">The interviewer reads questions aloud and your browser turns your speech into text. If your browser can’t, you can still type.</p>}
                {options.settings.allow_recordings && (
                  <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={record} onChange={(e) => setRecord(e.target.checked)} />
                    <span><span className="inline-flex items-center gap-1 font-medium"><Video className="h-4 w-4" aria-hidden />Record this session</span> <span className="text-muted-foreground">(optional) — so you can watch yourself back. Kept for {options.settings.recording_retention_days} days, then deleted. You can delete it any time.</span></span>
                  </label>
                )}
              </fieldset>

              {needsConsent && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
                  <p className="font-medium">Before we use your microphone{record ? ' or camera' : ''}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {mode === 'voice' && <li>Your browser asks for microphone access. Speech is turned into text in your browser{options.server_transcription ? ', or by our speech-to-text provider if your browser can’t' : ''}; we keep the text of your answers, not the audio.</li>}
                    {record && <li>If you start a recording, it is stored privately on our servers for {options.settings.recording_retention_days} days, visible only to you, then deleted automatically.</li>}
                    <li>Your answers are scored by an AI model. Don’t share personal details you wouldn’t say in an interview.</li>
                  </ul>
                  <label className="mt-3 flex min-h-11 items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span className="font-medium">I understand and agree</span>
                  </label>
                </div>
              )}

              {startError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{startError}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" className="min-h-11 rounded-full px-6" disabled={starting || left === 0}>
                  {starting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Preparing your interviewer…</> : 'Start interview'}
                </Button>
                {left === 0 && <p className="text-sm text-muted-foreground">You’ve used today’s mock interviews. Come back tomorrow.</p>}
              </div>
            </form>
          </Panel>
        </Section>
      )}

      <Section title="Your interviews" description="Reports are private to you unless you share a link.">
        {history.length === 0 ? (
          <EmptyState compact illustration="interview" title="No mock interviews yet" description="Set up your first round above — you’ll see your scores and feedback here." />
        ) : (
          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.id}>
                <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/dashboard/interview-sim/${encodeURIComponent(h.id)}`} className="font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                      {roundLabel(h.round)} · {h.role}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {h.company_name ? `${h.company_name} · ` : ''}{levelLabel(h.level)} · {new Date(h.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {h.status === 'active' && <Badge variant="outline">In progress</Badge>}
                      {h.readiness && <Badge variant="outline">{READINESS_LABEL[h.readiness]}</Badge>}
                      {h.mode === 'voice' && <Badge variant="outline"><Mic className="mr-1 h-3 w-3" aria-hidden />Voice</Badge>}
                      {h.shared && <Badge variant="outline"><Share2 className="mr-1 h-3 w-3" aria-hidden />Shared</Badge>}
                      {h.has_recording && <Badge variant="outline"><Video className="mr-1 h-3 w-3" aria-hidden />Recording</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {h.overall !== null && <span className="mr-2 font-mono text-lg font-semibold tabular-nums text-foreground">{h.overall}<span className="text-xs text-muted-foreground">/100</span></span>}
                    <Button asChild size="sm" variant={h.status === 'active' ? 'default' : 'outline'} className="min-h-11 sm:min-h-9">
                      <Link href={`/dashboard/interview-sim/${encodeURIComponent(h.id)}`}>{h.status === 'active' ? 'Continue' : 'View report'}</Link>
                    </Button>
                    {h.status !== 'active' && (
                      <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={busyId === h.id || left === 0} onClick={() => void start(h.id)} aria-label={`Retake ${roundLabel(h.round)} for ${h.role}`}>
                        <RotateCcw className="h-4 w-4" aria-hidden /><span className="ml-1 hidden sm:inline">Retake</span>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={busyId === h.id} onClick={() => void remove(h.id)} aria-label="Delete interview">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
