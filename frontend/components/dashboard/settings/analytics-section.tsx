'use client'

/**
 * Admin → Settings → Analytics & tracking (superadmin). First-party analytics
 * always runs (privacy-friendly, no third party); the tools below are optional
 * and load in visitors' browsers only after they consent — analytics tools
 * with "analytics", ad tags with "marketing". Saved to
 * platform_settings.secrets via /api/admin/server-secrets (ids are validated
 * there and again before they are rendered).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Check, Loader2, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { INTEGRATION_FIELDS } from '@/lib/analytics/integrations'
import { DEFAULT_CLIENT_EVENTS, validateCustomEventList } from '@/lib/analytics/guard'

type Values = Record<string, string>
const KEYS = [...INTEGRATION_FIELDS.map((f) => f.key), 'analytics_retention_days', 'analytics_custom_events'] as const

export function AnalyticsSettingsSection() {
  const addToast = useToast()
  const [values, setValues] = useState<Values>({})
  const [saved, setSaved] = useState<Values>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const v: Values = {}
        for (const k of KEYS) v[k] = typeof j?.secrets?.[k] === 'string' ? j.secrets[k] : ''
        setValues(v)
        setSaved(v)
      })
      .catch(() => addToast({ type: 'error', title: 'Could not load analytics settings' }))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const errorFor = (key: string): string | null => {
    const v = (values[key] || '').trim()
    if (!v) return null
    if (key === 'analytics_custom_events') return validateCustomEventList(v)
    if (key === 'analytics_retention_days') {
      const n = Number(v)
      return Number.isInteger(n) && n >= 30 && n <= 1500 ? null : 'Whole number of days, 30–1500.'
    }
    const def = INTEGRATION_FIELDS.find((f) => f.key === key)
    return def && !def.pattern.test(v) ? `Expected something like ${def.placeholder}` : null
  }
  const invalid = KEYS.some((k) => errorFor(k))
  const dirty = KEYS.some((k) => (values[k] || '') !== (saved[k] || ''))

  const save = async () => {
    if (invalid) return
    setSaving(true)
    try {
      const body: Record<string, string | null> = {}
      for (const k of KEYS) if ((values[k] || '') !== (saved[k] || '')) body[k] = values[k].trim() || null
      const r = await csrfFetch('/api/admin/server-secrets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Save failed')
      setSaved({ ...values })
      addToast({ type: 'success', title: 'Analytics settings saved' })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" aria-label="Loading" />

  const field = (key: string, label: string, placeholder: string, hint?: string, type = 'text') => {
    const err = errorFor(key)
    const configured = !!(saved[key] || '').trim()
    return (
      <div key={key} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`an-${key}`}>{label}</Label>
          {configured && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"><Check className="h-3.5 w-3.5" aria-hidden="true" />Set</span>}
        </div>
        <Input id={`an-${key}`} type={type} inputMode={type === 'number' ? 'numeric' : undefined} value={values[key] || ''} placeholder={placeholder} aria-invalid={!!err} aria-describedby={`an-${key}-h`} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
        <p id={`an-${key}-h`} className={err ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{err || hint}</p>
      </div>
    )
  }

  const group = (category: 'analytics' | 'marketing') => INTEGRATION_FIELDS.filter((f) => f.category === category).map((f) => field(f.key, f.label, f.placeholder, f.hint))

  return (
    <Card className="rounded-3xl border-border/70 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">Analytics & tracking</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          CodeSpectra&apos;s own analytics always runs and stores no IP addresses. Add the tools below only if you need them — they load
          in a visitor&apos;s browser only after that visitor agrees in the cookie banner. See the dashboards in{' '}
          <Link href="/dashboard/admin/analytics" className="font-medium text-primary underline-offset-4 hover:underline">Analytics</Link>.
        </p>
      </div>
      <div className="space-y-8 px-6 py-6">
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Analytics tools</h3>
            <p className="text-xs text-muted-foreground">Load with the visitor&apos;s analytics consent.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">{group('analytics')}</div>
        </section>
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ad and conversion tags</h3>
            <p className="text-xs text-muted-foreground">Load with marketing consent only; never when the browser sends Global Privacy Control or Do Not Track. Sign-ups and purchases are passed on as conversions.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">{group('marketing')}</div>
        </section>
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Data retention</h3>
            <p className="text-xs text-muted-foreground">Raw events are deleted automatically after this many days. Daily totals used by the dashboards are kept.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">{field('analytics_retention_days', 'Keep raw events for (days)', '400', 'Default 400 days.', 'number')}</div>
        </section>
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Custom events</h3>
            <p className="text-xs text-muted-foreground">Browsers can only send these event names; anything else is dropped. Always allowed: {DEFAULT_CLIENT_EVENTS.join(', ')}.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">{field('analytics_custom_events', 'Extra custom events', 'quiz_started, demo_booked', 'Comma-separated, lower_snake_case.')}</div>
        </section>
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving || invalid || !dirty} className="min-h-11">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            Save
          </Button>
        </div>
      </div>
    </Card>
  )
}
