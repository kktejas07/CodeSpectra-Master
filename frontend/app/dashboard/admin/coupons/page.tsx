'use client'

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

  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'flat' | 'trial'>('percentage')
  const [value, setValue] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [currency, setCurrency] = useState('USD')
  const CURRENCY_MAP: Record<string, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£' }

  const openCreate = () => {
    setEditCoupon(null)
    setCode(''); setType('percentage'); setValue(''); setTrialDays(''); setMaxUses(''); setValidUntil('')
    setCreateOpen(true)
  }

  const openEdit = (c: Coupon) => {
    setEditCoupon(c)
    setCode(c.code); setType(c.discount_type)
    setValue(c.discount_value ? String(c.discount_value) : '')
    setTrialDays(c.trial_duration_days ? String(c.trial_duration_days) : '')
    setMaxUses(c.max_uses ? String(c.max_uses) : '')
    setValidUntil(c.valid_until ? c.valid_until.slice(0, 16) : '')
    setCreateOpen(true)
  }

  const fetchCoupons = async () => {
    try { setLoading(true)
      const res = await fetch('/api/admin/coupons', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err: any) { addToast({ type: 'error', title: 'Error', message: err.message }) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (gate.ready) { fetchCoupons(); loadCurrency() } }, [gate.ready])

  const loadCurrency = async () => {
    try {
      const res = await fetch('/api/admin/platform-settings', { credentials: 'include' })
      const data = await res.json()
      if (data?.platform_currency) setCurrency(data.platform_currency)
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
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono font-bold">{r.code}</span> },
    { key: 'discount', header: 'Discount',
      cell: (r) => r.discount_type === 'trial' ? `Free ${r.trial_duration_days || '?'}d` : r.discount_type === 'percentage' ? `${r.discount_value}%` : `${CURRENCY_MAP[currency] || currency}${r.discount_value}` },
    { key: 'usage', header: 'Usage', cell: (r) => <span>{r.current_uses} / {r.max_uses > 0 ? r.max_uses : '∞'}</span> },
    { key: 'status', header: 'Status',
      cell: (r) => r.active ? <Badge className="bg-green-500/10 text-green-600">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
    { key: 'expiry', header: 'Expiry', cell: (r) => <span className="text-muted-foreground text-xs">{r.valid_until ? new Date(r.valid_until).toLocaleDateString() : 'Never'}</span> },
    { key: 'actions', header: 'Actions', cell: (r) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewRedemptions(r)} title="View users"><Users className="h-3 w-3" /></Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleActive(r)} title={r.active ? 'Deactivate' : 'Activate'}>
          {r.active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => setConfirmDeleteCoupon({ id: r.id, code: r.code })}><Trash2 className="h-3 w-3" /></Button>
      </div>
    )},
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleBulkDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2"><Tag className="h-8 w-8" /> Coupons</h1>
          <p className="text-muted-foreground mt-1">Create and manage discount codes.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New Coupon</Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editCoupon ? 'Edit Coupon' : 'Create Coupon'}</DialogTitle>
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
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Flat Amount ({currency})</SelectItem>
                  <SelectItem value="trial">Free Trial (Days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== 'trial' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="value" className="text-right">Value</Label>
              <Input id="value" type="number" value={value} onChange={e => setValue(e.target.value)} className="col-span-3" placeholder={type === 'percentage' ? "20" : "500"} />
            </div>)}
            {type === 'trial' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="days" className="text-right">Duration (Days)</Label>
              <Input id="days" type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)} className="col-span-3" placeholder="90" />
            </div>)}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="uses" className="text-right">Max Uses</Label>
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

      <DataTable columns={columns} data={coupons} searchPlaceholder="Search coupons..." searchKeys={['code'] as any} bulkActions={bulkActions} loading={loading} emptyMessage="No coupons yet." pageSize={20} />

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
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2">User</th>
                    <th className="py-2 pr-2">Email</th>
                    <th className="py-2 pr-2">Plan</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewRedemptions as any).redemptions.map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium">{r.user_name || r.user_id?.slice(0, 12) + '…'}</td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{r.user_email || '—'}</td>
                      <td className="py-2 text-xs">{r.plan_id || '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
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
            <AlertDialogTitle>Delete Coupon?</AlertDialogTitle>
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
