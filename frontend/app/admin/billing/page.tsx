'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, AlertCircle, Download, CreditCard, Lock } from 'lucide-react'
import { useToast } from '@/lib/toast-context'

interface Invoice {
  id: string
  amount: number
  currency: string
  status: string
  paidAt?: string
  dueDate?: string
  pdfUrl?: string
}

interface Subscription {
  id: string
  planName: string
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  canceledAt?: string
  trialEndsAt?: string
  pricePerMonth?: number
}

interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
}

export default function BillingPage() {
  const toast = useToast()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      description: 'For side projects',
      features: [
        'Up to 5 Projects',
        '100 Scans / Month',
        'Basic Security Audits',
      ],
    },
    {
      id: 'pro',
      name: 'Pro Developer',
      price: 49,
      description: 'For scaling teams',
      features: [
        'Unlimited Projects',
        '5,000 Scans / Month',
        'Advanced AI Remediation',
        'Slack/Discord Integration',
      ],
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: null,
      description: 'Custom infrastructure',
      features: [
        'On-Premise Deployment',
        'SSO / SAML Security',
        'Dedicated Account Manager',
        '24/7 Priority Support',
      ],
    },
  ]

  useEffect(() => {
    fetchBillingData()
  }, [])

  const fetchBillingData = async () => {
    try {
      setLoading(true)
      const [subRes, invRes, pmRes] = await Promise.all([
        fetch('/api/billing/subscription', { credentials: 'include' }),
        fetch('/api/billing/invoices', { credentials: 'include' }),
        fetch('/api/billing/payment-methods', { credentials: 'include' }),
      ])
      
      if (subRes.ok) setSubscription(await subRes.json())
      if (invRes.ok) setInvoices(await invRes.json())
      if (pmRes.ok) setPaymentMethods(await pmRes.json())
    } catch (error) {
      console.error('[CodeSpectra] Failed to fetch billing data:', error)
      toast({
        type: 'error',
        title: 'Failed to load billing',
        message: 'Could not fetch your billing information',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    window.location.href = `/api/billing/checkout?plan=${planId}`
  }

  const handleCancelSubscription = async () => {
    if (window.confirm('Are you sure you want to cancel your subscription?')) {
      try {
        const res = await fetch('/api/billing/cancel', { method: 'POST', credentials: 'include' })
        if (res.ok) {
          toast({
            type: 'success',
            title: 'Subscription canceled',
            message: 'Your subscription has been canceled.',
          })
          fetchBillingData()
        }
      } catch (error) {
        toast({
          type: 'error',
          title: 'Failed to cancel',
          message: String(error),
        })
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Manage your</h1>
        <h2 className="text-4xl font-bold bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-4">
          Intelligence Subscriptions.
        </h2>
        <p className="text-foreground/60">Scale your development velocity with our flexible billing system. Transparent, secure, and built for engineering teams.</p>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <p className="text-foreground/60">Loading billing information...</p>
        </Card>
      ) : (
        <>
          {/* Current Plan Banner */}
          {subscription && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6 bg-foreground/5">
                <p className="text-sm text-foreground/60 font-semibold mb-1">CURRENT PLAN</p>
                <p className="text-2xl font-bold mb-4">{subscription.planName}</p>
                <Badge className="mb-4">{subscription.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</Badge>
                <p className="text-sm text-foreground/60">
                  ${subscription.pricePerMonth || 0}/Month • Next bill {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </Card>

              <Card className="p-6">
                <p className="text-sm text-foreground/60 font-semibold mb-1">ANALYSIS USAGE</p>
                <p className="text-2xl font-bold mb-4">842<span className="text-sm text-foreground/60">/1000</span></p>
                <div className="w-full bg-background rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: '84.2%' }} />
                </div>
              </Card>

              <Card className="p-6">
                <p className="text-sm text-foreground/60 font-semibold mb-1">TEAM SEATS</p>
                <p className="text-2xl font-bold mb-4">8<span className="text-sm text-foreground/60">/10</span></p>
                <Button variant="outline" size="sm" className="w-full">Add Seat</Button>
              </Card>
            </div>
          )}

          {/* Pricing Tiers */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Subscription Tiers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`p-8 flex flex-col relative ${
                    plan.popular ? 'md:scale-105 border-primary/50 ring-1 ring-primary/30' : ''
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground">
                      SELECTED
                    </Badge>
                  )}

                  <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-sm text-foreground/60 mb-6">{plan.description}</p>

                  {plan.price !== null ? (
                    <div className="mb-6">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-foreground/60">/mo</span>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <span className="text-3xl font-bold">Custom</span>
                    </div>
                  )}

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.id === 'enterprise' ? (
                    <Button variant="outline" className="w-full">
                      Contact Sales
                    </Button>
                  ) : plan.popular ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button onClick={() => handleUpgrade(plan.id)} className="w-full">
                      Upgrade to {plan.name}
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* Payment Methods */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Payment Methods</h2>
              <Button>Add Card</Button>
            </div>

            {paymentMethods.length === 0 ? (
              <Card className="p-6 text-center text-foreground/60">
                No payment methods on file
              </Card>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <Card key={method.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <CreditCard className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-medium capitalize">{method.brand} ending in {method.last4}</p>
                        <p className="text-sm text-foreground/60">Expires {method.expiryMonth}/{method.expiryYear}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Remove</Button>
                  </Card>
                ))}
              </div>
            )}

            {/* Stripe Security Note */}
            <Card className="p-4 bg-foreground/5 flex items-start gap-3 mt-4">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-sm">Secure Payment Processing</p>
                <p className="text-xs text-foreground/60">Payments are processed securely via Stripe. CodeSpectra does not store your card details.</p>
              </div>
            </Card>
          </div>

          {/* Invoice History */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Invoice History</h2>
              <Button variant="outline" size="sm">Download All</Button>
            </div>

            {invoices.length === 0 ? (
              <Card className="p-6 text-center text-foreground/60">
                No invoices yet
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-sm font-semibold">INVOICE</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">DATE</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">AMOUNT</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold">STATUS</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-border hover:bg-background/50">
                        <td className="px-6 py-4 font-mono text-sm">{invoice.id}</td>
                        <td className="px-6 py-4 text-sm">
                          {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">
                          ${(invoice.amount / 100).toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={invoice.status === 'paid' ? 'success' : 'warning'} className="capitalize">
                            {invoice.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {invoice.pdfUrl && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={invoice.pdfUrl} download>
                                <Download className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Billing Settings */}
          {subscription && (
            <Card className="p-6 border-destructive/30">
              <h3 className="text-lg font-bold mb-4">Billing Settings</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-foreground/60 mb-2">Danger Zone</p>
                  <Button
                    variant="destructive"
                    onClick={handleCancelSubscription}
                  >
                    Cancel Subscription
                  </Button>
                  <p className="text-xs text-foreground/60 mt-2">
                    Your access will end at the end of your current billing period.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
