'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Panel, Section } from '@/components/app/page-kit'
import { useToast } from '@/lib/toast-context'
import { api, Field, NativeSelect, pct, StatusBadge, withAs } from './shared'
import { useT } from '@/lib/i18n/client'

export interface SellerMe {
  id: string; display_name: string; slug: string; bio?: string; logo_url?: string | null; country: string; status: string; is_platform: boolean
  commission_bps: number | null; contact_email?: string; phone?: string | null; whatsapp_opt_in?: boolean
  kyc: { status: string; pan_last4?: string; gstin?: string; tax_id_last4?: string }
  payout: { method: string | null; account_ref?: string | null; verified: boolean }
  stripe_connected?: boolean; review_note?: string | null
}

export function SellerSettings({ seller, asPlatform, effectiveBps, stripeConfigured, onSaved }: { seller: SellerMe; asPlatform: boolean; effectiveBps: number; stripeConfigured: boolean; onSaved: () => void }) {
  const { t } = useT()
  const addToast = useToast()
  const sp = useSearchParams()
  const [p, setP] = useState({ display_name: seller.display_name, bio: seller.bio ?? '', logo_url: seller.logo_url ?? '', contact_email: seller.contact_email ?? '', phone: seller.phone ?? '', whatsapp_opt_in: !!seller.whatsapp_opt_in })
  const [pay, setPay] = useState({ method: seller.payout.method ?? 'bank', account_name: '', account_no: '', ifsc: '', routing_no: '', upi: '' })
  const [changingPayout, setChangingPayout] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stripeBusy, setStripeBusy] = useState(false)

  useEffect(() => {
    if (sp.get('stripe') !== 'return') return
    api<{ ready: boolean }>(withAs('/api/marketplace/seller/stripe', asPlatform)).then((r) => {
      addToast({ type: r.ready ? 'success' : 'info', title: r.ready ? t('market.stripeConnected') : t('market.stripeSetupNotFinished'), message: r.ready ? t('market.youCanNowReceivePayouts') : t('market.finishTheStripeStepsToReceive750') })
      onSaved()
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(withPayout: boolean) {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { ...p, logo_url: p.logo_url || null, phone: p.phone || null }
      if (withPayout) body.payout = pay
      await api(withAs('/api/marketplace/seller/profile', asPlatform), { method: 'PATCH', body })
      addToast({ type: 'success', title: t('market.settingsSaved'), message: withPayout ? t('market.newPayoutDetailsWillBeVerifiedcec') : undefined })
      setChangingPayout(false)
      onSaved()
    } catch (e) {
      addToast({ type: 'error', title: t('market.notSaved'), message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function connectStripe() {
    setStripeBusy(true)
    try {
      const r = await api<{ url: string }>(withAs('/api/marketplace/seller/stripe', asPlatform), { body: {} })
      window.location.href = r.url
    } catch (e) {
      addToast({ type: 'error', title: t('market.stripeUnavailable'), message: (e as Error).message })
      setStripeBusy(false)
    }
  }

  const methods = seller.country === 'IN' ? ['bank', 'upi'] : stripeConfigured ? ['stripe_connect', 'bank'] : ['bank']

  return (
    <div className="space-y-6">
      <Panel>
        <Section title={t('market.storeProfile')}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
            <Field label={t('market.storeName')} htmlFor="s-n"><Input id="s-n" value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></Field>
            <Field label={t('market.logoLink')} htmlFor="s-l"><Input id="s-l" type="url" value={p.logo_url} onChange={(e) => setP({ ...p, logo_url: e.target.value })} /></Field>
            <Field label={t('market.about')} htmlFor="s-b" className="sm:col-span-2"><Textarea id="s-b" rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
            {!asPlatform && <>
              <Field label={t('market.contactEmail')} htmlFor="s-e"><Input id="s-e" type="email" value={p.contact_email} onChange={(e) => setP({ ...p, contact_email: e.target.value })} /></Field>
              <Field label={t('market.phoneWithCountryCode')} htmlFor="s-p"><Input id="s-p" inputMode="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <Checkbox checked={p.whatsapp_opt_in} disabled={!p.phone} onCheckedChange={(v) => setP({ ...p, whatsapp_opt_in: v === true })} aria-label={t('market.whatsappUpdates')} />
                <span>{t('market.sendMeNewOrderLowStock9e8')}</span>
              </label>
            </>}
            <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving && !changingPayout && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t('market.saveProfile')}</Button></div>
          </form>
        </Section>
      </Panel>

      {!asPlatform && (
        <Panel>
          <Section title={t('market.verificationAndPayouts')} description={t('market.commissionOnYourSalesPercent', { percent: pct(effectiveBps) })}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">{t('market.account')}</dt><dd><StatusBadge status={seller.status} /></dd></div>
              <div><dt className="text-muted-foreground">{t('market.taxDetails')}</dt><dd className="flex items-center gap-2"><StatusBadge status={seller.kyc.status} /> <span className="font-mono text-xs">{seller.kyc.pan_last4 ? `PAN ••••${seller.kyc.pan_last4}` : seller.kyc.tax_id_last4 ? t('market.tinTaxIdLast4', { tax_id_last4: seller.kyc.tax_id_last4 }) : ''}</span>{seller.kyc.gstin && <span className="font-mono text-xs">{t('market.gstinGstin', { gstin: seller.kyc.gstin })}</span>}</dd></div>
              <div><dt className="text-muted-foreground">{t('market.payoutTo')}</dt><dd>{seller.payout.account_ref || t('market.notSet')} {seller.payout.method && <StatusBadge status={seller.payout.verified ? 'verified' : 'pending'} className="ml-1" />}</dd></div>
            </dl>
            {seller.payout.method === 'stripe_connect' && (
              <Button variant="outline" onClick={connectStripe} disabled={stripeBusy}>{stripeBusy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <ExternalLink />}{seller.stripe_connected ? t('market.updateStripeAccount') : t('market.connectStripe')}</Button>
            )}
            {!changingPayout ? (
              <Button variant="ghost" onClick={() => setChangingPayout(true)}>{t('market.changePayoutMethod')}</Button>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(true) }}>
                <Field label={t('market.method')} htmlFor="pm2"><NativeSelect id="pm2" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{methods.map((m) => <option key={m} value={m}>{m === 'stripe_connect' ? 'Stripe' : m === 'upi' ? 'UPI' : t('market.bankAccount')}</option>)}</NativeSelect></Field>
                {pay.method === 'upi' && <Field label="UPI ID" htmlFor="u2"><Input id="u2" autoComplete="off" value={pay.upi} onChange={(e) => setPay({ ...pay, upi: e.target.value })} /></Field>}
                {pay.method === 'bank' && <>
                  <Field label={t('market.accountHolder')} htmlFor="an2"><Input id="an2" value={pay.account_name} onChange={(e) => setPay({ ...pay, account_name: e.target.value })} /></Field>
                  <Field label={t('market.accountNumber')} htmlFor="ac2"><Input id="ac2" autoComplete="off" inputMode="numeric" value={pay.account_no} onChange={(e) => setPay({ ...pay, account_no: e.target.value })} /></Field>
                  {seller.country === 'IN'
                    ? <Field label={t('market.ifsc')} htmlFor="if2"><Input id="if2" autoComplete="off" value={pay.ifsc} onChange={(e) => setPay({ ...pay, ifsc: e.target.value.toUpperCase() })} /></Field>
                    : <Field label={t('market.routingNumber')} htmlFor="rt2"><Input id="rt2" autoComplete="off" inputMode="numeric" value={pay.routing_no} onChange={(e) => setPay({ ...pay, routing_no: e.target.value })} /></Field>}
                </>}
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t('market.savePayoutMethod')}</Button><Button type="button" variant="outline" onClick={() => setChangingPayout(false)}>{t('common.cancel')}</Button></div>
              </form>
            )}
          </Section>
        </Panel>
      )}
    </div>
  )
}
