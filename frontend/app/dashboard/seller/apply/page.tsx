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

interface Me {
  seller: { status: string; display_name: string; review_note?: string | null; country: string } | null
  default_commission_bps: number
  effective_commission_bps: number
  stripe_configured: boolean
  hold_days: { digital: number; physical: number; service: number }
}

export default function SellerApplyPage() {
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
        <PageHeader title="Seller account" icon={<Store />} description="You already have a seller account." actions={<Button asChild><Link href="/dashboard/seller">Open seller dashboard</Link></Button>} />
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
      addToast({ type: 'success', title: 'Application sent', message: "We'll review it and email you." })
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
        title="Sell on CodeSpectra"
        icon={<Store />}
        description="List e-books, courses, merch or mentoring sessions. We review every new seller before your store goes live."
        illustration="launch"
      />
      {st === 'pending' && (
        <Panel className="mb-6 flex flex-wrap items-center gap-3 p-5">
          <StatusBadge status="pending" />
          <p className="text-sm text-muted-foreground">Your application is under review. You can update it below — sending it again replaces the earlier one.</p>
        </Panel>
      )}
      {st === 'rejected' && (
        <Panel className="mb-6 space-y-1 p-5">
          <div className="flex items-center gap-2"><StatusBadge status="rejected" /><span className="text-sm font-medium">Your last application wasn&apos;t approved.</span></div>
          {me?.seller?.review_note && <p className="text-sm text-muted-foreground">Reason: {me.seller.review_note}</p>}
          <p className="text-sm text-muted-foreground">Fix the details below and apply again.</p>
        </Panel>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Panel className="space-y-5">
          <Section title="Your store" description="Shown to buyers on your products and store page.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store name" htmlFor="sn"><Input id="sn" required minLength={2} maxLength={80} value={f.display_name} onChange={(e) => set('display_name', e.target.value)} /></Field>
              <Field label="Country" htmlFor="cty" hint="Where you're registered for tax.">
                <NativeSelect id="cty" value={f.country} onChange={(e) => set('country', e.target.value)}>
                  <option value="IN">India</option>
                  <option value="US">United States</option>
                </NativeSelect>
              </Field>
              <Field label="About your store" htmlFor="bio" className="sm:col-span-2"><Textarea id="bio" rows={3} maxLength={2000} value={f.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
              <Field label="Logo link (optional)" htmlFor="logo" hint="An https:// image link."><Input id="logo" type="url" value={f.logo_url} onChange={(e) => set('logo_url', e.target.value)} /></Field>
              <Field label="Contact email" htmlFor="ce" hint="Defaults to your account email."><Input id="ce" type="email" value={f.contact_email} onChange={(e) => set('contact_email', e.target.value)} /></Field>
              <Field label="Phone with country code (optional)" htmlFor="ph"><Input id="ph" inputMode="tel" placeholder="+91…" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <label className="flex items-start gap-3 self-end text-sm">
                <Checkbox checked={f.whatsapp_opt_in} onCheckedChange={(v) => set('whatsapp_opt_in', v === true)} disabled={!f.phone} aria-label="WhatsApp updates" />
                <span>Send me order and payout updates on WhatsApp</span>
              </label>
            </div>
          </Section>
        </Panel>

        <Panel className="space-y-5">
          <Section title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Tax details</span>} description="Encrypted and visible only to the marketplace team for verification. We show you just the last four characters.">
            {f.country === 'IN' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="PAN" htmlFor="pan"><Input id="pan" required autoComplete="off" placeholder="ABCDE1234F" value={f.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
                <Field label="GSTIN (optional)" htmlFor="gst" hint="Needed if you're GST registered."><Input id="gst" autoComplete="off" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="SSN or EIN" htmlFor="tin"><Input id="tin" required autoComplete="off" inputMode="numeric" placeholder="9 digits" value={f.tax_id} onChange={(e) => set('tax_id', e.target.value)} /></Field>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={f.w9} onCheckedChange={(v) => set('w9', v === true)} aria-label="W-9 certification" />
                  <span>Under penalties of perjury, I certify that the taxpayer number above is correct and that I am a U.S. person (Form W-9 certification). A signed W-9 may be requested before your first payout.</span>
                </label>
              </div>
            )}
          </Section>
        </Panel>

        <Panel className="space-y-5">
          <Section title={<span className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /> Payouts</span>} description="Where we send your earnings. Details are encrypted at rest.">
            <Field label="Payout method" htmlFor="pm">
              <NativeSelect id="pm" value={method} onChange={(e) => set('method', e.target.value)}>
                {methods.includes('stripe_connect') && <option value="stripe_connect">Stripe (connect after approval)</option>}
                <option value="bank">Bank account</option>
                {methods.includes('upi') && <option value="upi">UPI</option>}
              </NativeSelect>
            </Field>
            {method === 'upi' && <Field label="UPI ID" htmlFor="upi"><Input id="upi" required autoComplete="off" placeholder="name@bank" value={f.upi} onChange={(e) => set('upi', e.target.value)} /></Field>}
            {method === 'bank' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account holder name" htmlFor="an"><Input id="an" required value={f.account_name} onChange={(e) => set('account_name', e.target.value)} /></Field>
                <Field label="Account number" htmlFor="ano"><Input id="ano" required autoComplete="off" inputMode="numeric" value={f.account_no} onChange={(e) => set('account_no', e.target.value)} /></Field>
                {f.country === 'IN'
                  ? <Field label="IFSC" htmlFor="ifsc"><Input id="ifsc" required autoComplete="off" value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></Field>
                  : <Field label="Routing number" htmlFor="rt"><Input id="rt" required autoComplete="off" inputMode="numeric" value={f.routing_no} onChange={(e) => set('routing_no', e.target.value)} /></Field>}
              </div>
            )}
            {method === 'stripe_connect' && <p className="text-sm text-muted-foreground">Once you&apos;re approved, connect a Stripe account from Seller settings to receive payouts.</p>}
          </Section>
        </Panel>

        <Panel className="space-y-4">
          <Section title={<span className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /> Terms</span>}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>CodeSpectra keeps a commission of <strong className="text-foreground">{me ? pct(me.effective_commission_bps) : '…'}</strong> on each sale (some categories may differ; the rate is shown before you list).</li>
              <li>Earnings become available after the refund window: {me ? `${me.hold_days.digital} days for digital items, ${me.hold_days.service} days after a session, ${me.hold_days.physical} days after delivery` : '…'}.</li>
              <li>You ship physical items within your stated dispatch time, honour bookings, and only sell content you own the rights to.</li>
              <li>Products may need approval before they appear in the store.</li>
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={f.terms} onCheckedChange={(v) => set('terms', v === true)} aria-label="Accept seller terms" />
              <span>I accept the seller terms and the commission above.</span>
            </label>
          </Section>
        </Panel>

        {errors && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving || !f.terms} className="min-h-11">
            {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {st === 'pending' ? 'Update application' : 'Send application'}
          </Button>
        </div>
      </form>
    </div>
  )
}
