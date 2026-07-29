'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Crown, Star, Zap, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import Link from 'next/link'
import { usePageGuard } from '@/lib/use-page-guard'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PlanDef {
  plan: string; name: string; description: string; price?: string
  features: Array<{ key: string; label: string; description: string; enabled: boolean; limit: number; type: string }>
}

const PLAN_COLORS: Record<string, string> = {
  free: 'from-green-500/10 to-green-500/5 border-green-500/20',
  pro: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
  enterprise: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
}

export default function PricingPage() {
  const gate = usePageGuard('user')

  const addToast = useToast()
  const [plans, setPlans] = useState<PlanDef[]>([])
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(true)

  const [checkoutPlan, setCheckoutPlan] = useState<PlanDef | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [discountInfo, setDiscountInfo] = useState<{ valid: boolean, type: string, value: number, error?: string } | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/billing/plans', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/platform-settings', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([plansData, settingsData]) => {
      if (Array.isArray(plansData)) setPlans(plansData)
      else if (plansData?.plans) setPlans(plansData.plans)
      if (settingsData?.settings?.platform_currency) setCurrency(settingsData.settings.platform_currency)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    try {
      setCheckingCoupon(true)
      const res = await csrfFetch('/api/billing/coupons/validate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDiscountInfo({ valid: false, type: '', value: 0, error: data.error || 'Invalid coupon' })
        return
      }
      setDiscountInfo({ valid: true, type: data.coupon.discount_type, value: data.coupon.discount_value })
    } catch (e: any) {
      setDiscountInfo({ valid: false, type: '', value: 0, error: e.message })
    } finally {
      setCheckingCoupon(false)
    }
  }

  const handleCheckout = async () => {
    if (!checkoutPlan) return
    try {
      setCheckoutLoading(true)
      const res = await csrfFetch('/api/billing/create-order', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: checkoutPlan.plan, coupon_code: discountInfo?.valid ? couponCode : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.razorpay_order_id && (window as any).Razorpay) {
        const rzp = new (window as any).Razorpay({
          key: data.razorpay_key_id,
          amount: data.amount,
          currency: data.currency || 'USD',
          order_id: data.razorpay_order_id,
          handler: async (response: any) => {
            const verify = await csrfFetch('/api/billing/verify', {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            })
            if (verify.ok) {
              addToast({ type: 'success', title: 'Subscribed!', message: `You are now on the ${checkoutPlan.plan} plan.` })
              setCheckoutPlan(null)
            }
          },
        })
        rzp.open()
      } else if (data.redirect_url) {
        window.location.href = data.redirect_url
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Payment failed', message: e.message })
    } finally {
      setCheckoutLoading(false)
    }
  }

const currSymbol = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'JPY' ? '¥' : '$'
  const formatLimit = (v: number) => v === -1 || v === 0 ? 'Unlimited' : String(v)
  const getLimitSuffix = (key: string) => {
    const map: Record<string, string> = { 'seats': ' /user', 'storage': ' GB', 'requests': ' /mo', 'api_calls': ' /mo' }
    return map[key] || ''
  }

  if (!gate.ready) return null

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading plans…</div>

  return (
    <div className="space-y-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">Choose Your Plan</h1>
        <p className="text-muted-foreground mt-3 text-lg">Start free, upgrade when you need more power.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
        {plans.map(plan => {
          const isPro = plan.plan === 'pro'
          return (
            <Card key={plan.plan} className={`relative p-6 bg-gradient-to-b ${PLAN_COLORS[plan.plan] || ''} ${isPro ? 'ring-2 ring-primary scale-105' : ''}`}>
              {isPro && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Most Popular</Badge>}
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price ? `${currSymbol}${plan.price.replace('$', '').replace('/month', '')}` : 'Free'}</span>
                  {plan.price && <span className="text-sm text-muted-foreground">/mo</span>}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {plan.features.filter(f => f.type !== 'pages').map(f => (
                  <div key={f.key} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${f.enabled ? 'text-green-500' : 'text-muted-foreground/30'}`} />
                    <span className={f.enabled ? 'text-foreground' : 'text-muted-foreground/50 line-through'}>
                      {f.label}
                      {f.type === 'count' && f.enabled && (
                        <span className="text-xs text-muted-foreground ml-1">({formatLimit(f.limit)}{getLimitSuffix(f.key)})</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                variant={isPro || (plan.price && plan.price !== '$0' && plan.price !== 'Free') ? 'default' : 'outline'}
                onClick={() => (!plan.price || plan.price === '$0' || plan.price === 'Free' || plan.plan === 'free') ? null : setCheckoutPlan(plan)}
                asChild={!plan.price || plan.price === '$0' || plan.price === 'Free' || plan.plan === 'free'}
              >
                {(!plan.price || plan.price === '$0' || plan.price === 'Free' || plan.plan === 'free') ? (
                  <Link href="/dashboard">Get Started Free</Link>
                ) : plan.plan === 'enterprise' || plan.price?.toLowerCase().includes('contact') ? (
                  <><Zap className="h-4 w-4 mr-2" /> Contact Sales</>
                ) : (
                  <><Crown className="h-4 w-4 mr-2" /> Upgrade to {plan.name}</>
                )}
              </Button>
            </Card>
          )
        })}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>All plans include access to problems, scanner, tracks, and leaderboard.</p>
        <p className="mt-1">
          <Link href="/dashboard/billing" className="text-primary underline">Manage billing</Link>
          {' · '}
          <Link href="/pricing" className="text-primary underline">Public pricing page</Link>
        </p>
      </div>

      <Dialog open={!!checkoutPlan} onOpenChange={(v) => { if (!v) { setCheckoutPlan(null); setCouponCode(''); setDiscountInfo(null) } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Complete Your Upgrade</DialogTitle>
            <DialogDescription>You are upgrading to {checkoutPlan?.name}.</DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border border-border/50">
              <span className="font-medium text-foreground">Base Price</span>
              <span className="font-bold">{checkoutPlan?.price ? `${currSymbol}${checkoutPlan.price.replace('$', '').replace('/month', '')}` : ''}</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="coupon">Have a coupon code?</Label>
              <div className="flex gap-2">
                <Input 
                  id="coupon" 
                  placeholder="Enter code" 
                  value={couponCode} 
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="uppercase"
                />
                <Button variant="secondary" onClick={handleApplyCoupon} disabled={checkingCoupon || !couponCode}>
                  {checkingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              {discountInfo && (
                <p className={`text-sm ${discountInfo.valid ? 'text-green-500' : 'text-red-500'}`}>
                  {discountInfo.valid 
                    ? `Coupon applied! ${discountInfo.type === 'percentage' ? `${discountInfo.value}% OFF` : `${currSymbol}${discountInfo.value} OFF`}`
                    : discountInfo.error}
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCheckoutPlan(null); setCouponCode(''); setDiscountInfo(null) }}>Cancel</Button>
            <Button onClick={handleCheckout} disabled={checkoutLoading}>
              {checkoutLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

