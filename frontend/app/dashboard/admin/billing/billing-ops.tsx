'use client'

/**
 * Admin → Billing: revenue metrics (MRR / ARR / churn per currency), subscriptions
 * by lifecycle state, organisation licences and billing settings (GST supplier,
 * invoice prefix, autopay, licence price, referral reward).
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, TrendingUp, Users, KeyRound, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, StatCard } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

interface CurrencyMetrics { currency: string; mrr: number; arr: number; activeSubscriptions: number; churnedSubscriptions: number; logoChurnPct: number; revenueChurnPct: number; arpu: number }
interface SubRow { id: string; user: string; plan_id: string; state: string; billing_mode: string; ends_at: string; grace_ends_at: string | null }
interface LicenceRow { id: string; org_name: string; org_id: string; seats: number; seats_used: number; status: string; ends_at: string | null; source: string }
interface Settings {
  supplier: { legal_name: string; gstin: string; state_code: string; address: string; sac_code: string; lut_reference: string }
  invoice_prefix: string
  gst_rate_bps: number
  razorpay_autopay: boolean
  licence_seat_price_minor: { INR: number; USD: number }
  licence_min_seats: number
  referral_reward: { kind: 'free_month' | 'credit'; credit_minor: { INR: number; USD: number }; yearly_cap: number }
}

const STATES = ['trialing', 'active', 'past_due', 'cancelled', 'expired'] as const
const selectCls = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function BillingOps() {
  const { t, td, fmt } = useAdminT()
  const apiError = useApiError()
  const addToast = useToast()
  const [days, setDays] = useState(30)
  const [metrics, setMetrics] = useState<CurrencyMetrics[] | null>(null)
  const [state, setState] = useState<(typeof STATES)[number]>('active')
  const [subs, setSubs] = useState<SubRow[] | null>(null)
  const [licences, setLicences] = useState<LicenceRow[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [states, setStates] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [issue, setIssue] = useState({ org_id: '', seats: 50, currency: 'INR' as 'INR' | 'USD', ends_at: '' })
  const [issuing, setIssuing] = useState(false)

  const money = (minor: number, cur: string) => fmt.number(minor / 100, { style: 'currency', currency: cur })

  useEffect(() => {
    let c = false
    fetch(`/api/admin/billing/metrics?days=${days}`, { credentials: 'include' }).then((r) => r.json()).then((j) => { if (!c) setMetrics(Array.isArray(j.metrics) ? j.metrics : []) }).catch(() => { if (!c) setMetrics([]) })
    return () => { c = true }
  }, [days])

  useEffect(() => {
    let c = false
    setSubs(null)
    fetch(`/api/admin/billing/subscriptions?state=${state}`, { credentials: 'include' }).then((r) => r.json()).then((j) => { if (!c) setSubs(Array.isArray(j.items) ? j.items : []) }).catch(() => { if (!c) setSubs([]) })
    return () => { c = true }
  }, [state])

  const loadLicences = useCallback(() => {
    fetch('/api/admin/billing/licences', { credentials: 'include' }).then((r) => r.json()).then((j) => setLicences(Array.isArray(j.items) ? j.items : [])).catch(() => setLicences([]))
  }, [])

  useEffect(() => {
    loadLicences()
    fetch('/api/admin/billing/settings', { credentials: 'include' }).then((r) => r.json()).then((j) => { if (j.settings) setSettings(j.settings); if (j.states) setStates(j.states) }).catch(() => {})
  }, [loadLicences])

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/billing/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(settings) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('billingOps.saveFailed')))
      setSettings(j.settings)
      addToast({ type: 'success', title: t('billingOps.saved') })
    } catch (e) {
      addToast({ type: 'error', title: t('billingOps.saveFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const issueLicence = async (e: React.FormEvent) => {
    e.preventDefault()
    setIssuing(true)
    try {
      const res = await csrfFetch('/api/admin/billing/licences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...issue, ends_at: issue.ends_at ? new Date(issue.ends_at).toISOString() : '' }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('billingOps.issueFailed')))
      addToast({ type: 'success', title: t('billingOps.issued') })
      loadLicences()
    } catch (err) {
      addToast({ type: 'error', title: t('billingOps.issueFailed'), message: err instanceof Error ? err.message : '' })
    } finally {
      setIssuing(false)
    }
  }

  const sup = (k: keyof Settings['supplier'], v: string) => setSettings((s) => (s ? { ...s, supplier: { ...s.supplier, [k]: v } } : s))

  return (
    <div className="space-y-6">
      <Panel className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">{t('billingOps.revenueTitle')}</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('billingOps.churnWindow')}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
              {[30, 90, 365].map((d) => <option key={d} value={d}>{t('billingOps.days', { count: d })}</option>)}
            </select>
          </label>
        </div>
        {metrics === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
        ) : metrics.length === 0 ? (
          <EmptyState compact title={t('billingOps.noRevenue')} description={t('billingOps.noRevenueBody')} />
        ) : (
          metrics.map((m) => (
            <div key={m.currency} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('billingOps.mrr', { currency: m.currency })} value={money(m.mrr, m.currency)} hint={t('billingOps.arr', { amount: money(m.arr, m.currency) })} />
              <StatCard label={t('billingOps.activeSubs')} value={fmt.number(m.activeSubscriptions)} hint={t('billingOps.arpu', { amount: money(m.arpu, m.currency) })} />
              <StatCard label={t('billingOps.logoChurn')} value={`${m.logoChurnPct}%`} hint={t('billingOps.churned', { count: m.churnedSubscriptions })} />
              <StatCard label={t('billingOps.revenueChurn')} value={`${m.revenueChurnPct}%`} />
            </div>
          ))
        )}
      </Panel>

      <Panel className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">{t('billingOps.subsTitle')}</h2>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('common.filterByStatus')}>
            {STATES.map((s) => (
              <Button key={s} size="sm" variant={state === s ? 'default' : 'outline'} aria-pressed={state === s} onClick={() => setState(s)}>
                {td(`billingOps.state.${s}`, s)}
              </Button>
            ))}
          </div>
        </div>
        {subs === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t('common.loading')} />
        ) : subs.length === 0 ? (
          <EmptyState compact title={t('billingOps.noSubs')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.user')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.plan')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.mode')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.endsAt')}</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2 pr-4 font-mono text-xs">{s.user}</td>
                    <td className="py-2 pr-4">{s.plan_id}</td>
                    <td className="py-2 pr-4">{td(`billingOps.modeName.${s.billing_mode === 'stripe_subscription' || s.billing_mode === 'razorpay_subscription' ? s.billing_mode : 'prepaid'}`, s.billing_mode)}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmt.date(s.grace_ends_at || s.ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">{t('billingOps.licencesTitle')}</h2>
        </div>
        <form onSubmit={issueLicence} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="iss-org">{t('billingOps.orgId')}</Label>
            <Input id="iss-org" value={issue.org_id} onChange={(e) => setIssue({ ...issue, org_id: e.target.value.trim() })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iss-seats">{t('billingOps.seats')}</Label>
            <Input id="iss-seats" type="number" min={1} value={issue.seats} onChange={(e) => setIssue({ ...issue, seats: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iss-end">{t('billingOps.endsAt')}</Label>
            <Input id="iss-end" type="date" value={issue.ends_at} onChange={(e) => setIssue({ ...issue, ends_at: e.target.value })} required />
          </div>
          <Button type="submit" disabled={issuing || !issue.org_id || !issue.ends_at} className="gap-2">
            {issuing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('billingOps.issue')}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{t('billingOps.issueHint')}</p>
        {licences === null ? null : licences.length === 0 ? (
          <EmptyState compact title={t('billingOps.noLicences')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.org')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.seats')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('common.status')}</th>
                  <th className="py-2 pr-4 text-left font-medium">{t('billingOps.endsAt')}</th>
                </tr>
              </thead>
              <tbody>
                {licences.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <a className="text-primary underline-offset-4 hover:underline" href={`/dashboard/admin/licences?org=${encodeURIComponent(l.org_id)}`}>{l.org_name || l.org_id}</a>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{l.seats_used} / {l.seats}</td>
                    <td className="py-2 pr-4">{l.status === 'active' ? t('billingOps.state.active') : t('billingOps.state.expired')}</td>
                    <td className="py-2 pr-4 tabular-nums">{l.ends_at ? fmt.date(l.ends_at) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {settings ? (
        <Panel className="space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">{t('billingOps.settingsTitle')}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="bs-name">{t('billingOps.legalName')}</Label><Input id="bs-name" value={settings.supplier.legal_name} onChange={(e) => sup('legal_name', e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-gstin">{t('billingOps.gstin')}</Label><Input id="bs-gstin" value={settings.supplier.gstin} onChange={(e) => sup('gstin', e.target.value.toUpperCase())} className="uppercase" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="bs-state">{t('billingOps.supplierState')}</Label>
              <select id="bs-state" value={settings.supplier.state_code} onChange={(e) => sup('state_code', e.target.value)} className={selectCls}>
                {Object.entries(states).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="bs-sac">{t('billingOps.sac')}</Label><Input id="bs-sac" value={settings.supplier.sac_code} onChange={(e) => sup('sac_code', e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bs-addr">{t('billingOps.address')}</Label><Input id="bs-addr" value={settings.supplier.address} onChange={(e) => sup('address', e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-lut">{t('billingOps.lut')}</Label><Input id="bs-lut" value={settings.supplier.lut_reference} onChange={(e) => sup('lut_reference', e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-prefix">{t('billingOps.invoicePrefix')}</Label><Input id="bs-prefix" value={settings.invoice_prefix} maxLength={4} onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-seat-inr">{t('billingOps.seatPriceInr')}</Label><Input id="bs-seat-inr" type="number" min={0} value={settings.licence_seat_price_minor.INR / 100} onChange={(e) => setSettings({ ...settings, licence_seat_price_minor: { ...settings.licence_seat_price_minor, INR: Math.round(Number(e.target.value) * 100) || 0 } })} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-seat-usd">{t('billingOps.seatPriceUsd')}</Label><Input id="bs-seat-usd" type="number" min={0} value={settings.licence_seat_price_minor.USD / 100} onChange={(e) => setSettings({ ...settings, licence_seat_price_minor: { ...settings.licence_seat_price_minor, USD: Math.round(Number(e.target.value) * 100) || 0 } })} /></div>
            <div className="space-y-1.5"><Label htmlFor="bs-min">{t('billingOps.minSeats')}</Label><Input id="bs-min" type="number" min={1} value={settings.licence_min_seats} onChange={(e) => setSettings({ ...settings, licence_min_seats: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="bs-reward">{t('billingOps.referralReward')}</Label>
              <select id="bs-reward" value={settings.referral_reward.kind} onChange={(e) => setSettings({ ...settings, referral_reward: { ...settings.referral_reward, kind: e.target.value === 'credit' ? 'credit' : 'free_month' } })} className={selectCls}>
                <option value="free_month">{t('billingOps.rewardMonth')}</option>
                <option value="credit">{t('billingOps.rewardCredit')}</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="bs-cap">{t('billingOps.rewardCap')}</Label><Input id="bs-cap" type="number" min={0} max={100} value={settings.referral_reward.yearly_cap} onChange={(e) => setSettings({ ...settings, referral_reward: { ...settings.referral_reward, yearly_cap: Math.max(0, Number(e.target.value) || 0) } })} /></div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch id="bs-autopay" checked={settings.razorpay_autopay} onCheckedChange={(v) => setSettings({ ...settings, razorpay_autopay: v })} />
              <Label htmlFor="bs-autopay">{t('billingOps.autopay')}</Label>
            </div>
          </div>
          <Button onClick={() => void saveSettings()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('common.save')}
          </Button>
        </Panel>
      ) : null}
    </div>
  )
}
