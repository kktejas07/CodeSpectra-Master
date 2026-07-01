'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { Loader2, Crown, CheckCircle2, XCircle, Save, RefreshCw } from 'lucide-react'

interface PlanDef {
  _id?: string; plan: string; name: string; description: string
  price?: string; features: any[]; isDefault?: boolean
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-green-500/20 text-green-700',
  pro: 'bg-blue-500/20 text-blue-700',
  enterprise: 'bg-purple-500/20 text-purple-700',
}

export default function PlansPage() {
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
        const d = await res.json()
        addToast({ type: 'error', title: 'Failed', message: d.error })
      }
    } catch { addToast({ type: 'error', title: 'Error', message: 'Network error' }) }
    finally { setSaving(false) }
  }

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading plans…</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Crown className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Subscription Plans</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage feature access per subscription tier. Changes take effect immediately.</p>
          </div>
        </div>
        <Button onClick={fetchPlans} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Plan selector */}
      <div className="flex gap-3">
        {plans.map(p => (
          <button
            key={p.plan}
            onClick={() => setSelectedPlan(p.plan)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              selectedPlan === p.plan
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p.name} {p.price && <span className="text-xs opacity-70 ml-1">{p.price}</span>}
          </button>
        ))}
      </div>

      {currentPlan && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan info */}
          <Card className="border-border/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Badge className={PLAN_COLORS[currentPlan.plan] || ''}>{currentPlan.name}</Badge>
                  {currentPlan.isDefault && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{currentPlan.description}</p>
              </div>
              <Button onClick={savePlan} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan ID</label>
                  <Input value={currentPlan.plan} disabled className="mt-1 h-8 text-xs font-mono" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</label>
                  <Input value={currentPlan.price || ''} disabled className="mt-1 h-8 text-xs" />
                </div>
              </div>
            </div>
          </Card>

          {/* Features */}
          <Card className="border-border/60 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Features</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {currentPlan.features.map(f => (
                <div key={f.key} className="flex items-center justify-between rounded-md border border-border/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {f.type === 'count' && f.enabled && (
                      <Input
                        type="number"
                        value={f.limit}
                        onChange={e => updateLimit(f.key, parseInt(e.target.value) || 0)}
                        className="w-16 h-7 text-xs"
                      />
                    )}
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={v => toggleFeature(f.key, v)}
                    />
                    {f.enabled ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/30" />}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
