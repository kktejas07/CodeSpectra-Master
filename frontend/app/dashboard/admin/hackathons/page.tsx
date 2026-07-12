'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Plus, CalendarDays, Users, Timer, Trophy,
  ExternalLink, Trash2, HelpCircle, CheckSquare, ListChecks,
  Shield, GripVertical,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'

interface Hackathon {
  id: string; name: string; slug: string; description?: string
  num_teams: number; max_per_team: number; timeout_minutes: number
  starts_at: string; ends_at: string; status: string
  tasks: { problem_slug: string; problem_title: string; points: number; difficulty: string; required: boolean }[]
  rules: { type: string; title: string; description: string }[]
  scoring: { auto_grade: boolean; points_per_problem: number; bonus_time: number; penalty_per_attempt: number }
  results_released: boolean
  created_at: string
}

interface ProblemOption { slug: string; title: string; difficulty: string; topics?: string[] }

export default function HackathonsAdminPage() {
  const gate = usePageGuard('superadmin')
  const [items, setItems] = useState<Hackathon[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    name: '',
    description: '',
    num_teams: 8,
    max_per_team: 4,
    timeout_minutes: 60,
    starts_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    tasks: [] as { slug: string; title: string; points: number; difficulty: string; required: boolean }[],
    rules: [
      { type: 'scoring' as const, title: 'Scoring', description: 'Points are awarded based on test cases passed and code quality.' },
      { type: 'submission' as const, title: 'Submissions', description: 'Unlimited submissions during the event window. Last submission counts.' },
      { type: 'conduct' as const, title: 'Code of Conduct', description: 'Plagiarism or collusion with other teams will result in disqualification.' },
    ],
    scoring: { auto_grade: true, points_per_problem: 100, bonus_time: 0, penalty_per_attempt: 0 },
    banner_url: '',
    color_theme: '',
  })
  const [problemSearch, setProblemSearch] = useState('')
  const [problemResults, setProblemResults] = useState<ProblemOption[]>([])
  const [searchingProblems, setSearchingProblems] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/hackathons', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setItems(j.items as Hackathon[])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const searchProblems = useCallback(async (q: string) => {
    if (!q.trim()) { setProblemResults([]); return }
    setSearchingProblems(true)
    try {
      const res = await fetch(`/api/problems?search=${encodeURIComponent(q)}&limit=10`)
      const j = await res.json()
      setProblemResults((j.items || j.data || []) as ProblemOption[])
    } catch { setProblemResults([]) }
    finally { setSearchingProblems(false) }
  }, [])

  async function create() {
    if (!form.name.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/hackathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, description: form.description,
          num_teams: form.num_teams, max_per_team: form.max_per_team,
          timeout_minutes: form.timeout_minutes,
          starts_at: new Date(form.starts_at).toISOString(),
          tasks: form.tasks.map((t) => ({
            problem_slug: t.slug, problem_title: t.title,
            points: t.points, difficulty: t.difficulty, required: t.required,
          })),
          rules: form.rules,
          scoring: form.scoring,
          banner_url: form.banner_url, color_theme: form.color_theme,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setCreating(false); setStep(1)
      setForm((f) => ({ ...f, name: '', description: '' }))
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6" data-testid="hackathons-admin-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-primary" /> Hackathon events
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create coding competitions, assign problems, manage teams, and release results.
          </p>
        </div>
        <Button onClick={() => { setCreating(true); setStep(1) }} data-testid="hackathon-new-btn">
          <Plus className="mr-1 h-4 w-4" /> New event
        </Button>
      </div>

      {error && <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}

      {creating && (
        <Card className="space-y-6 p-6">
          {/* Step indicator */}
          <div className="flex gap-3 text-sm">
            {[
              { n: 1, label: 'Basics' },
              { n: 2, label: 'Problems' },
              { n: 3, label: 'Rules & Scoring' },
            ].map((s) => (
              <button key={s.n} onClick={() => setStep(s.n)}
                className={`px-4 py-2 rounded-lg transition-colors ${step === s.n ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {s.n}. {s.label}
              </button>
            ))}
          </div>

          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Event Details</h3>
              <div className="space-y-2">
                <Label>Event name</Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Frostbyte Winter 2026" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the event, theme, and what participants will build..." />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Teams allowed</Label>
                  <Input type="number" min={1} max={500} value={form.num_teams} onChange={(e) => setForm((f) => ({ ...f, num_teams: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Max per team</Label>
                  <Input type="number" min={1} max={20} value={form.max_per_team} onChange={(e) => setForm((f) => ({ ...f, max_per_team: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input type="number" min={5} value={form.timeout_minutes} onChange={(e) => setForm((f) => ({ ...f, timeout_minutes: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <Label>Starts at</Label>
                <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Ends at {new Date(new Date(form.starts_at).getTime() + form.timeout_minutes * 60000).toLocaleString()}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Banner image URL (optional)</Label>
                  <Input value={form.banner_url} onChange={(e) => setForm((f) => ({ ...f, banner_url: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <Label>Color theme (optional)</Label>
                  <Input value={form.color_theme} onChange={(e) => setForm((f) => ({ ...f, color_theme: e.target.value }))} placeholder="blue, purple, #ff6600" />
                </div>
              </div>
              <Button onClick={() => setStep(2)}>Next: Problems →</Button>
            </div>
          )}

          {/* Step 2: Problem/Task Selection */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Assign Problems</h3>
              <p className="text-sm text-muted-foreground">Search and select problems to include in this event.</p>

              <div className="flex gap-2">
                <Input placeholder="Search problems..." value={problemSearch}
                  onChange={(e) => { setProblemSearch(e.target.value); searchProblems(e.target.value) }} />
              </div>

              {searchingProblems && <p className="text-xs text-muted-foreground">Searching...</p>}

              {problemResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {problemResults.map((p) => {
                    const added = form.tasks.find((t) => t.slug === p.slug)
                    return (
                      <div key={p.slug} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{p.title}</p>
                          <p className="text-xs text-muted-foreground">{p.slug} · {p.difficulty}</p>
                        </div>
                        {added ? (
                          <Badge variant="outline" className="shrink-0">Added</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({
                            ...f, tasks: [...f.tasks, { slug: p.slug, title: p.title, points: 100, difficulty: p.difficulty, required: true }]
                          }))}>Add</Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {form.tasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Problems ({form.tasks.length})</p>
                  {form.tasks.map((t, i) => (
                    <div key={t.slug} className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.difficulty}</p>
                      </div>
                      <Input type="number" className="w-20 h-8 text-xs" value={t.points}
                        onChange={(e) => {
                          const points = Number(e.target.value)
                          setForm((f) => ({ ...f, tasks: f.tasks.map((x, idx) => idx === i ? { ...x, points } : x) }))
                        }} />
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => setForm((f) => ({ ...f, tasks: f.tasks.filter((_, idx) => idx !== i) }))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button onClick={() => setStep(3)}>Next: Rules →</Button>
              </div>
            </div>
          )}

          {/* Step 3: Rules & Scoring */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Rules & Scoring</h3>

              <div className="space-y-4">
                {form.rules.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{r.type}</Badge>
                      <Button size="sm" variant="ghost" className="text-destructive h-6"
                        onClick={() => setForm((f) => ({ ...f, rules: f.rules.filter((_, idx) => idx !== i) }))}>
                        Remove
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Rule title</Label>
                      <Input value={r.title}
                        onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea rows={2} value={r.description}
                        onChange={(e) => setForm((f) => ({ ...f, rules: f.rules.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) }))} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm((f: any) => ({
                  ...f, rules: [...f.rules, { type: 'general' as const, title: '', description: '' }]
                }))}>+ Add Rule</Button>
              </div>

              <div className="rounded border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Scoring Configuration</h4>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Points per problem</Label>
                    <Input type="number" value={form.scoring.points_per_problem}
                      onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, points_per_problem: Number(e.target.value) } }))} />
                  </div>
                  <div>
                    <Label>Bonus time (early submit bonus)</Label>
                    <Input type="number" value={form.scoring.bonus_time}
                      onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, bonus_time: Number(e.target.value) } }))} />
                  </div>
                  <div>
                    <Label>Penalty per attempt</Label>
                    <Input type="number" value={form.scoring.penalty_per_attempt}
                      onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, penalty_per_attempt: Number(e.target.value) } }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="auto_grade" checked={form.scoring.auto_grade}
                    onChange={(e) => setForm((f) => ({ ...f, scoring: { ...f.scoring, auto_grade: e.target.checked } }))} />
                  <Label htmlFor="auto_grade">Auto-grade submissions on submit</Label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button onClick={create} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Create Event
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading events…
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hackathon events yet. Click <strong>New event</strong> to host your first one.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((hk) => (
            <Card key={hk.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/hackathons/${hk.slug}`} className="text-lg font-semibold hover:underline">{hk.name}</Link>
                  <p className="text-xs text-muted-foreground">/{hk.slug} · {hk.tasks?.length || 0} problems</p>
                </div>
                <Badge variant={hk.status === 'live' ? 'default' : 'secondary'} className="uppercase">{hk.status}</Badge>
              </div>
              {hk.description && <p className="text-xs text-muted-foreground line-clamp-2">{hk.description}</p>}
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <Stat icon={<Users />} label="Teams" value={hk.num_teams} />
                <Stat icon={<Users />} label="Per team" value={hk.max_per_team} />
                <Stat icon={<Timer />} label="Mins" value={hk.timeout_minutes} />
                <Stat icon={<ListChecks />} label="Problems" value={hk.tasks?.length || 0} />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {new Date(hk.starts_at).toLocaleString()} → {new Date(hk.ends_at).toLocaleTimeString()}
              </div>
              <div className="flex gap-2 pt-2">
                <Link href={`/hackathons/${hk.slug}`}>
                  <Button variant="outline" size="sm">Open <ExternalLink className="ml-1 h-3 w-3" /></Button>
                </Link>
                <Link href={`/dashboard/admin/hackathons/${hk.id}`}>
                  <Button variant="outline" size="sm">Manage</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (!confirm(`Delete "${hk.name}"? Only allowed if 0 teams have registered.`)) return
                  const res = await fetch(`/api/hackathons/${hk.id}`, { method: 'DELETE' })
                  if (res.ok) await load()
                }} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded border border-border/40 bg-muted/30 px-2 py-1">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}
