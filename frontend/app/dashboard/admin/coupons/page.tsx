'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Loader2, Plus, Tag, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

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

  // Form State
  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'flat' | 'trial'>('percentage')
  const [value, setValue] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/coupons', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (gate.ready) {
      fetchCoupons()
    }
  }, [gate.ready])

  const handleCreate = async () => {
    try {
      setSaving(true)
      const res = await csrfFetch('/api/admin/coupons', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount_type: type,
          discount_value: type === 'trial' ? 100 : Number(value),
          max_uses: maxUses ? Number(maxUses) : 0,
          valid_until: validUntil || undefined,
          trial_duration_days: type === 'trial' ? Number(trialDays) : undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Creation failed')
      
      addToast({ type: 'success', title: 'Success', message: 'Coupon created successfully' })
      setCreateOpen(false)
      setCode('')
      setValue('')
      setMaxUses('')
      setValidUntil('')
      fetchCoupons()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (!gate.ready) return null
  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Tag className="h-8 w-8" /> Coupon Management
          </h1>
          <p className="text-muted-foreground mt-1">Generate and monitor discount codes.</p>
        </div>
        
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Coupon</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create Coupon Code</DialogTitle>
              <DialogDescription>Generate a new discount code for users to redeem during checkout.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="code" className="text-right">Code</Label>
                <Input id="code" value={code} onChange={e => setCode(e.target.value)} className="col-span-3 uppercase" placeholder="SUMMER20" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">Type</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Discount Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat Amount (INR)</SelectItem>
                    <SelectItem value="trial">Free Trial (Days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type !== 'trial' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="value" className="text-right">Value</Label>
                <Input id="value" type="number" value={value} onChange={e => setValue(e.target.value)} className="col-span-3" placeholder={type === 'percentage' ? "20" : "500"} />
              </div>
              )}
              {type === 'trial' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="days" className="text-right">Duration (Days)</Label>
                <Input id="days" type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)} className="col-span-3" placeholder="90" />
              </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="uses" className="text-right">Max Uses</Label>
                <Input id="uses" type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)} className="col-span-3" placeholder="Leave empty for unlimited" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="expiry" className="text-right">Expiry Date</Label>
                <Input id="expiry" type="datetime-local" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving || !code || !value}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden border-border/50 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">Code</th>
                <th className="px-6 py-4 font-medium">Discount</th>
                <th className="px-6 py-4 font-medium">Usage</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {coupons.map(coupon => (
                <tr key={coupon.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold">{coupon.code}</td>
                  <td className="px-6 py-4">
                    {coupon.discount_type === 'trial' ? `Free ${coupon.trial_duration_days || '?'} days` : coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : `₹${coupon.discount_value} OFF`}
                  </td>
                  <td className="px-6 py-4">
                    {coupon.current_uses} / {coupon.max_uses > 0 ? coupon.max_uses : '∞'}
                  </td>
                  <td className="px-6 py-4">
                    {coupon.active ? (
                      <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString() : 'Never'}
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No coupons generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
