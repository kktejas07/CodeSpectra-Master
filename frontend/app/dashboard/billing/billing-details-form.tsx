'use client'

/**
 * Invoice details (name, GSTIN, place of supply). Shared by the checkout page
 * and /dashboard/billing. Validated again on the server (PUT /api/billing/profile).
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { GST_STATES, isValidGstin } from '@/lib/billing/gst'

export interface BillingProfileView {
  name: string
  gstin: string | null
  state_code: string | null
  country: string
  address: string
}

export function BillingDetailsForm({ initial, onSaved }: { initial: BillingProfileView | null; onSaved?: (p: BillingProfileView) => void }) {
  const { t } = useT()
  const apiError = useApiError()
  const [name, setName] = useState(initial?.name ?? '')
  const [gstin, setGstin] = useState(initial?.gstin ?? '')
  const [state, setState] = useState(initial?.state_code ?? '')
  const [country, setCountry] = useState(initial?.country ?? 'IN')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!initial) return
    setName(initial.name ?? '')
    setGstin(initial.gstin ?? '')
    setState(initial.state_code ?? '')
    setCountry(initial.country ?? 'IN')
    setAddress(initial.address ?? '')
  }, [initial])

  const gstinBad = gstin.trim() !== '' && !isValidGstin(gstin)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (gstinBad) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await csrfFetch('/api/billing/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, gstin: gstin.trim() || null, state_code: state || null, country: country || 'IN', address }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('account.billingDetailsSaveFailed')))
      setSaved(true)
      onSaved?.(j.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('account.billingDetailsSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="bd-name">{t('account.billingDetailsName')}</Label>
          <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoComplete="organization" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bd-gstin">{t('account.billingDetailsGstin')}</Label>
          <Input
            id="bd-gstin"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
            aria-invalid={gstinBad}
            aria-describedby="bd-gstin-help"
            className="uppercase tabular-nums"
          />
          <p id="bd-gstin-help" className={gstinBad ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {gstinBad ? t('account.billingDetailsGstinInvalid') : t('account.billingDetailsGstinHelp')}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bd-country">{t('account.billingDetailsCountry')}</Label>
          <select
            id="bd-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="IN">{t('account.billingDetailsIndia')}</option>
            <option value="US">{t('account.billingDetailsUsa')}</option>
            <option value="ZZ">{t('account.billingDetailsOtherCountry')}</option>
          </select>
        </div>
        {country === 'IN' && !gstin ? (
          <div className="space-y-1.5">
            <Label htmlFor="bd-state">{t('account.billingDetailsState')}</Label>
            <select
              id="bd-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('account.billingDetailsChooseState')}</option>
              {Object.entries(GST_STATES).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bd-address">{t('account.billingDetailsAddress')}</Label>
          <Input id="bd-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} autoComplete="street-address" />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-green-700 dark:text-green-400">{t('account.billingDetailsSaved')}</p> : null}
      <Button type="submit" variant="outline" disabled={busy || gstinBad} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t('account.billingDetailsSave')}
      </Button>
    </form>
  )
}
