'use client'

/** Superadmin: caps for résumé AI writing help (lib/career-ai). Admin pages are English-only. */
import { useEffect, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CareerAiSettings, CareerAiUsage } from '@/lib/career-ai/settings'

export function CareerAiCaps() {
  const [s, setS] = useState<CareerAiSettings | null>(null)
  const [usage, setUsage] = useState<CareerAiUsage | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch('/api/admin/career-ai', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json()).then((j) => { setS(j.settings ?? null); setUsage(j.usage ?? null) }).catch(() => setNote('Could not load the AI caps.'))
  }, [])
  if (!s) return note ? <p className="text-sm text-destructive">{note}</p> : null
  const num = (k: keyof CareerAiSettings, label: string, step = 1) => (
    <div className="space-y-1.5">
      <Label htmlFor={`cai-${k}`}>{label}</Label>
      <Input id={`cai-${k}`} type="number" min={0} step={step} value={Number(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </div>
  )
  const save = async () => {
    setBusy(true)
    setNote('')
    try {
      const r = await csrfFetch('/api/admin/career-ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || 'Could not save')
      setS(j.settings)
      setNote('Saved.')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="space-y-4 p-5">
      <h2 className="text-base font-semibold text-foreground">Résumé AI writing caps</h2>
      <p className="text-sm text-muted-foreground">
        Summary and bullet suggestions in the résumé builder. Each call also costs the learner one AI credit.
        {usage ? ` Today: ${usage.day_count} calls · this month: $${(usage.month_cost_usd || 0).toFixed(2)}.` : ''}
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
        <input type="checkbox" className="h-5 w-5" checked={s.resume_ai} onChange={(e) => setS({ ...s, resume_ai: e.target.checked })} />
        AI writing help on
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {num('daily_cap', 'Platform calls per day')}
        {num('per_user_daily_cap', 'Calls per learner per day')}
        {num('monthly_cost_cap_usd', 'Monthly cost cap (USD)', 0.5)}
        {num('cost_per_call_usd', 'Estimated cost per call (USD)', 0.001)}
      </div>
      <div className="flex items-center gap-3">
        <Button className="min-h-11" disabled={busy} onClick={() => void save()}>Save caps</Button>
        {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
    </Panel>
  )
}
