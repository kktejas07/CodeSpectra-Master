'use client'

/**
 * Organisation licences (college / company): buy or renew Pro seats, assign
 * them by CSV / email list or by email domain, and see seat usage.
 * APIs: /api/licences* (organisation admin of the caller's org; superadmin with ?org=).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BadgeCheck, KeyRound, Loader2, RefreshCw, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { completeCheckout } from '@/lib/razorpay-checkout'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'
import { NativePurchaseGate } from '@/components/native/native-purchase-gate'

interface Licence {
  id: string
  org_name: string
  seats: number
  seats_used: number
  currency: 'INR' | 'USD'
  status: string
  starts_at: string | null
  ends_at: string | null
  email_domains: string[]
  auto_assign: boolean
  usage?: { assigned: number; joined: number; byDomain: number }
}
interface Seat { id: string; email: string; user_id: string | null; via: string; assigned_at: string }
interface ListResponse {
  org: { name: string; kind: string } | null
  licences: Licence[]
  pricing: { seat_price_minor: { INR: number; USD: number }; min_seats: number }
}

export default function LicencesPage() {
  const gate = usePageGuard('tenant_admin')
  const { t, fmt } = useAdminT()
  const addToast = useToast()
  const sp = useSearchParams()
  const org = sp.get('org')
  const q = org ? `?org=${encodeURIComponent(org)}` : ''
  const err = useApiError()

  const [data, setData] = useState<ListResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [seatText, setSeatText] = useState('')
  const [domains, setDomains] = useState('')
  const [buySeats, setBuySeats] = useState(50)
  const [buyCurrency, setBuyCurrency] = useState<'INR' | 'USD'>('INR')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/licences${q}`, { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(err(j, t('licences.loadFailed')))
      setData(j)
      if (j.pricing?.min_seats) setBuySeats((s) => Math.max(s, j.pricing.min_seats))
      setSelected((cur) => cur ?? j.licences?.[0]?.id ?? null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('licences.loadFailed'))
    }
  }, [q, err, t])

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready, load])

  const current = useMemo(() => data?.licences.find((l) => l.id === selected) ?? null, [data, selected])

  useEffect(() => {
    if (!current) return
    setDomains(current.email_domains.join(', '))
    let cancelled = false
    fetch(`/api/licences/${current.id}${q}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.seats) setSeats(j.seats)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [current, q])

  const money = (minor: number, cur: string) => fmt.number(minor / 100, { style: 'currency', currency: cur })

  const buy = async (licenceId?: string) => {
    setBusy(licenceId ? `renew:${licenceId}` : 'buy')
    try {
      const res = await csrfFetch(`/api/licences${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ seats: licenceId ? Math.max(current?.seats ?? buySeats, current?.seats_used ?? 0) : buySeats, currency: licenceId ? current?.currency ?? buyCurrency : buyCurrency, ...(licenceId ? { licence_id: licenceId } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(err(j, t('licences.checkoutFailed')))
      const outcome = await completeCheckout(j, { description: t('licences.title') })
      if (outcome.status === 'paid') {
        addToast({ type: 'success', title: t('licences.paid'), message: t('licences.paidBody') })
        await load()
      }
    } catch (e) {
      addToast({ type: 'error', title: t('licences.checkoutFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  const assign = async () => {
    if (!current || !seatText.trim()) return
    setBusy('assign')
    try {
      const res = await csrfFetch(`/api/licences/${current.id}/seats${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: seatText }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(err(j, t('licences.assignFailed')))
      addToast({
        type: j.over_limit > 0 ? 'info' : 'success',
        title: t('licences.assigned', { count: j.assigned }),
        message: [j.skipped ? t('licences.skipped', { count: j.skipped }) : '', j.over_limit ? t('licences.overLimit', { count: j.over_limit }) : '', j.invalid_rows?.length ? t('licences.invalidRows', { count: j.invalid_rows.length }) : ''].filter(Boolean).join(' '),
      })
      setSeatText('')
      await load()
    } catch (e) {
      addToast({ type: 'error', title: t('licences.assignFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (email: string) => {
    if (!current) return
    setBusy(`revoke:${email}`)
    try {
      const res = await csrfFetch(`/api/licences/${current.id}/seats${q}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error(err(await res.json().catch(() => ({})), t('licences.revokeFailed')))
      setSeats((s) => s.filter((x) => x.email !== email))
      await load()
    } catch (e) {
      addToast({ type: 'error', title: t('licences.revokeFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  const saveDomains = async (autoAssign: boolean) => {
    if (!current) return
    setBusy('domains')
    try {
      const res = await csrfFetch(`/api/licences/${current.id}${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email_domains: domains.split(/[\s,;]+/).filter(Boolean), auto_assign: autoAssign }),
      })
      if (!res.ok) throw new Error(err(await res.json().catch(() => ({})), t('licences.saveFailed')))
      addToast({ type: 'success', title: t('licences.saved') })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: t('licences.saveFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(null)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={t('licences.title')}
        description={data?.org ? t('licences.descriptionOrg', { org: data.org.name }) : t('licences.description')}
        icon={<KeyRound aria-hidden />}
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t('common.refresh')}
          </Button>
        }
      />

      {loadError && !data ? (
        <EmptyState illustration="error" title={t('licences.loadFailed')} description={loadError} actionLabel={t('common.tryAgain')} onAction={() => void load()} />
      ) : !data ? (
        <SkeletonCard />
      ) : (
        <>
          {/* CORE-038: no licence purchase inside the phone apps (store rules). */}
          <NativePurchaseGate>
          <Panel className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-foreground">{t('licences.buyTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('licences.buyBody', { price: money(data.pricing.seat_price_minor[buyCurrency], buyCurrency), min: data.pricing.min_seats })}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lic-seats">{t('licences.seats')}</Label>
                <Input id="lic-seats" type="number" min={data.pricing.min_seats} max={50000} value={buySeats} onChange={(e) => setBuySeats(Math.max(1, Math.floor(Number(e.target.value) || 0)))} className="w-32 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lic-cur">{t('licences.currency')}</Label>
                <select id="lic-cur" value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value === 'USD' ? 'USD' : 'INR')} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="INR">{t('licences.inr')}</option>
                  <option value="USD">{t('licences.usd')}</option>
                </select>
              </div>
              <p className="pb-2 text-sm font-medium tabular-nums text-foreground">{t('licences.total', { amount: money(buySeats * data.pricing.seat_price_minor[buyCurrency], buyCurrency) })}</p>
              <Button onClick={() => void buy()} disabled={busy === 'buy' || buySeats < data.pricing.min_seats} className="gap-2">
                {busy === 'buy' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('licences.buy')}
              </Button>
            </div>
          </Panel>
          </NativePurchaseGate>

          {data.licences.length === 0 ? (
            <EmptyState title={t('licences.emptyTitle')} description={t('licences.emptyBody')} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('licences.title')}>
                {data.licences.map((l) => (
                  <Button key={l.id} role="tab" aria-selected={l.id === selected} variant={l.id === selected ? 'default' : 'outline'} size="sm" onClick={() => setSelected(l.id)}>
                    {t('licences.tab', { seats: l.seats, until: l.ends_at ? fmt.date(l.ends_at) : '—' })}
                  </Button>
                ))}
              </div>

              {current ? (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard label={t('licences.seatsUsed')} value={`${current.seats_used} / ${current.seats}`} icon={<Users aria-hidden />} />
                    <StatCard label={t('licences.joined')} value={current.usage?.joined ?? 0} hint={t('licences.joinedHint')} icon={<BadgeCheck aria-hidden />} />
                    <StatCard label={t('licences.status')} value={current.status === 'active' ? t('licences.active') : t('licences.ended')} hint={current.ends_at ? t('licences.until', { date: fmt.date(current.ends_at) }) : undefined} icon={<KeyRound aria-hidden />} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void buy(current.id)} disabled={!!busy} className="gap-2">
                      {busy === `renew:${current.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      {t('licences.renew')}
                    </Button>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <Panel className="space-y-3 p-6">
                      <h3 className="text-base font-semibold text-foreground">{t('licences.assignTitle')}</h3>
                      <p className="text-sm text-muted-foreground">{t('licences.assignBody')}</p>
                      <Label htmlFor="lic-emails" className="sr-only">{t('licences.assignTitle')}</Label>
                      <Textarea id="lic-emails" rows={6} value={seatText} onChange={(e) => setSeatText(e.target.value)} placeholder={t('licences.assignPlaceholder')} />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
                          <Upload className="h-4 w-4" aria-hidden />
                          {t('licences.uploadCsv')}
                          <input
                            type="file"
                            accept=".csv,text/csv,text/plain"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0]
                              if (f && f.size < 600_000) setSeatText(await f.text())
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <Button onClick={() => void assign()} disabled={busy === 'assign' || !seatText.trim() || current.status !== 'active'} className="ml-auto gap-2">
                          {busy === 'assign' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                          {t('licences.assign')}
                        </Button>
                      </div>
                    </Panel>

                    <Panel className="space-y-3 p-6">
                      <h3 className="text-base font-semibold text-foreground">{t('licences.domainTitle')}</h3>
                      <p className="text-sm text-muted-foreground">{t('licences.domainBody')}</p>
                      <Label htmlFor="lic-domains">{t('licences.domains')}</Label>
                      <Input id="lic-domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder={t('licences.domainsPlaceholder')} />
                      <div className="flex items-center gap-3">
                        <Switch id="lic-auto" checked={current.auto_assign} onCheckedChange={(v) => void saveDomains(v)} disabled={busy === 'domains'} />
                        <Label htmlFor="lic-auto">{t('licences.autoAssign')}</Label>
                        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void saveDomains(current.auto_assign)} disabled={busy === 'domains'}>
                          {t('common.save')}
                        </Button>
                      </div>
                    </Panel>
                  </div>

                  <Panel className="overflow-hidden p-0">
                    <div className="px-6 pt-6">
                      <h3 className="text-base font-semibold text-foreground">{t('licences.seatList')}</h3>
                    </div>
                    {seats.length === 0 ? (
                      <EmptyState compact title={t('licences.noSeats')} description={t('licences.noSeatsBody')} />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="mt-4 w-full text-sm">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="px-6 py-2 text-left font-medium">{t('common.email')}</th>
                              <th className="px-6 py-2 text-left font-medium">{t('licences.seatStatus')}</th>
                              <th className="px-6 py-2 text-left font-medium">{t('licences.assignedOn')}</th>
                              <th className="px-6 py-2 text-right font-medium">{t('common.actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {seats.map((s) => (
                              <tr key={s.id} className="border-t border-border">
                                <td className="px-6 py-2 break-all">{s.email}</td>
                                <td className="px-6 py-2">{s.user_id ? t('licences.seatJoined') : t('licences.seatInvited')}</td>
                                <td className="px-6 py-2 tabular-nums">{fmt.date(s.assigned_at)}</td>
                                <td className="px-6 py-2 text-right">
                                  <Button variant="ghost" size="sm" onClick={() => void revoke(s.email)} disabled={busy === `revoke:${s.email}`}>
                                    {t('licences.revoke')}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
