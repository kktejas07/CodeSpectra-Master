'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useConfirm } from '@/lib/confirm-context'
import { Loader2, Crown, CheckCircle2, XCircle, Save, RefreshCw, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { ProblemPacksPanel } from './problem-packs-panel'
import { PlanPricesPanel } from './plan-prices-panel'

interface PlanDef {
  _id?: string; plan: string; name: string; description: string
  price?: string; features: any[]; isDefault?: boolean
  yearlyPrice?: number; contactSales?: boolean; currency?: string; popular?: boolean
}

const PLAN_COLORS: Record<string, string> = {
  free: 'border-border bg-muted text-foreground',
  pro: 'border-primary/30 bg-primary/10 text-primary',
  enterprise: 'border-primary bg-primary text-primary-foreground',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$',
}

export default function PlansPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const confirmDialog = useConfirm()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('free')
  const [currency, setCurrency] = useState('USD')

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setPlans(data.plans || [])
      else addToast({ type: 'error', title: "Couldn't load plans", message: 'Refresh the page or try again in a moment.' })
    } catch { addToast({ type: 'error', title: "Couldn't load plans", message: 'Refresh the page or try again in a moment.' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchPlans(); loadCurrency() }, [])

  const loadCurrency = async () => {
    try {
      const res = await fetch('/api/admin/platform-settings', { credentials: 'include' })
      const data = await res.json()
      if (data?.settings?.platform_currency) setCurrency(data.settings.platform_currency)
    } catch { /* ignore */ }
  }

  const currentPlan = plans.find(p => p.plan === selectedPlan)

  const toggleFeature = async (featureKey: string, enabled: boolean) => {
    if (!currentPlan) return
    const updated = {
      ...currentPlan,
      features: currentPlan.features.map(f =>
        f.key === featureKey ? { ...f, enabled } : f
      )
    }
    setPlans(plans.map(p => p.plan === selectedPlan ? updated : p))
  }

  const updateLimit = (featureKey: string, limit: number) => {
    if (!currentPlan) return
    const updated = {
      ...currentPlan,
      features: currentPlan.features.map(f =>
        f.key === featureKey ? { ...f, limit } : f
      )
    }
    setPlans(plans.map(p => p.plan === selectedPlan ? updated : p))
  }

  const updatePrice = (price: string) => patchPlan({ price })

  const patchPlan = (patch: Partial<PlanDef>) => {
    if (!currentPlan) return
    const updated = { ...currentPlan, ...patch }
    setPlans(plans.map(p => p.plan === selectedPlan ? updated : p))
  }

  const [newOpen, setNewOpen] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState(false)

  // New plans start from the Pro features so every enforced limit is present.
  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = newId.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
      addToast({ type: 'error', title: 'Invalid plan ID', message: 'Use lowercase letters, numbers, _ or -' })
      return
    }
    if (plans.some((p) => p.plan === id)) {
      addToast({ type: 'error', title: 'Plan exists', message: 'Pick another plan ID.' })
      return
    }
    const base = plans.find((p) => p.plan === 'pro') || plans[0]
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/plans', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: id, name: newName.trim() || id, description: '', price: '', features: base?.features || [] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not create the plan')
      setNewOpen(false); setNewId(''); setNewName('')
      await fetchPlans()
      setSelectedPlan(id)
      addToast({ type: 'success', title: 'Plan created', message: 'Set its price and limits, then save.' })
    } catch (err) {
      addToast({ type: 'error', title: 'Failed', message: err instanceof Error ? err.message : 'Failed' })
    } finally { setSaving(false) }
  }

  const deletePlan = async () => {
    if (!currentPlan || currentPlan.plan === 'free') return
    if (!(await confirmDialog({ title: 'Delete this plan?', description: `Delete the ${currentPlan.name} plan? This can't be undone.`, confirmText: 'Delete', destructive: true }))) return
    setDeleting(true)
    try {
      const res = await csrfFetch(`/api/admin/plans?plan=${encodeURIComponent(currentPlan.plan)}`, { method: 'DELETE', credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not delete the plan')
      addToast({ type: 'success', title: 'Plan deleted' })
      setSelectedPlan('free')
      await fetchPlans()
    } catch (err) {
      addToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Failed' })
    } finally { setDeleting(false) }
  }

  const savePlan = async () => {
    if (!currentPlan) return
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/plans', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPlan),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Saved', message: `${currentPlan.name} plan updated` })
        await fetchPlans()
      } else {
        const d = await res.json()
        addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  if (!gate.ready) return null
  if (loading) return (
    <div className="space-y-6">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="billing"
        title={
          <>
            Plans and pricing
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About plans" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">Choose which features each subscription tier gets. Changes apply when you save.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Set the price, features and usage limits for each subscription plan."
        icon={<Crown />}
        actions={
          <div className="flex gap-2">
            <Button onClick={fetchPlans} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
            <Button onClick={() => setNewOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />New plan</Button>
          </div>
        }
      />

      {/* Plan selector */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Plans">
        {plans.map(p => (
          <button
            key={p.plan}
            role="tab"
            aria-selected={selectedPlan === p.plan}
            onClick={() => setSelectedPlan(p.plan)}
            className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
              selectedPlan === p.plan
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {p.name} {p.price ? <span className="ml-1 text-xs tabular-nums opacity-80">{CURRENCY_SYMBOLS[p.currency || currency] || ''}{String(p.price).replace(/[^0-9.,]/g, '')}/mo</span> : null}
          </button>
        ))}
      </div>

      {currentPlan && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan info */}
          <Panel>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className={PLAN_COLORS[currentPlan.plan] || ''}>{currentPlan.name}</Badge>
                  {currentPlan.isDefault && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{currentPlan.description}</p>
              </div>
              <div className="flex gap-2">
                {currentPlan.plan !== 'free' ? (
                  <Button onClick={() => void deletePlan()} disabled={deleting || saving} size="sm" variant="outline" className="gap-2">
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
                  </Button>
                ) : null}
                <Button onClick={savePlan} disabled={saving} size="sm" className="gap-2">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="plan-id" className="text-xs font-medium text-muted-foreground">Plan ID</label>
                  <Input id="plan-id" value={currentPlan.plan} disabled className="mt-1 h-8 text-xs font-mono" />
                </div>
                <div>
                  <label htmlFor="plan-price" className="text-xs font-medium text-muted-foreground">Price</label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">{CURRENCY_SYMBOLS[currency] || currency}</span>
                    <Input
                      id="plan-price"
                      value={currentPlan.price || ''}
                      onChange={e => updatePrice(e.target.value)}
                      className="pl-7 h-8 text-xs"
                      placeholder="29/month"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="plan-yearly" className="text-xs font-medium text-muted-foreground">Yearly price (optional)</label>
                  <Input
                    id="plan-yearly"
                    type="number"
                    min={0}
                    value={currentPlan.yearlyPrice ?? ''}
                    onChange={e => patchPlan({ yearlyPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="mt-1 h-8 text-xs tabular-nums"
                    placeholder="Monthly × 12 − 15%"
                  />
                </div>
                <div>
                  <label htmlFor="plan-currency" className="text-xs font-medium text-muted-foreground">Currency (optional)</label>
                  <Input
                    id="plan-currency"
                    value={currentPlan.currency ?? ''}
                    onChange={e => patchPlan({ currency: e.target.value.toUpperCase().slice(0, 3) || undefined })}
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder={currency}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Contact sales</p>
                  <p className="text-xs text-muted-foreground">Show “Contact sales” instead of checkout.</p>
                </div>
                <Switch
                  checked={currentPlan.contactSales === true}
                  onCheckedChange={v => patchPlan({ contactSales: v })}
                  aria-label="Contact sales"
                />
              </div>
            </div>
          </Panel>

          {/* Features */}
          <Panel>
            <h2 className="text-lg font-semibold text-foreground mb-4">Features</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {currentPlan.features.map(f => (
                <div key={f.key} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{f.label}</p>
                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {f.type === 'count' && f.enabled && (
                      f.limit === -1 ? (
                        <Badge variant="outline" className="text-xs">Unlimited</Badge>
                      ) : (
                        <Input
                          type="number"
                          value={f.limit}
                          onChange={e => updateLimit(f.key, parseInt(e.target.value) || 0)}
                          className="w-16 h-7 text-xs tabular-nums"
                          aria-label={`${f.label} limit`}
                        />
                      )
                    )}
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={v => toggleFeature(f.key, v)}
                      aria-label={`${f.label} enabled`}
                    />
                    {f.enabled ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden /> : <XCircle className="h-4 w-4 text-muted-foreground/40" aria-hidden />}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <PlanPricesPanel />

      <ProblemPacksPanel />

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={createPlan}>
            <DialogHeader>
              <DialogTitle>New plan</DialogTitle>
              <DialogDescription>Starts with the Pro features and limits. You can change them before saving.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div>
                <label htmlFor="new-plan-id" className="text-xs font-medium text-muted-foreground">Plan ID</label>
                <Input id="new-plan-id" value={newId} onChange={e => setNewId(e.target.value)} className="mt-1 font-mono" placeholder="team" required />
              </div>
              <div>
                <label htmlFor="new-plan-name" className="text-xs font-medium text-muted-foreground">Name</label>
                <Input id="new-plan-name" value={newName} onChange={e => setNewName(e.target.value)} className="mt-1" placeholder="Team" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !newId.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Create plan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}


