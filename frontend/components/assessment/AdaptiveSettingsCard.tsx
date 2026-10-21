'use client'

/**
 * Adaptive test settings for the test editor. When on, candidates get one
 * question at a time from the approved bank for the chosen domain (the fixed
 * question list below is not used); each answer moves the next question up or
 * down a level. Warns when a level has fewer than 50 approved questions.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Save, TrendingUp } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ADAPTIVE_LENGTH_DEFAULT, ADAPTIVE_LENGTH_MAX } from '@/lib/adaptive-test'

interface Payload {
  settings: { adaptive: boolean; adaptive_domain: string | null; adaptive_length: number }
  domains: Array<{ id: string; label: string; active: boolean }>
  pool: { domain: string; counts: Record<'Easy' | 'Medium' | 'Hard', number>; thin: Array<{ difficulty: string; count: number }>; min: number } | null
}

export function AdaptiveSettingsCard({ examId, onSaved }: { examId: string; onSaved?: (s: Payload['settings']) => void }) {
  const addToast = useToast()
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)
  const [on, setOn] = useState(false)
  const [domain, setDomain] = useState('')
  const [length, setLength] = useState(String(ADAPTIVE_LENGTH_DEFAULT))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (forDomain?: string) => {
    try {
      const qs = forDomain ? `?domain=${encodeURIComponent(forDomain)}` : ''
      const r = await fetch(`/api/exams/${encodeURIComponent(examId)}/adaptive${qs}`, { credentials: 'include' })
      if (!r.ok) throw new Error()
      const d = (await r.json()) as Payload
      setData(d)
      setFailed(false)
      return d
    } catch {
      setFailed(true)
      return null
    }
  }, [examId])

  useEffect(() => {
    void load().then((d) => {
      if (!d) return
      setOn(d.settings.adaptive)
      setDomain(d.settings.adaptive_domain ?? '')
      setLength(String(d.settings.adaptive_length || ADAPTIVE_LENGTH_DEFAULT))
    })
  }, [load])

  const pickDomain = (id: string) => {
    setDomain(id)
    if (id) void load(id)
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await csrfFetch(`/api/exams/${encodeURIComponent(examId)}/adaptive`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adaptive: on, adaptive_domain: domain || null, adaptive_length: Number(length) }),
      })
      const j = await r.json().catch(() => ({})) as { error?: string; settings?: Payload['settings'] }
      if (!r.ok || !j.settings) throw new Error(j.error || 'Could not save')
      addToast({ type: 'success', title: on ? 'Adaptive mode is on' : 'Adaptive mode is off' })
      onSaved?.(j.settings)
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (failed && !data) return null
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><TrendingUp className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Adaptive mode</h2>
            <p className="text-sm text-muted-foreground">One question at a time from the approved bank. Two right in a row → harder; a wrong answer → easier. Harder questions count for more.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="adaptive-on" checked={on} onCheckedChange={setOn} disabled={!data} />
          <Label htmlFor="adaptive-on">{on ? 'On' : 'Off'}</Label>
        </div>
      </div>

      {on ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="adaptive-domain">Questions from</Label>
            <select
              id="adaptive-domain"
              value={domain}
              onChange={(e) => pickDomain(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Pick a domain</option>
              {(data?.domains ?? []).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="adaptive-length">Number of questions</Label>
            <Input id="adaptive-length" type="number" min={3} max={ADAPTIVE_LENGTH_MAX} inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} className="mt-1 tabular-nums" />
          </div>
          {domain && data?.pool && data.pool.domain === domain ? (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                Approved questions ready: <span className="tabular-nums text-foreground">Easy {data.pool.counts.Easy} · Medium {data.pool.counts.Medium} · Hard {data.pool.counts.Hard}</span>
              </p>
              {data.pool.thin.length ? (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Fewer than {data.pool.min} approved questions at {data.pool.thin.map((t) => `${t.difficulty} (${t.count})`).join(', ')}. The test still runs — it borrows from the nearest level and ends early if the bank runs out — but candidates may see a narrow set. Approve more drafts or run the question bot.
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground sm:col-span-2">While adaptive mode is on, the question list below is not shown to candidates.</p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={saving || !data || (on && !domain)}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-4 w-4" aria-hidden />}
          Save adaptive settings
        </Button>
      </div>
    </Panel>
  )
}
