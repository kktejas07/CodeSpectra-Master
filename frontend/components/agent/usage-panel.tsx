'use client'

/**
 * Copilot usage & limits (AGT-001): today's / this month's tokens against the
 * organisation's budget, cost and credits per day, and — for platform admins —
 * the budget, rate-limit and credit settings. Numbers come from
 * GET /api/admin/agent/usage; settings from /api/admin/agent/settings.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gauge, Loader2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Budget { ok: boolean; daily: { used: number; limit: number }; monthly: { used: number; limit: number } }
interface Report {
  totals: { tokens: number; cost_usd: number; credits: number; turns: number }
  daily: { day: string; tokens: number; cost_usd: number; credits: number; turns: number }[]
  budget?: Budget
  settings?: Record<string, unknown>
}

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (u: number, l: number) => (l > 0 ? Math.min(100, Math.round((u / l) * 100)) : 0)

const EDITABLE: { key: string; label: string; help: string }[] = [
  { key: 'tenant_daily_tokens', label: 'Organisation tokens per day', help: '0 = no limit' },
  { key: 'tenant_monthly_tokens', label: 'Organisation tokens per month', help: '0 = no limit' },
  { key: 'platform_daily_tokens', label: 'Platform (no organisation) tokens per day', help: '0 = no limit' },
  { key: 'user_messages_per_minute', label: 'Messages per admin per minute', help: '1–120' },
  { key: 'user_messages_per_hour', label: 'Messages per admin per hour', help: '1–5000' },
  { key: 'max_steps_per_turn', label: 'Steps per message', help: '2–16' },
  { key: 'max_tokens_per_turn', label: 'Tokens per message', help: '10,000–1,000,000' },
]

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{fmt(used)}{limit > 0 ? ` / ${fmt(limit)}` : ' (no limit)'} tokens</span>
      </div>
      {limit > 0 && <Progress value={pct(used, limit)} aria-label={`${label}: ${pct(used, limit)}% used`} />}
    </div>
  )
}

export function UsagePanel({ isSuper, budget }: { isSuper: boolean; budget: Budget | null }) {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/agent/usage?days=30', { credentials: 'include', cache: 'no-store' })
      const d = (await r.json()) as Report & { error?: string }
      if (!r.ok) throw new Error(d.error || 'Could not load usage.')
      setReport(d)
      if (d.settings) {
        const s = d.settings as Record<string, unknown>
        const meter = (s.meter ?? {}) as Record<string, unknown>
        setForm({
          ...Object.fromEntries(EDITABLE.map((f) => [f.key, s[f.key] != null ? String(s[f.key]) : ''])),
          tokensPerCredit: meter.tokensPerCredit != null ? String(meter.tokensPerCredit) : '',
          usdPerCredit: meter.usdPerCredit != null ? String(meter.usdPerCredit) : '',
        })
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  const save = async () => {
    setSaving(true)
    setSaved(null)
    setErr(null)
    const body: Record<string, unknown> = {}
    for (const f of EDITABLE) if (form[f.key]?.trim()) body[f.key] = Number(form[f.key])
    body.meter = { ...(form.tokensPerCredit ? { tokensPerCredit: Number(form.tokensPerCredit) } : {}), ...(form.usdPerCredit ? { usdPerCredit: Number(form.usdPerCredit) } : {}) }
    try {
      const r = await csrfFetch('/api/admin/agent/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(d.error || 'Could not save.')
      setSaved('Saved. New limits apply within a minute.')
      void load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const b = report?.budget ?? budget
  const near = b && ((b.daily.limit > 0 && b.daily.used / b.daily.limit >= 0.8) || (b.monthly.limit > 0 && b.monthly.used / b.monthly.limit >= 0.8))

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="h-8 gap-1.5 rounded-full px-3">
        <Gauge aria-hidden />
        Usage
        {b && !b.ok ? <Badge variant="outline" className="ml-1 border-destructive/40 text-destructive">Limit reached</Badge> : near ? <Badge variant="warning" className="ml-1">80%+</Badge> : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[92vw] max-w-md overflow-y-auto p-5">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle>Copilot usage and limits</SheetTitle>
            <SheetDescription>Every message is charged for the AI it actually uses. Your organisation has a daily and a monthly budget.</SheetDescription>
          </SheetHeader>
          {loading && !report ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : null}
          {err && <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{err}</p>}
          {b && (
            <section className="space-y-3">
              <Meter label="Today" used={b.daily.used} limit={b.daily.limit} />
              <Meter label="This month" used={b.monthly.used} limit={b.monthly.limit} />
            </section>
          )}
          {report && (
            <section className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                ['Messages', fmt(report.totals.turns)],
                ['Credits', fmt(report.totals.credits)],
                ['Model cost', `$${report.totals.cost_usd.toFixed(2)}`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-muted/50 px-2 py-3">
                  <p className="text-lg font-semibold tabular-nums text-foreground">{v}</p>
                  <p className="text-xs text-muted-foreground">{l} · 30 days</p>
                </div>
              ))}
            </section>
          )}
          {report && report.daily.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-foreground">Last days</h3>
              <ul className="space-y-1 text-sm">
                {report.daily.slice(-7).reverse().map((d) => (
                  <li key={d.day} className="flex justify-between gap-2 tabular-nums">
                    <span className="text-muted-foreground">{d.day}</span>
                    <span className="text-foreground">{fmt(d.tokens)} tokens · {fmt(d.credits)} credits</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {isSuper && report?.settings && (
            <section className="mt-6 space-y-3 border-t border-border/70 pt-5">
              <h3 className="text-sm font-medium text-foreground">Budgets and limits (platform admins)</h3>
              {EDITABLE.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label htmlFor={`budget-${f.key}`} className="text-sm">{f.label}</Label>
                  <Input id={`budget-${f.key}`} type="number" inputMode="numeric" value={form[f.key] ?? ''} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="budget-tpc" className="text-sm">Tokens per credit</Label>
                  <Input id="budget-tpc" type="number" inputMode="numeric" value={form.tokensPerCredit ?? ''} onChange={(e) => setForm((x) => ({ ...x, tokensPerCredit: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="budget-upc" className="text-sm">US$ per credit</Label>
                  <Input id="budget-upc" type="number" inputMode="decimal" step="0.001" value={form.usdPerCredit ?? ''} onChange={(e) => setForm((x) => ({ ...x, usdPerCredit: e.target.value }))} />
                </div>
              </div>
              {saved && <p className="text-sm text-green-700 dark:text-green-400" role="status">{saved}</p>}
              <Button onClick={() => void save()} disabled={saving} className="min-h-11 sm:min-h-9">
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                Save limits
              </Button>
            </section>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
