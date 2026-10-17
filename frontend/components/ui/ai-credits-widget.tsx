'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface AICredits {
  balance: number
  plan: string
}

export function AiCreditsWidget({ className }: { className?: string }) {
  const [credits, setCredits] = useState<AICredits | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/ai-credits')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setCredits(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className={cn("overflow-hidden border-primary/20 bg-primary/5", className)}>
        <CardContent className="p-4 flex items-center justify-center min-h-25">
          <Loader2 aria-label="Loading AI credits" className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }

  if (!credits) return null

  const isPro = credits.plan.includes('pro') || credits.plan === 'enterprise'
  const maxCredits = isPro ? (credits.plan === 'enterprise' ? 50 : 10) : 10
  const percentage = Math.min(100, Math.max(0, (credits.balance / maxCredits) * 100))
  
  const isLow = credits.balance <= 1

  return (
    <Card className={cn("overflow-hidden border bg-card relative", className)}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-primary/15 rounded-full blur-2xl pointer-events-none" />
      
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles aria-hidden className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">AI credits</h3>
              {!isPro && (
                <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-full text-muted-foreground">Free plan</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Used for AI mock tests and AI interview feedback
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tracking-tight">
              {credits.balance}
              <span className="text-lg text-muted-foreground font-normal">/{maxCredits}</span>
            </div>
          </div>
        </div>

        <Progress 
          value={percentage} 
          className={cn("h-2 mb-3", isLow ? "[&>div]:bg-red-500" : "[&>div]:bg-primary")} 
        />
        
        <div className="mt-4 bg-muted/50 p-3 rounded-lg border border-border/50 text-xs text-muted-foreground">
          Your AI credits reset every month. 
          {!isPro && (
            <span className="block mt-1">
              For more AI credits, <Link href="/dashboard/pricing" className="text-primary font-semibold hover:underline">go Pro</Link> now and get 10 credits/month to upskill.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
