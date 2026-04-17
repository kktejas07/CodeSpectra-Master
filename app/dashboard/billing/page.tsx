'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Check, Download } from 'lucide-react'

export default function BillingPage() {
  const [currentPlan] = useState({
    name: 'Professional',
    price: 99,
    period: 'month',
    status: 'active',
    renewDate: '2024-05-17',
    features: [
      'Unlimited code scans',
      'GitHub integration',
      'Team collaboration',
      'Advanced analytics',
      'Priority support',
    ],
  })

  const [invoices] = useState([
    { id: 'INV-001', date: '2024-04-17', amount: 99, status: 'Paid' },
    { id: 'INV-002', date: '2024-03-17', amount: 99, status: 'Paid' },
    { id: 'INV-003', date: '2024-02-17', amount: 99, status: 'Paid' },
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <CreditCard className="w-8 h-8 text-primary" />
          Billing & Subscriptions
        </h1>
        <p className="text-muted-foreground mt-2">Manage your subscription and billing information</p>
      </div>

      {/* Current Plan */}
      <Card className="p-8 border-2 border-primary/30">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">{currentPlan.name} Plan</h2>
            <p className="text-muted-foreground">
              ${currentPlan.price}/{currentPlan.period}
            </p>
          </div>
          <Badge className="bg-green-500/20 text-green-700">Active</Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-foreground mb-4">Features Included</h3>
            <ul className="space-y-2">
              {currentPlan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="w-4 h-4 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Billing Information</h3>
            <div className="space-y-3">
              <div className="text-sm">
                <p className="text-muted-foreground">Renewal Date</p>
                <p className="font-medium text-foreground">{currentPlan.renewDate}</p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Billing Amount</p>
                <p className="font-medium text-foreground">${currentPlan.price} per month</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button>Upgrade Plan</Button>
          <Button variant="outline">Change Billing Cycle</Button>
          <Button variant="outline">Cancel Subscription</Button>
        </div>
      </Card>

      {/* Invoice History */}
      <div>
        <h3 className="text-xl font-bold text-foreground mb-4">Invoice History</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Invoice ID</th>
                <th className="px-6 py-3 text-left font-semibold">Date</th>
                <th className="px-6 py-3 text-left font-semibold">Amount</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{invoice.id}</td>
                  <td className="px-6 py-3">{invoice.date}</td>
                  <td className="px-6 py-3">${invoice.amount}</td>
                  <td className="px-6 py-3">
                    <Badge className="bg-green-500/20 text-green-700">{invoice.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Method */}
      <Card className="p-6">
        <h3 className="font-bold text-foreground mb-4">Payment Method</h3>
        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">VISA</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">•••• •••• •••• 4242</p>
              <p className="text-xs text-muted-foreground">Expires 12/2026</p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            Update
          </Button>
        </div>
      </Card>
    </div>
  )
}
