'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Loader2, Plus, Tag, Trash2, Pencil, Power, PowerOff, Users } from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { CheckCircle2, Ticket } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Coupon {
  id: string
  code: string
  discount_type: 'percentage' | 'flat' | 'trial'
  discount_value: number
  trial_duration_days?: number
  max_uses: number
  current_uses: number
  valid_until?: string
  active: boolean
  created_at: string
  currency?: 'INR' | 'USD'
  currency_migrated_at?: string | null
  applies_to?: 'all' | 'plans' | 'marketplace'
  marketplace_funding?: 'platform_items_only' | 'platform_funded'
  seller_id?: string | null
}

export default function CouponsAdminPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null)
  const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState<{ id: string; code: string } | null>(null)
  const [viewRedemptions, setViewRedemptions] = useState<Coupon | null>(null)
  const [redemptionUsers, setRedemptionUsers] = useState<Record<string, { name: string; email: string }>>({})

  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'flat' | 'trial'>('percentage')
  const [value, setValue] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [currency, setCurrency] = useState('USD')
  const CURRENCY_MAP: Record<string, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£' }
  // Per-coupon fields (CORE-018 / CORE-021).
  const [couponCurrency, setCouponCurrency] = useState<'INR' | 'USD'>('INR')
  const [appliesTo, setAppliesTo] = useState<'all' | 'plans' | 'marketplace'>('all')
  const [funding, setFunding] = useState<'platform_items_only' | 'platform_funded'>('platform_items_only')
  const [notices, setNotices] = useState<string[]>([])

  const openCreate = () => {
    setEditCoupon(null)
    setCode(''); setType('percentage'); setValue(''); setTrialDays(''); setMaxUses(''); setValidUntil('')
    setCouponCurrency(currency === 'USD' ? 'USD' : 'INR'); setAppliesTo('all'); setFunding('platform_items_only')
    setCreateOpen(true)
  }

  const openEdit = (c: Coupon) => {
    setEditCoupon(c)
    setCode(c.code); setType(c.discount_type)
    setValue(c.discount_value ? String(c.discount_value) : '')
    setTrialDays(c.trial_duration_days ? String(c.trial_duration_days) : '')
    setMaxUses(c.max_uses ? String(c.max_uses) : '')
    setValidUntil(c.valid_until ? c.valid_until.slice(0, 16) : '')
    setCouponCurrency(c.currency === 'USD' ? 'USD' : 'INR')
    setAppliesTo(c.applies_to ?? 'all')
    setFunding(c.marketplace_funding ?? 'platform_items_only')
    setCreateOpen(true)
  }

  const [loadError, setLoadError] = useState(false)

  const fetchCoupons = async () => {
    try { setLoading(true)
      const res = await fetch('/api/admin/coupons', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
      setNotices(Array.isArray(data.notices) ? data.notices : [])
      setLoadError(false)
    } catch (err: any) { setLoadError(true); addToast({ type: 'error', title: 'Error', message: err.message }) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (gate.ready) { fetchCoupons(); loadCurrency() } }, [gate.ready])

  useEffect(() => {
    const redemptions = (viewRedemptions as any)?.redemptions
    if (!redemptions?.length) return
    const rawIds: string[] = []
    for (const r of redemptions) {
      if (r.user_id) rawIds.push(String(r.user_id))
    }
    const userIds = [...new Set(rawIds)]
    const missing = userIds.filter(id => !redemptionUsers[id])
    if (!missing.length) return
    let cancelled = false
    fetch(`/api/admin/users?ids=${encodeURIComponent(missing.slice(0, 200).join(','))}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.users) return
        const map: Record<string, { name: string; email: string }> = {}
        for (const u of data.users) {
          map[u.id] = { name: u.full_name || u.name || u.email || u.id, email: u.email || '—' }
        }
        setRedemptionUsers(prev => ({ ...prev, ...map }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [viewRedemptions])

  const loadCurrency = async () => {
    try {
      const res = await fetch('/api/admin/platform-settings', { credentials: 'include' })
      const data = await res.json()
      // settings live under `settings` (same as plans/billing); keep the old top-level read as a fallback
      const cur = data?.settings?.platform_currency || data?.platform_currency
      if (cur) setCurrency(cur)
    } catch { /* ignore */ }
  }

  const handleSave = async () => {
    try { setSaving(true)
      const url = editCoupon ? `/api/admin/coupons?id=${editCoupon.id}` : '/api/admin/coupons'
      const method = editCoupon ? 'PATCH' : 'POST'
      const res = await csrfFetch(url, { method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(), discount_type: type,
          discount_value: type === 'trial' ? 100 : Number(value),
          max_uses: maxUses ? Number(maxUses) : 0,
          valid_until: validUntil || undefined,
          trial_duration_days: type === 'trial' ? Number(trialDays) : undefined,
          currency: type === 'flat' ? couponCurrency : undefined,
          applies_to: appliesTo,
          marketplace_funding: funding,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      addToast({ type: 'success', title: editCoupon ? 'Updated' : 'Created', message: editCoupon ? 'Coupon updated' : 'Coupon created' })
      setCreateOpen(false); fetchCoupons()
    } catch (err: any) { addToast({ type: 'error', title: 'Error', message: err.message }) }
    finally { setSaving(false) }
  }

  const handleDeleteOne = async (id: string) => {
    await csrfFetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE', credentials: 'include' })
    addToast({ type: 'success', title: 'Deleted' })
    setCoupons(prev => prev.filter(c => c.id !== id))
  }

  const handleBulkDelete = async (ids: string[]) => {
    for (const id of ids) await csrfFetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE', credentials: 'include' })
    addToast({ type: 'success', title: `${ids.length} deleted` })
    setCoupons(prev => prev.filter(c => !ids.includes(c.id)))
  }

  const toggleActive = async (c: Coupon) => {
    await csrfFetch(`/api/admin/coupons?id=${c.id}`, { method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }) })
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x))
    addToast({ type: 'success', title: c.active ? 'Deactivated' : 'Activated' })
  }

  const columns: DataTableColumn<Coupon>[] = [
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono font-semibold text-foreground">{r.code}</span> },
    { key: 'discount', header: 'Discount',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {r.discount_type === 'trial' ? `Free ${r.trial_duration_days || '?'}d` : r.discount_type === 'percentage' ? `${r.discount_value}%` : `${CURRENCY_MAP[r.currency || 'INR']}${r.discount_value} (${r.currency || 'INR'} orders only)`}
          {r.currency_migrated_at && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">Check currency</Badge>}
        </span>
      ) },
    { key: 'scope', header: 'Where', cell: (r) => (
      <span className="text-xs text-muted-foreground">
        {r.seller_id ? 'One seller (seller-funded)' : r.applies_to === 'plans' ? 'Plans' : r.applies_to === 'marketplace' ? 'Marketplace' : 'Plans + marketplace'}
        {!r.seller_id && r.applies_to !== 'plans' && <><br />{r.marketplace_funding === 'platform_funded' ? 'All sellers, platform pays' : 'CodeSpectra items + opted-in sellers'}</>}
      </span>
    ) },
    { key: 'usage', header: 'Usage', cell: (r) => <span className="tabular-nums">{r.current_uses} / {r.max_uses > 0 ? r.max_uses : '∞'}</span> },
    { key: 'status', header: 'Status',
      cell: (r) => r.active ? <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
    { key: 'expiry', header: 'Expiry', cell: (r) => <span className="text-muted-foreground text-xs">{r.valid_until ? formatDate(r.valid_until) : 'Never'}</span> },
    { key: 'actions', header: 'Actions', cell: (r) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewRedemptions(r)} title="View users" aria-label={`Who used ${r.code}`}><Users className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(r)} title="Edit" aria-label={`Edit ${r.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleActive(r)} title={r.active ? 'Deactivate' : 'Activate'} aria-label={r.active ? `Deactivate ${r.code}` : `Activate ${r.code}`}>
          {r.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" title="Delete" aria-label={`Delete ${r.code}`} onClick={() => setConfirmDeleteCoupon({ id: r.id, code: r.code })}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    )},
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleBulkDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="billing"
        title="Coupons"
        description="Create and manage discount codes and free-trial codes."
        icon={<Tag />}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New coupon</Button>}
      />

      {notices.map((n) => (
        <div key={n} role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">{n}</div>
      ))}

      {!loading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Coupons" value={coupons.length} icon={<Tag />} />
          <StatCard label="Active" value={coupons.filter((c) => c.active).length} icon={<CheckCircle2 />} />
          <StatCard label="Times redeemed" value={coupons.reduce((a, c) => a + (Number(c.current_uses) || 0), 0)} icon={<Ticket />} />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editCoupon ? 'Edit coupon' : 'Create coupon'}</DialogTitle>
            <DialogDescription>{editCoupon ? `Editing ${editCoupon.code}` : 'Generate a new discount code.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">Code</Label>
              <Input id="code" value={code} onChange={e => setCode(e.target.value)} className="col-span-3 uppercase" placeholder="SUMMER20" disabled={!!editCoupon} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger aria-label="Type" className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Fixed amount</SelectItem>
                  <SelectItem value="trial">Free trial (days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== 'trial' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="value" className="text-right">Value</Label>
              <Input id="value" type="number" value={value} onChange={e => setValue(e.target.value)} className="col-span-3" placeholder={type === 'percentage' ? "20" : "500"} />
            </div>)}
            {type === 'flat' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="coupon-currency" className="text-right">Currency</Label>
              <Select value={couponCurrency} onValueChange={(v: 'INR' | 'USD') => setCouponCurrency(v)}>
                <SelectTrigger id="coupon-currency" className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR (₹) — only INR orders</SelectItem>
                  <SelectItem value="USD">USD ($) — only USD orders</SelectItem>
                </SelectContent>
              </Select>
            </div>)}
            {type !== 'trial' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="applies-to" className="text-right">Use on</Label>
              <Select value={appliesTo} onValueChange={(v: 'all' | 'plans' | 'marketplace') => setAppliesTo(v)}>
                <SelectTrigger id="applies-to" className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Plans and marketplace</SelectItem>
                  <SelectItem value="plans">Plans only</SelectItem>
                  <SelectItem value="marketplace">Marketplace only</SelectItem>
                </SelectContent>
              </Select>
            </div>)}
            {type !== 'trial' && appliesTo !== 'plans' && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="funding" className="text-right pt-2">Other sellers</Label>
              <div className="col-span-3 space-y-1">
                <Select value={funding} onValueChange={(v: 'platform_items_only' | 'platform_funded') => setFunding(v)}>
                  <SelectTrigger id="funding"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform_items_only">Don&apos;t discount their items</SelectItem>
                    <SelectItem value="platform_funded">Discount them — CodeSpectra pays</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Sellers who opted in to platform promotions are always included and pay their share.</p>
              </div>
            </div>)}
            {type === 'trial' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="days" className="text-right">Duration (days)</Label>
              <Input id="days" type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)} className="col-span-3" placeholder="90" />
            </div>)}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="uses" className="text-right">Max uses</Label>
              <Input id="uses" type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)} className="col-span-3" placeholder="Unlimited" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expiry" className="text-right">Expiry</Label>
              <Input id="expiry" type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !code || (type !== 'trial' && !value)}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editCoupon ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataTable columns={columns} data={coupons} searchPlaceholder="Search coupons..." searchKeys={['code'] as any} bulkActions={bulkActions} loading={loading} emptyState={loadError ? { illustration: 'error', title: "Couldn't load coupons", description: 'Check your connection and try again.', actionLabel: 'Try again', onAction: () => void fetchCoupons() } : { illustration: 'billing' }} emptyMessage="No coupons yet. Use New coupon to create your first code." pageSize={20} />

      <Dialog open={!!viewRedemptions} onOpenChange={(o) => { if (!o) setViewRedemptions(null) }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Redemptions — {viewRedemptions?.code}</DialogTitle>
            <DialogDescription>
              Users who have used this coupon. {viewRedemptions?.current_uses} total uses.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {(viewRedemptions as any)?.redemptions && (viewRedemptions as any).redemptions.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">User</th>
                    <th className="py-2 pr-2">Email</th>
                    <th className="py-2 pr-2">Plan</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewRedemptions as any).redemptions.map((r: any, i: number) => {
                    const u = redemptionUsers[r.user_id]
                    const displayName = u?.name || r.user_name || r.user_id?.slice(0, 12) + '…'
                    const displayEmail = u?.email || r.user_email || '—'
                    return (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-2 font-medium">{displayName}</td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{displayEmail}</td>
                      <td className="py-2 text-xs">{r.plan_id || '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">{r.redeemed_at ? formatDateTime(r.redeemed_at) : '—'}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No redemptions recorded yet. Redemptions from new payments will appear here.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteCoupon} onOpenChange={(open) => !open && setConfirmDeleteCoupon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the coupon code "{confirmDeleteCoupon?.code}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                if (confirmDeleteCoupon) {
                  const { id } = confirmDeleteCoupon
                  setConfirmDeleteCoupon(null)
                  await handleDeleteOne(id)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
