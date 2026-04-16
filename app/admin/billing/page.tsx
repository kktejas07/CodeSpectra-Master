'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, AlertCircle, Download } from 'lucide-react'

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
}

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBillingData()
  }, [])

  const fetchBillingData = async () => {
    try {
      setLoading(true)
      const [subRes, invRes] = await Promise.all([
        fetch('/api/billing/subscription'),
        fetch('/api/billing/invoices')
      ])
      
      if (subRes.ok) setSubscription(await subRes.json())
      if (invRes.ok) setInvoices(await invRes.json())
    } catch (error) {
      console.error('Failed to fetch billing data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    window.location.href = `/api/billing/checkout?plan=${planId}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscriptions</h1>
        <p className="text-muted-foreground">Manage your subscription and billing</p>
      </div>

      {loading ? (
        <Card className="p-6 text-center">Loading billing information...</Card>
      ) : (
        <>
          {subscription && (
            <Card className="p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{subscription.planName}</h2>
                  <p className="text-muted-foreground">Current Plan</p>
                </div>
                <Badge className={subscription.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {subscription.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Current Period</p>
                  <p className="font-semibold">
                    {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
                {subscription.trialEndsAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Trial Ends</p>
                    <p className="font-semibold">{new Date(subscription.trialEndsAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleUpgrade('pro')}>Upgrade Plan</Button>
                <Button variant="outline">Manage Payment Method</Button>
              </div>
            </Card>
          )}

          <div>
            <h2 className="text-xl font-bold mb-4">Invoices</h2>
            {invoices.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                No invoices yet
              </Card>
            ) : (
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <Card key={invoice.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">
                        {invoice.currency} ${(invoice.amount / 100).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {invoice.dueDate ? `Due: ${new Date(invoice.dueDate).toLocaleDateString()}` : 'Invoice'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                        {invoice.status}
                      </Badge>
                      {invoice.pdfUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={invoice.pdfUrl} download>
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
