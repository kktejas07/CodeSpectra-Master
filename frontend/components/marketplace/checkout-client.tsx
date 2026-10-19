'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Lock } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { formatMinor } from '@/lib/marketplace/pricing'
import type { CartView } from '@/lib/marketplace/cart'
import type { Quote } from '@/lib/marketplace/pricing'
import { Totals, formatSlot } from './cart-lines'

const field = 'h-11 w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink outline-none placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30'

const COUNTRIES: [string, string][] = [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['SG', 'Singapore'], ['AE', 'United Arab Emirates'], ['DE', 'Germany']]

export function CheckoutClient({ email }: { email: string }) {
  const addToast = useToast()
  const [cart, setCart] = useState<CartView | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState<string | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [addr, setAddr] = useState({ name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'IN', phone: '' })

  const load = useCallback(async (code: string | null) => {
    setLoading(true)
    try {
      const res = await csrfFetch('/api/marketplace/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coupon: code }) })
      const j = await res.json().catch(() => ({}))
      setCart(j.cart ?? null)
      setQuote(j.quote ?? null)
      setError(res.ok ? null : j.error || 'Could not load your cart.')
      setApplied(j.coupon ?? null)
      setCouponError(j.coupon_error ?? null)
      if (j.cart?.currency === 'USD') setAddr((a) => (a.country === 'IN' ? { ...a, country: 'US' } : a))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(null) }, [load])

  const pay = async (e: React.FormEvent) => {
    e.preventDefault()
    setPaying(true)
    try {
      const res = await csrfFetch('/api/marketplace/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_phone: phone,
          coupon: applied,
          address: cart?.needs_shipping ? { ...addr, phone: addr.phone || phone } : null,
          buyer_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast({ type: 'error', title: j.error || 'Could not start the payment.' })
        if (j.code === 'cart_changed' || j.code === 'out_of_stock' || j.code === 'slot_unavailable') void load(applied)
        return
      }
      window.location.assign(j.redirect_url)
    } catch {
      addToast({ type: 'error', title: 'Network error — nothing was charged. Please try again.' })
    } finally {
      setPaying(false)
    }
  }

  const empty = !loading && (!cart || !cart.lines.length)
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="cs-heading mb-6 text-3xl text-cs-ink sm:text-4xl">Checkout</h1>
        {loading && !cart ? (
          <div className="h-60 animate-pulse rounded-3xl bg-cs-paper motion-reduce:animate-none" aria-label="Loading checkout" />
        ) : empty ? (
          <EmptyState illustration="search" title="Your cart is empty" description="Add something from the marketplace first." actionLabel="Browse the marketplace" actionHref="/marketplace" />
        ) : (
          <form onSubmit={pay} className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0 space-y-6">
              {error && (
                <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-cs-ink">
                  {error} <Link href="/marketplace/cart" className="font-semibold text-cs-accent-text underline">Review cart</Link>
                </p>
              )}
              <section className="space-y-4 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                <h2 className="font-semibold text-cs-ink">Contact</h2>
                <p className="text-sm text-cs-ink-soft">Receipts and updates go to <span className="font-medium text-cs-ink">{email}</span>.</p>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Phone number</span>
                  <input required value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" className={field} />
                </label>
              </section>
              {cart?.needs_shipping && (
                <section className="space-y-4 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                  <h2 className="font-semibold text-cs-ink">Delivery address</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-cs-ink">Full name</span><input required autoComplete="name" value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-cs-ink">Address line 1</span><input required autoComplete="address-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-cs-ink">Address line 2 (optional)</span><input autoComplete="address-line2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">City</span><input required autoComplete="address-level2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">State</span><input required autoComplete="address-level1" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Postal code</span><input required autoComplete="postal-code" value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} className={field} /></label>
                    <label className="block space-y-1.5 text-sm"><span className="font-medium text-cs-ink">Country</span>
                      <select value={addr.country} onChange={(e) => setAddr({ ...addr, country: e.target.value })} autoComplete="country" className={field}>
                        {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-cs-ink">Phone for delivery (if different)</span><input type="tel" autoComplete="tel" value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} className={field} /></label>
                  </div>
                </section>
              )}
              <section className="space-y-3 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                <h2 className="font-semibold text-cs-ink">Items</h2>
                <ul className="divide-y divide-cs-grid">
                  {cart?.lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0 text-cs-ink">{l.qty} × {l.title}{l.variant_name ? ` (${l.variant_name})` : ''}{l.service_slot && <span className="block text-xs text-cs-ink-soft">{formatSlot(l.service_slot)}</span>}</span>
                      <span className="shrink-0 tabular-nums text-cs-ink">{formatMinor(l.unit_price * l.qty, l.currency)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <aside className="h-fit space-y-4 rounded-3xl border border-cs-grid bg-cs-sheet p-5">
              <h2 className="font-semibold text-cs-ink">Order summary</h2>
              <div className="flex gap-2">
                <label className="flex-1"><span className="sr-only">Coupon code</span><input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className={field} /></label>
                <button type="button" disabled={loading || !coupon.trim()} onClick={() => load(coupon.trim())} className="h-11 rounded-xl border border-cs-grid px-4 text-sm font-semibold text-cs-ink hover:border-cs-accent disabled:opacity-50">Apply</button>
              </div>
              {applied && <p className="text-xs font-medium text-green-700 dark:text-green-400">Coupon {applied} applied.</p>}
              {couponError && <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{couponError}</p>}
              {cart && <Totals cart={cart} quote={quote} />}
              <button type="submit" disabled={paying || loading || !quote || !!error} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-cs-accent text-[15px] font-semibold text-cs-accent-ink shadow-lg shadow-[#2f5be7]/25 hover:brightness-110 disabled:opacity-50 disabled:shadow-none">
                {paying ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                {quote ? (quote.grand_total === 0 ? 'Place free order' : `Pay ${formatMinor(quote.grand_total, quote.currency)}`) : 'Pay'}
              </button>
              <p className="text-xs text-cs-ink-soft">You will pay securely on our payment partner&apos;s page ({quote?.currency === 'INR' ? 'PhonePe or card' : 'card via Stripe'}). Items are held for 30 minutes while you pay.</p>
            </aside>
          </form>
        )}
      </div>
    </PublicPageWrapper>
  )
}
