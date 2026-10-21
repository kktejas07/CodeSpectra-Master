'use client'

/**
 * Admin → Mock interviews: caps and privacy settings for the AI mock-interview
 * simulator (/dashboard/interview-sim). API: /api/admin/interview-sim.
 */
import { useEffect, useState } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { DEFAULT_SIM_SETTINGS, type InterviewSimSettings } from '@/lib/interview-sim/types'

interface Overview {
  settings: InterviewSimSettings
  usage: { month_cost_usd: number; month_sessions: number; today_sessions: number; recordings: number }
}

const NUMBER_FIELDS: Array<{ key: keyof InterviewSimSettings; label: string; hint: string; step?: string; min: number; max: number }> = [
  { key: 'daily_sessions_per_user', label: 'Sessions per learner per day', hint: '0 stops new sessions.', min: 0, max: 50 },
  { key: 'questions_per_session', label: 'Questions per session', hint: '5 to 10.', min: 5, max: 10 },
  { key: 'max_followups_per_question', label: 'Follow-ups per question', hint: '0 to 2.', min: 0, max: 2 },
  { key: 'monthly_cost_cap_usd', label: 'Monthly AI cap (USD)', hint: 'All learners together, estimated from tokens.', step: '0.5', min: 0, max: 5000 },
  { key: 'session_cost_cap_usd', label: 'AI cap per session (USD)', hint: 'The interview wraps up when reached.', step: '0.05', min: 0.01, max: 5 },
  { key: 'recording_retention_days', label: 'Keep recordings (days)', hint: 'Deleted automatically after this.', min: 1, max: 365 },
]
const TOGGLES: Array<{ key: keyof InterviewSimSettings; label: string }> = [
  { key: 'enabled', label: 'Mock interviews on' },
  { key: 'allow_voice', label: 'Allow voice answers' },
  { key: 'allow_recordings', label: 'Allow optional recordings' },
]

export default function AdminInterviewSimPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [data, setData] = useState<Overview | null>(null)
  const [form, setForm] = useState<InterviewSimSettings>(DEFAULT_SIM_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/interview-sim', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Overview) => { setData(d); setForm(d.settings) })
      .catch(() => setError('Settings could not be loaded.'))
  }, [gate.ready])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await csrfFetch('/api/admin/interview-sim', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save.')
      setData(j)
      setForm(j.settings)
      addToast({ type: 'success', title: 'Saved', message: 'Mock interview settings updated.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (!gate.ready || (!data && !error)) return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={3} /></div>

  return (
    <div className="w-full space-y-6">
      <PageHeader className="mb-0" icon={<Mic aria-hidden />} title="Mock interviews" description="Caps, voice and recording settings for the AI mock interviewer. Safe defaults apply until you change them." />
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="AI spend this month" value={<span className="font-mono">${data.usage.month_cost_usd.toFixed(2)}</span>} hint={`of $${data.settings.monthly_cost_cap_usd.toFixed(2)} cap`} />
          <StatCard label="Sessions this month" value={data.usage.month_sessions} />
          <StatCard label="Sessions today" value={data.usage.today_sessions} />
          <StatCard label="Stored recordings" value={data.usage.recordings} />
        </div>
      )}
      <Panel>
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="flex flex-wrap gap-6">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(form[t.key])} onChange={(e) => setForm((f) => ({ ...f, [t.key]: e.target.checked }))} />
                {t.label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NUMBER_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`sim-${f.key}`}>{f.label}</Label>
                <Input id={`sim-${f.key}`} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step ?? '1'} value={String(form[f.key])} onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: Number(e.target.value) }))} className="h-11 rounded-xl tabular-nums" />
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <Button type="submit" className="min-h-11 rounded-full px-6" disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Saving…</> : 'Save settings'}
          </Button>
        </form>
      </Panel>
    </div>
  )
}
