'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Store, ShieldCheck, Landmark, FileSignature, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { api, Field, NativeSelect, pct, StatusBadge } from '@/components/marketplace/seller/shared'
import { useT } from '@/lib/i18n/client'

interface Me {
  seller: { status: string; display_name: string; review_note?: string | null; country: string } | null
  default_commission_bps: number
  effective_commission_bps: number
  stripe_configured: boolean
  hold_days: { digital: number; physical: number; service: number }
}

export default function SellerApplyPage() {
  const { t } = useT()
  const gate = usePageGuard('/dashboard/seller/apply')
  const addToast = useToast()
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string | null>(null)
  const [f, setF] = useState({
    display_name: '', bio: '', logo_url: '', country: 'IN', contact_email: '', phone: '', whatsapp_opt_in: false,
    pan: '', gstin: '', tax_id: '', w9: false,
    method: 'bank', account_name: '', account_no: '', ifsc: '', routing_no: '', upi: '',
    terms: false,
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    if (!gate.ready) return
    api<Me>('/api/marketplace/seller/me').then((m) => {
      setMe(m)
      if (m.seller) setF((s) => ({ ...s, display_name: m.seller!.display_name, country: m.seller!.country }))
    }).catch(() => setMe(null))
  }, [gate.ready])

  if (!gate.ready) return null
  const st = me?.seller?.status
  if (st === 'approved' || st === 'suspended') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('market.sellerAccount')} icon={<Store />} description={t('market.youAlreadyHaveASellerAccount')} actions={<Button asChild><Link href="/dashboard/seller">{t('market.openSellerDashboard')}</Link></Button>} />
      </div>
    )
  }

  const usMethods = me?.stripe_configured ? ['stripe_connect', 'bank'] : ['bank']
  const methods = f.country === 'IN' ? ['bank', 'upi'] : usMethods
  const method = methods.includes(f.method) ? f.method : methods[0]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErrors(null)
    try {
      await api('/api/marketplace/seller/apply', {
        body: {
          display_name: f.display_name, bio: f.bio, logo_url: f.logo_url || null, country: f.country,
          contact_email: f.contact_email || undefined, phone: f.phone || null, whatsapp_opt_in: f.whatsapp_opt_in,
          kyc: f.country === 'IN' ? { pan: f.pan, gstin: f.gstin } : { tax_id: f.tax_id, w9_acknowledged: f.w9 },
          payout: { method, account_name: f.account_name, account_no: f.account_no, ifsc: f.ifsc, routing_no: f.routing_no, upi: f.upi },
          accept_terms: f.terms,
        },
      })
      addToast({ type: 'success', title: t('market.applicationSent'), message: t('market.wellReviewItAndEmailYou') })
      router.push('/dashboard/seller')
    } catch (err) {
      setErrors((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('market.sellOnCodespectra')}
        icon={<Store />}
        description={t('market.listEBooksCoursesMerchOrf57')}
        illustration="launch"
      />
      {st === 'pending' && (
        <Panel className="mb-6 flex flex-wrap items-center gap-3 p-5">
          <StatusBadge status="pending" />
          <p className="text-sm text-muted-foreground">{t('market.yourApplicationIsUnderReviewYoucf1')}</p>
        </Panel>
      )}
      {st === 'rejected' && (
        <Panel className="mb-6 space-y-1 p-5">
          <div className="flex items-center gap-2"><StatusBadge status="rejected" /><span className="text-sm font-medium">{t('market.yourLastApplicationWasntApproved')}</span></div>
          {me?.seller?.review_note && <p className="text-sm text-muted-foreground">{t('market.reasonReviewNote', { review_note: me.seller.review_note })}</p>}
          <p className="text-sm text-muted-foreground">{t('market.fixTheDetailsBelowAndApply326')}</p>
        </Panel>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Panel className="space-y-5">
          <Section title={t('market.yourStore')} description={t('market.shownToBuyersOnYourProductsbe3')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('market.storeName')} htmlFor="sn"><Input id="sn" required minLength={2} maxLength={80} value={f.display_name} onChange={(e) => set('display_name', e.target.value)} /></Field>
              <Field label={t('market.country')} htmlFor="cty" hint={t('market.whereYoureRegisteredForTax')}>
                <NativeSelect id="cty" value={f.country} onChange={(e) => set('country', e.target.value)}>
                  <option value="IN">{t('market.india')}</option>
                  <option value="US">{t('market.unitedStates')}</option>
                </NativeSelect>
              </Field>
              <Field label={t('market.aboutYourStore')} htmlFor="bio" className="sm:col-span-2"><Textarea id="bio" rows={3} maxLength={2000} value={f.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
              <Field label={t('market.logoLinkOptional')} htmlFor="logo" hint={t('market.anHttpsImageLink')}><Input id="logo" type="url" value={f.logo_url} onChange={(e) => set('logo_url', e.target.value)} /></Field>
              <Field label={t('market.contactEmail')} htmlFor="ce" hint={t('market.defaultsToYourAccountEmail')}><Input id="ce" type="email" value={f.contact_email} onChange={(e) => set('contact_email', e.target.value)} /></Field>
              <Field label={t('market.phoneWithCountryCodeOptional')} htmlFor="ph"><Input id="ph" inputMode="tel" placeholder="+91…" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <label className="flex items-start gap-3 self-end text-sm">
                <Checkbox checked={f.whatsapp_opt_in} onCheckedChange={(v) => set('whatsapp_opt_in', v === true)} disabled={!f.phone} aria-label={t('market.whatsappUpdates')} />
                <span>{t('market.sendMeOrderAndPayoutUpdatesfb0')}</span>
              </label>
            </div>
          </Section>
        </Panel>

        <Panel className="space-y-5">
          <Section title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />{' '}{t('market.taxDetails')}</span>} description={t('market.encryptedAndVisibleOnlyToThe67f')}>
            {f.country === 'IN' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="PAN" htmlFor="pan"><Input id="pan" required autoComplete="off" placeholder={t('market.abcde1234f')} value={f.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
                <Field label={t('market.gstinOptional')} htmlFor="gst" hint={t('market.neededIfYoureGstRegistered')}><Input id="gst" autoComplete="off" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label={t('market.ssnOrEin')} htmlFor="tin"><Input id="tin" required autoComplete="off" inputMode="numeric" placeholder={t('market.n9Digits')} value={f.tax_id} onChange={(e) => set('tax_id', e.target.value)} /></Field>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={f.w9} onCheckedChange={(v) => set('w9', v === true)} aria-label={t('market.w9Certification')} />
                  <span>{t('market.underPenaltiesOfPerjuryICertifyefe')}</span>
                </label>
              </div>
            )}
          </Section>
        </Panel>

        <Panel className="space-y-5">
          <Section title={<span className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />{' '}{t('market.payouts')}</span>} description={t('market.whereWeSendYourEarningsDetails563')}>
            <Field label={t('market.payoutMethod')} htmlFor="pm">
              <NativeSelect id="pm" value={method} onChange={(e) => set('method', e.target.value)}>
                {methods.includes('stripe_connect') && <option value="stripe_connect">{t('market.stripeConnectAfterApproval')}</option>}
                <option value="bank">{t('market.bankAccount')}</option>
                {methods.includes('upi') && <option value="upi">UPI</option>}
              </NativeSelect>
            </Field>
            {method === 'upi' && <Field label="UPI ID" htmlFor="upi"><Input id="upi" required autoComplete="off" placeholder="name@bank" value={f.upi} onChange={(e) => set('upi', e.target.value)} /></Field>}
            {method === 'bank' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('market.accountHolderName')} htmlFor="an"><Input id="an" required value={f.account_name} onChange={(e) => set('account_name', e.target.value)} /></Field>
                <Field label={t('market.accountNumber')} htmlFor="ano"><Input id="ano" required autoComplete="off" inputMode="numeric" value={f.account_no} onChange={(e) => set('account_no', e.target.value)} /></Field>
                {f.country === 'IN'
                  ? <Field label={t('market.ifsc')} htmlFor="ifsc"><Input id="ifsc" required autoComplete="off" value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></Field>
                  : <Field label={t('market.routingNumber')} htmlFor="rt"><Input id="rt" required autoComplete="off" inputMode="numeric" value={f.routing_no} onChange={(e) => set('routing_no', e.target.value)} /></Field>}
              </div>
            )}
            {method === 'stripe_connect' && <p className="text-sm text-muted-foreground">{t('market.onceYoureApprovedConnectAStripeaa6')}</p>}
          </Section>
        </Panel>

        <Panel className="space-y-4">
          <Section title={<span className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" />{' '}{t('common.terms')}</span>}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>{t('market.codespectraKeepsACommissionOf')}{' '}<strong className="text-foreground">{me ? pct(me.effective_commission_bps) : '…'}</strong>{' '}{t('market.onEachSaleSomeCategoriesMayabd')}</li>
              <li>{t('market.earningsBecomeAvailableAfterTheRefundef3')}{' '}{me ? t('market.digitalDaysForDigitalItemsService6f9', { digital: me.hold_days.digital, service: me.hold_days.service, physical: me.hold_days.physical }) : '…'}.</li>
              <li>{t('market.youShipPhysicalItemsWithinYour9df')}</li>
              <li>{t('market.productsMayNeedApprovalBeforeThey026')}</li>
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={f.terms} onCheckedChange={(v) => set('terms', v === true)} aria-label={t('market.acceptSellerTerms')} />
              <span>{t('market.iAcceptTheSellerTermsAnd0e3')}</span>
            </label>
          </Section>
        </Panel>

        {errors && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving || !f.terms} className="min-h-11">
            {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {st === 'pending' ? t('market.updateApplication') : t('market.sendApplication')}
          </Button>
        </div>
      </form>
    </div>
  )
}
