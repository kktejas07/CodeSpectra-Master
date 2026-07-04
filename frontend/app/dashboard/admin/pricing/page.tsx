'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Settings, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard';

export default function PricingAdminPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('free')

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans', { credentials: 'include' })
      const data = await res.json()
      if (res.ok) setPlans(data.plans || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchPlans() }, [])

  const currentPlan = plans.find(p => p.plan === selectedPlan)

  const toggleFeature = async (featureKey: string, enabled: boolean) => {
    if (!currentPlan) return
    const updated = { ...currentPlan, features: currentPlan.features.map(f => f.key === featureKey ? { ...f, enabled } : f) }
    setPlans(plans.map(p => p.plan === selectedPlan ? updated : p))
  }

  const updateLimit = (featureKey: string, limit: number) => {
    if (!currentPlan) return
    const updated = { ...currentPlan, features: currentPlan.features.map(f => f.key === featureKey ? { ...f, limit } : f) }
    setPlans(plans.map(p => p.plan === selectedPlan ? updated : p))
  }

  const savePlan = async () => {
    if (!currentPlan) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPlan),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Saved', message: `${currentPlan.name} plan updated` })
        await fetchPlans()
      } else {
        const d = await res.json(); addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  const formatLimit = (v: number) => v === -1 || v === 0 ? 'Unlimited' : String(v)

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading plans…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pricing Management
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-[250px]">Configure catalog tiers and feature flags. Stripe API keys and price_&hellip; IDs for Checkout live under Platform settings &rarr; Stripe &amp; billing.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
        </div>
      </div>

      {/* Plan selector */}
      <div className="flex gap-3">
        {plans.map(p => (
          <button key={p.plan} onClick={() => setSelectedPlan(p.plan)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${selectedPlan === p.plan ? 'bg-primary text-primary-foreground shadow' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {p.name} {p.price && <span className="text-xs opacity-70 ml-1">{p.price}</span>}
          </button>
        ))}
      </div>

      {currentPlan && (
        <div className="grid gap-6">
          <Card className="border-border/60 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Badge className={PLAN_COLORS[currentPlan.plan] || ''}>{currentPlan.name}</Badge>
              <span className="text-sm font-normal text-muted-foreground">{currentPlan.description}</span>
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              {currentPlan.features.map(f => (
                <div key={f.key} className="flex items-center justify-between rounded-md border border-border/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    {f.description && <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {f.type === 'count' ? (
                      f.enabled ? (
                        f.limit === -1 ? (
                          <Badge variant="secondary" className="text-xs">Unlimited</Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input type="number" value={f.limit} onChange={e => updateLimit(f.key, parseInt(e.target.value) || 0)} className="w-16 h-7 text-xs" />
                            <span className="text-xs text-muted-foreground">{f.label.toLowerCase().includes('day') ? '/day' : f.label.toLowerCase().includes('month') ? '/mo' : ''}</span>
                          </div>
                        )
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Not included</Badge>
                      )
                    ) : (
                      <Badge className={f.enabled ? 'bg-green-500/20 text-green-700' : 'bg-muted text-muted-foreground'}>
                        {f.enabled ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <XCircle className="h-3 w-3 mr-1 inline" />}
                        {f.enabled ? 'Yes' : 'No'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 text-xs text-muted-foreground border-border/60">
            <p>Pricing shown on the public <Link href="/pricing" className="text-primary underline">/pricing</Link> and <Link href="/dashboard/pricing" className="text-primary underline">/dashboard/pricing</Link> pages. Feature toggles are managed in <Link href="/dashboard/admin/plans" className="text-primary underline">Subscription Plans</Link>. All three pages share the same plans from this configuration.</p>
          </Card>
        </div>
      )}
    </div>
  )
}
