'use client'

/**
 * Seller coupons tab (audit CORE-021): the seller's own discount codes (only
 * for their items, paid by them) and the opt-in for CodeSpectra-wide promotions.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/lib/toast-context'
import { api, Field, NativeSelect, TableWrap, fmtDate, th, td, withAs } from './shared'

interface SellerCoupon {
  id: string
  code: string
  discount_type: 'percentage' | 'flat'
  discount_value: number
  currency: 'INR' | 'USD' | null
  max_uses: number
  current_uses: number
  valid_until: string | null
  active: boolean
}

export function SellerCoupons({ asPlatform, defaultCurrency }: { asPlatform: boolean; defaultCurrency: 'INR' | 'USD' }) {
  const addToast = useToast()
  const [rows, setRows] = useState<SellerCoupon[] | null>(null)
  const [optIn, setOptIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ code: '', type: 'percentage' as 'percentage' | 'flat', value: '', currency: defaultCurrency, max: '', until: '' })

  const load = useCallback(() => {
    api<{ coupons: SellerCoupon[]; accepts_platform_coupons: boolean }>(withAs('/api/marketplace/seller/coupons', asPlatform))
      .then((d) => { setRows(d.coupons); setOptIn(d.accepts_platform_coupons) })
      .catch((e) => { setRows([]); addToast({ type: 'error', title: 'Could not load coupons', message: e.message }) })
  }, [asPlatform, addToast])
  useEffect(load, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api(withAs('/api/marketplace/seller/coupons', asPlatform), {
        body: {
          code: form.code, discount_type: form.type, discount_value: Number(form.value),
          ...(form.type === 'flat' ? { currency: form.currency } : {}),
          max_uses: form.max ? Number(form.max) : 0, valid_until: form.until || null,
        },
      })
      setForm((f) => ({ ...f, code: '', value: '', max: '', until: '' }))
      addToast({ type: 'success', title: 'Coupon created' })
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Could not create the coupon', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const patch = async (c: SellerCoupon, body: Record<string, unknown>) => {
    try {
      await api(withAs(`/api/marketplace/seller/coupons?id=${c.id}`, asPlatform), { method: 'PATCH', body })
      load()
    } catch (err) {
      addToast({ type: 'error', title: 'Could not update', message: (err as Error).message })
    }
  }
  const remove = async (c: SellerCoupon) => {
    try {
      await api(withAs(`/api/marketplace/seller/coupons?id=${c.id}`, asPlatform), { method: 'DELETE' })
      setRows((r) => (r ? r.filter((x) => x.id !== c.id) : r))
    } catch (err) {
      addToast({ type: 'error', title: 'Could not delete', message: (err as Error).message })
    }
  }
  const toggleOptIn = async (v: boolean) => {
    setOptIn(v)
    try {
      await api(withAs('/api/marketplace/seller/profile', asPlatform), { method: 'PATCH', body: { accepts_platform_coupons: v } })
    } catch (err) {
      setOptIn(!v)
      addToast({ type: 'error', title: 'Could not save', message: (err as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      {!asPlatform && (
        <Panel className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Join CodeSpectra promotions</h3>
            <p className="text-sm text-muted-foreground">
              When on, site-wide CodeSpectra coupons also discount your items and the discount comes out of your earnings.
              When off, your items are only discounted by promotions CodeSpectra pays for.
            </p>
          </div>
          <Switch checked={optIn} onCheckedChange={toggleOptIn} aria-label="Join CodeSpectra promotions" />
        </Panel>
      )}

      <Panel>
        <h3 className="mb-1 font-semibold text-foreground">New coupon</h3>
        <p className="mb-4 text-sm text-muted-foreground">Your coupons only discount your own items, and you pay for the discount.</p>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Code" htmlFor="sc-code" hint="3–32 letters, numbers, _ or -">
            <Input id="sc-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required className="uppercase" placeholder="MYSTORE10" />
          </Field>
          <Field label="Type" htmlFor="sc-type">
            <NativeSelect id="sc-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'percentage' | 'flat' })}>
              <option value="percentage">Percent off</option>
              <option value="flat">Fixed amount off</option>
            </NativeSelect>
          </Field>
          <Field label={form.type === 'percentage' ? 'Percent' : 'Amount'} htmlFor="sc-value">
            <Input id="sc-value" type="number" min={0} step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          </Field>
          {form.type === 'flat' && (
            <Field label="Currency" htmlFor="sc-cur" hint="Only applies to orders in this currency.">
              <NativeSelect id="sc-cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'INR' | 'USD' })}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </NativeSelect>
            </Field>
          )}
          <Field label="Max uses" htmlFor="sc-max" hint="Empty = unlimited">
            <Input id="sc-max" type="number" min={0} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
          </Field>
          <Field label="Expires" htmlFor="sc-until">
            <Input id="sc-until" type="datetime-local" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={saving || !form.code || !form.value}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create coupon
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-semibold text-foreground">Your coupons</h3>
        {rows === null ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No coupons yet — create one above and share the code with your buyers.</p>
        ) : (
          <TableWrap>
            <thead><tr><th className={th}>Code</th><th className={th}>Discount</th><th className={th}>Used</th><th className={th}>Expires</th><th className={th}>Active</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} font-mono font-semibold`}>{c.code}</td>
                  <td className={td}>{c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.currency === 'USD' ? '$' : '₹'}${c.discount_value} (${c.currency} orders)`}</td>
                  <td className={`${td} tabular-nums`}>{c.current_uses} / {c.max_uses > 0 ? c.max_uses : '∞'}</td>
                  <td className={td}>{c.valid_until ? fmtDate(c.valid_until) : 'Never'}</td>
                  <td className={td}><Switch checked={c.active} onCheckedChange={(v) => patch(c, { active: v })} aria-label={`${c.active ? 'Turn off' : 'Turn on'} ${c.code}`} /></td>
                  <td className={td}>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(c)} aria-label={`Delete ${c.code}`}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  )
}
