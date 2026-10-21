'use client'

/**
 * Hiring settings → Background checks: vendor keys (Checkr, IDfy, AuthBridge), default and
 * critical checks per region, consent / disclosure texts (versioned) and US
 * state notices, retention, reminders, deadlines, adverse-action waiting days.
 * Admins edit; recruiters can read. Keys are write-only.
 */
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Panel, Section } from '@/components/app/page-kit'
import { HiringShell } from '@/components/hiring/shell'
import { ErrorState, Field, InlineError, LoadingRows, NativeSelect } from '@/components/hiring/ui'
import { atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import { REGION_LABELS, REVIEW_WITH_COUNSEL, US_STATES } from '@/lib/ats/bgv/catalog'
import type { BgvRegion, BgvCheckType } from '@/lib/ats/contract'
import type { BgvRegionSettings, BgvSettingsDoc, BgvStateNotice } from '@/lib/ats/bgv/types'
import { useToast } from '@/lib/toast-context'
import { IndiaVendorSettings, TestConnection, type VendorSettingsData } from '@/components/hiring/bgv/vendor-settings'

type PublicSettings = Omit<BgvSettingsDoc, 'vendor_secret'> & { vendor_keys: Record<string, boolean> & { checkr_api_key: boolean; checkr_webhook_secret: boolean } }
interface Data extends VendorSettingsData {
  settings: PublicSettings
  can_manage: boolean
  checks: Record<BgvRegion, { type: BgvCheckType; label: string; candidate_input: boolean }[]>
  vendors: Record<BgvRegion, { id: string; label: string; ready: boolean }[]>
  checkr_webhook_url: string
}

function CheckGrid({ id, all, value, onChange, disabled }: { id: string; all: Data['checks']['IN']; value: BgvCheckType[]; onChange: (v: BgvCheckType[]) => void; disabled: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {all.map((c) => (
        <label key={c.type} htmlFor={`${id}-${c.type}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm hover:bg-muted/40">
          <input id={`${id}-${c.type}`} type="checkbox" className="h-4 w-4 accent-[var(--primary)]" disabled={disabled} checked={value.includes(c.type)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.type] : value.filter((t) => t !== c.type))} />
          <span>{c.label}{!c.candidate_input && <span className="block text-xs text-muted-foreground">run by the vendor</span>}</span>
        </label>
      ))}
    </div>
  )
}

function Inner() {
  const sp = useSearchParams()
  const tenant = sp.get('tenant')
  const q = useAts<Data>(`/api/ats/bgv/settings${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`)
  const addToast = useToast()
  const [form, setForm] = useState<PublicSettings | null>(null)
  const [keys, setKeys] = useState({ checkr_api_key: '', checkr_webhook_secret: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<Record<string, string | null>>({})

  useEffect(() => { if (q.data) setForm(structuredClone(q.data.settings)) }, [q.data])

  if (q.error && !q.data) return <ErrorState message={q.error.message} onRetry={q.reload} />
  if (!q.data || !form) return <LoadingRows rows={5} />
  const d = q.data
  const manage = d.can_manage
  const setRegion = (r: BgvRegion, patch: Partial<BgvRegionSettings>) => setForm({ ...form, regions: { ...form.regions, [r]: { ...form.regions[r], ...patch } } })

  const tenantQuery = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''
  async function save(key: string, body: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(key); setErr((e) => ({ ...e, [key]: null }))
    try {
      const url = `/api/ats/bgv/settings${tenantQuery}`
      const r = await atsSend<{ settings: PublicSettings }>(url, 'PATCH', body)
      q.setData((p) => (p ? { ...p, settings: r.settings } : p))
      setForm((f) => (f ? { ...f, vendor_keys: r.settings.vendor_keys, ...(body.idfy ? { idfy: r.settings.idfy } : {}), ...(body.authbridge ? { authbridge: r.settings.authbridge } : {}) } : f))
      if (key === 'idfy' && (body.rotate_idfy_webhook_token || (body.idfy as { enabled?: boolean } | undefined)?.enabled)) q.reload()
      addToast({ type: 'success', title: okText })
      return true
    } catch (e) {
      setErr((x) => ({ ...x, [key]: errorMessage(e) }))
      return false
    } finally {
      setBusy(null)
    }
  }
  const saveBtn = (key: string, onClick: () => void, label = 'Save') => manage && (
    <Button className="min-h-11" disabled={!!busy} onClick={onClick}>{busy === key && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} {label}</Button>
  )

  const regionSection = (r: BgvRegion) => {
    const reg = form.regions[r]
    const notices = reg.state_notices || []
    const setNotice = (i: number, patch: Partial<BgvStateNotice>) => setRegion(r, { state_notices: notices.map((n, j) => (j === i ? { ...n, ...patch } : n)) })
    return (
      <Section key={r} title={REGION_LABELS[r]} description={r === 'IN' ? 'Consent under the Digital Personal Data Protection Act, 2023.' : 'FCRA standalone disclosure, written authorization and state notices.'}>
        <Panel className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Default checks</h3>
            <p className="text-xs text-muted-foreground">Used when a BGV stage doesn&apos;t pick its own checks.</p>
            <CheckGrid id={`def-${r}`} all={d.checks[r]} value={reg.default_checks} onChange={(v) => setRegion(r, { default_checks: v })} disabled={!manage} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Critical checks</h3>
            <p className="text-xs text-muted-foreground">A discrepancy on one of these makes the result &quot;consider&quot; — a recruiter then decides.</p>
            <CheckGrid id={`crit-${r}`} all={d.checks[r]} value={reg.critical_checks} onChange={(v) => setRegion(r, { critical_checks: v })} disabled={!manage} />
          </div>
          {r === 'US' && reg.disclosure && (
            <Field label={`FCRA disclosure (version ${reg.disclosure.version})`} htmlFor="us-disc" hint="Shown alone on its own page before the authorization — keep anything else off it. {{company}} and {{job_title}} are filled in.">
              <Textarea id="us-disc" rows={10} value={reg.disclosure.text} disabled={!manage} onChange={(e) => setRegion(r, { disclosure: { ...reg.disclosure!, text: e.target.value } })} />
            </Field>
          )}
          <Field label={`${r === 'US' ? 'Authorization' : 'Consent notice'} (version ${reg.consent.version})`} htmlFor={`consent-${r}`} hint="Changing the text creates a new version; signed consents keep the version they signed. Variables: {{company}}, {{job_title}}, {{retention_days}}.">
            <Textarea id={`consent-${r}`} rows={10} value={reg.consent.text} disabled={!manage} onChange={(e) => setRegion(r, { consent: { ...reg.consent, text: e.target.value } })} />
          </Field>
          {r === 'US' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">State notices</h3>
              {notices.map((n, i) => (
                <div key={i} className="space-y-2 rounded-2xl border border-border p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="State" htmlFor={`ns-${i}`}><NativeSelect id={`ns-${i}`} value={n.state} onChange={(v) => setNotice(i, { state: v })} options={US_STATES.map((s) => ({ value: s, label: s }))} disabled={!manage} className="w-24" /></Field>
                    <Field label="Title" htmlFor={`nt-${i}`} className="min-w-48 flex-1"><Input id={`nt-${i}`} value={n.title} onChange={(e) => setNotice(i, { title: e.target.value })} disabled={!manage} /></Field>
                    <Badge variant="outline">v{n.version}</Badge>
                    {manage && <Button variant="ghost" size="sm" className="min-h-9" aria-label={`Remove ${n.state} notice`} onClick={() => setRegion(r, { state_notices: notices.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
                  </div>
                  <label htmlFor={`nx-${i}`} className="sr-only">Notice text</label>
                  <Textarea id={`nx-${i}`} rows={3} value={n.text} onChange={(e) => setNotice(i, { text: e.target.value })} disabled={!manage} />
                </div>
              ))}
              {manage && <Button variant="outline" className="min-h-11" onClick={() => setRegion(r, { state_notices: [...notices, { state: 'CA', title: 'State notice', text: '', version: '1' }] })}><Plus className="h-4 w-4" aria-hidden /> Add state notice</Button>}
            </div>
          )}
          <InlineError message={err[r]} />
          {saveBtn(r, () => void save(r, { regions: { [r]: { default_checks: reg.default_checks, critical_checks: reg.critical_checks, consent: reg.consent.text, ...(r === 'US' ? { disclosure: reg.disclosure?.text, state_notices: notices } : {}) } } }, `${REGION_LABELS[r]} settings saved`))}
        </Panel>
      </Section>
    )
  }

  const num = (key: 'retention_days' | 'reminder_every_days' | 'max_reminders' | 'form_deadline_days' | 'adverse_waiting_days', label: string, hint: string) => (
    <Field label={label} htmlFor={`n-${key}`} hint={hint}>
      <Input id={`n-${key}`} type="number" inputMode="numeric" className="h-11" value={String(form[key])} disabled={!manage} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />
    </Field>
  )

  return (
    <div className="space-y-8">
      <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span>{REVIEW_WITH_COUNSEL} The consent, disclosure and notice texts below are generic starting points; local laws (DPDP Act, FCRA, state and city fair-chance laws) decide what yours must say.</span>
      </p>
      {!manage && <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Only hiring admins can change these settings.</p>}

      <Section title="Vendor: Checkr (USA)" description="Optional. Without a vendor, your team verifies each check manually. India vendors (IDfy, AuthBridge) are below.">
        <Panel className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={form.vendor_keys.checkr_api_key ? 'success' : 'outline'}>{form.vendor_keys.checkr_api_key ? <><CheckCircle2 aria-hidden /> API key set</> : 'No API key'}</Badge>
            <Badge variant={form.vendor_keys.checkr_webhook_secret ? 'success' : 'outline'}>{form.vendor_keys.checkr_webhook_secret ? 'Webhook secret set' : 'Webhook uses the API key'}</Badge>
          </div>
          {manage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Checkr API key" htmlFor="ck-key" hint="Leave empty to keep the current key."><Input id="ck-key" type="password" autoComplete="off" className="h-11" value={keys.checkr_api_key} onChange={(e) => setKeys({ ...keys, checkr_api_key: e.target.value })} /></Field>
              <Field label="Webhook secret (optional)" htmlFor="ck-sec" hint="Checkr signs webhooks with your API key unless you set another secret."><Input id="ck-sec" type="password" autoComplete="off" className="h-11" value={keys.checkr_webhook_secret} onChange={(e) => setKeys({ ...keys, checkr_webhook_secret: e.target.value })} /></Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Package slug" htmlFor="ck-pkg" hint="From your Checkr account, e.g. tasker_standard"><Input id="ck-pkg" className="h-11" value={form.checkr?.package || ''} disabled={!manage} onChange={(e) => setForm({ ...form, checkr: { ...form.checkr!, package: e.target.value } })} /></Field>
            <Field label="Mode" htmlFor="ck-mode" hint="Report: use the data the candidate gave us. Invitation: Checkr's own form."><NativeSelect id="ck-mode" className="h-11" value={form.checkr?.mode || 'report'} disabled={!manage} onChange={(v) => setForm({ ...form, checkr: { ...form.checkr!, mode: v as 'report' | 'invitation' } })} options={[{ value: 'report', label: 'Report' }, { value: 'invitation', label: 'Invitation' }]} /></Field>
            <Field label="Work state" htmlFor="ck-state"><NativeSelect id="ck-state" className="h-11" value={form.checkr?.work_state || ''} placeholder="—" disabled={!manage} onChange={(v) => setForm({ ...form, checkr: { ...form.checkr!, work_state: v || null } })} options={US_STATES.map((s) => ({ value: s, label: s }))} /></Field>
            <Field label="Work city" htmlFor="ck-city"><Input id="ck-city" className="h-11" value={form.checkr?.work_city || ''} disabled={!manage} onChange={(e) => setForm({ ...form, checkr: { ...form.checkr!, work_city: e.target.value } })} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Webhook URL to add in Checkr (events: report.created, report.completed, invitation.completed): <code className="break-all font-mono">{d.checkr_webhook_url}</code></p>
          <InlineError message={err.vendor} />
          <div className="flex flex-wrap gap-2">
            {saveBtn('vendor', () => void save('vendor', { checkr: form.checkr, vendor_keys: { ...(keys.checkr_api_key ? { checkr_api_key: keys.checkr_api_key } : {}), ...(keys.checkr_webhook_secret ? { checkr_webhook_secret: keys.checkr_webhook_secret } : {}) } }, 'Vendor settings saved'))}
            {manage && form.vendor_keys.checkr_api_key && <TestConnection vendor="checkr" tenantQuery={tenantQuery} />}
            {manage && form.vendor_keys.checkr_api_key && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => void save('vendor', { vendor_keys: { checkr_api_key: null, checkr_webhook_secret: null } }, 'Checkr keys removed')}>Remove keys</Button>}
          </div>
        </Panel>
      </Section>

      {form.idfy && form.authbridge && (
        <IndiaVendorSettings
          idfy={form.idfy}
          authbridge={form.authbridge}
          keys={form.vendor_keys}
          data={d}
          manage={manage}
          busy={busy}
          err={err}
          tenantQuery={tenantQuery}
          onChange={(p) => setForm({ ...form, ...p })}
          save={save}
        />
      )}

      {regionSection('IN')}
      {regionSection('US')}

      <Section title="Timing and retention" description="Applies to new and running background checks.">
        <Panel className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {num('form_deadline_days', 'Days to complete the form', 'After this the check is closed as not completed.')}
            {num('reminder_every_days', 'Remind every (days)', 'While the candidate hasn’t submitted.')}
            {num('max_reminders', 'Maximum reminders', '0 turns reminders off.')}
            {num('adverse_waiting_days', 'Adverse action wait (business days)', 'US: between the pre-adverse and the final notice. At least 5.')}
            {num('retention_days', 'Keep documents for (days)', 'After the check closes; then documents and answers are deleted and only the outcome is kept.')}
          </div>
          <InlineError message={err.general} />
          {saveBtn('general', () => void save('general', { form_deadline_days: form.form_deadline_days, reminder_every_days: form.reminder_every_days, max_reminders: form.max_reminders, adverse_waiting_days: form.adverse_waiting_days, retention_days: form.retention_days }, 'Saved'))}
        </Panel>
      </Section>
    </div>
  )
}

export default function BgvSettingsPage() {
  return (
    <HiringShell title="Background checks" description="Region checklists, consent texts, vendors and retention for background verification." icon={<ShieldCheck />}>
      <Suspense fallback={<LoadingRows rows={4} />}>
        <Inner />
      </Suspense>
    </HiringShell>
  )
}
