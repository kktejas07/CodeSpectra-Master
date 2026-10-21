'use client'

import { useCallback, useEffect, useState } from 'react'
import { Flag, UserSearch } from 'lucide-react'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/hiring/ui'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import type { TalentSettings } from '@/lib/talent/core'

interface Report { id: string; tenant_id: string; tenant_name: string | null; reason: string; details: string | null; status: string; created_at: string }

const NUM_FIELDS: Array<{ key: keyof Omit<TalentSettings, 'enabled'>; label: string; hint: string }> = [
  { key: 'monthly_invites_per_tenant', label: 'Invites per organisation per month', hint: '0 stops all new invites.' },
  { key: 'searches_per_hour_per_user', label: 'Searches per recruiter per hour', hint: 'Rate limit against scraping.' },
  { key: 'invites_per_day_per_user', label: 'Invites per recruiter per day', hint: 'Rate limit against spam.' },
]

export default function AdminTalentPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [settings, setSettings] = useState<TalentSettings | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/talent', { credentials: 'include', cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Couldn’t load talent settings.')
      setSettings(j.settings)
      setReports(j.reports || [])
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/talent', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Couldn’t save.')
      setSettings(j.settings)
      addToast({ type: 'success', title: 'Talent search settings saved' })
    } catch (e) {
      addToast({ type: 'error', title: 'Not saved', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (!gate.ready) return null
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader title="Talent search" description="Caps for recruiter search and invites, and reports learners sent about recruiters." icon={<UserSearch />} />
      {error && <EmptyState illustration="error" title="Couldn’t load" description={error} actionLabel="Try again" onAction={() => void load()} />}
      {settings && (
        <Section title="Limits">
          <Panel className="space-y-5">
            <label className="flex items-center gap-3 text-sm font-medium text-foreground">
              <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} aria-label="Talent search on" />
              Talent search is {settings.enabled ? 'on' : 'off'}
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              {NUM_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`ts-${f.key}`}>
                  <Input id={`ts-${f.key}`} inputMode="numeric" value={String(settings[f.key])} onChange={(e) => setSettings({ ...settings, [f.key]: Number(e.target.value.replace(/\D/g, '') || 0) })} />
                </Field>
              ))}
            </div>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
          </Panel>
        </Section>
      )}
      <Section title="Reports about recruiters">
        {reports.length === 0 ? (
          <EmptyState compact illustration="security" title="No reports" description="When a learner reports an organisation, it shows up here." />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Panel className="flex items-start gap-3 p-5">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.tenant_name || r.tenant_id} · <span className="capitalize">{r.reason.replace(/_/g, ' ')}</span></p>
                    {r.details && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.details}</p>}
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">{new Date(r.created_at).toLocaleString()}</p>
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
