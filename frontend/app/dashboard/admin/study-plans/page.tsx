'use client'

/** Admin → Study plans: AI coach-note switch and spend caps (plan selection never uses AI). */
import { useEffect, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, StatCard, BentoGrid } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface S { ai_notes: boolean; daily_ai_cap: number; monthly_cost_cap_usd: number; default_reminder_hour: number; usage: { day: string | null; day_count: number; month: string | null; month_cost_usd: number } }

export default function AdminStudyPlansPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [s, setS] = useState<S | null>(null)
  const [active, setActive] = useState(0)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/study-plans/settings', { cache: 'no-store' }).then((r) => r.json().then((j) => { if (!r.ok) throw new Error(); setS(j.settings); setActive(j.active_plans) })).catch(() => setErr(true))
  }, [gate.ready])
  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title="We could not load study plan settings" description="Reload the page to try again." />
  if (!s) return <div className="h-40 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
  const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7)
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Study plans" icon={<CalendarCheck />} description="Plans are chosen by fixed rules from each learner's results. AI only writes the short weekly coach note, within these caps." />
      <BentoGrid className="mb-6">
        <StatCard label="Active plans" value={active} />
        <StatCard label="AI notes today" value={s.usage.day === today ? s.usage.day_count : 0} hint={`cap ${s.daily_ai_cap}`} />
        <StatCard label="AI spend this month" value={`$${(s.usage.month === month ? s.usage.month_cost_usd : 0).toFixed(2)}`} hint={`cap $${s.monthly_cost_cap_usd.toFixed(2)}`} />
      </BentoGrid>
      <Panel className="p-5 sm:p-6">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const r = await csrfFetch('/api/admin/study-plans/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_notes: s.ai_notes, daily_ai_cap: s.daily_ai_cap, monthly_cost_cap_usd: s.monthly_cost_cap_usd, default_reminder_hour: s.default_reminder_hour }) })
            const j = await r.json()
            if (!r.ok) throw new Error(j.error || 'Could not save')
            setS(j.settings)
            addToast({ type: 'success', title: 'Settings saved' })
          } catch (x) { addToast({ type: 'error', title: (x as Error).message }) } finally { setBusy(false) }
        }}>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={s.ai_notes} onChange={(e) => setS({ ...s, ai_notes: e.target.checked })} />Write weekly coach notes with AI (otherwise a fixed template is used)</label>
          <div><Label htmlFor="sp-dc">AI notes per day</Label><Input id="sp-dc" type="number" min={0} max={10000} value={s.daily_ai_cap} onChange={(e) => setS({ ...s, daily_ai_cap: Number(e.target.value) })} /></div>
          <div><Label htmlFor="sp-mc">Monthly AI cap (USD)</Label><Input id="sp-mc" type="number" min={0} max={500} step="0.5" value={s.monthly_cost_cap_usd} onChange={(e) => setS({ ...s, monthly_cost_cap_usd: Number(e.target.value) })} /></div>
          <div><Label htmlFor="sp-rh">Default reminder hour (learner time)</Label><Input id="sp-rh" type="number" min={0} max={23} value={s.default_reminder_hour} onChange={(e) => setS({ ...s, default_reminder_hour: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-[44px] rounded-full">{busy ? 'Saving…' : 'Save'}</Button></div>
        </form>
      </Panel>
    </div>
  )
}
