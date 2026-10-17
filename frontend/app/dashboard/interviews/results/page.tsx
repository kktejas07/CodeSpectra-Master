'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowLeft } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'

export default function InterviewResultsPage() {
  const gate = usePageGuard('user')

  const router = useRouter()

  if (!gate.ready) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <SkeletonCard />
    </div>
  )

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="rounded-3xl border-border/70 p-10 text-center max-w-md w-full space-y-6">
        <CheckCircle className="mx-auto h-12 w-12 text-green-600 dark:text-green-400" aria-hidden />
        <div>
          <h2 className="text-xl font-bold text-foreground">Interview complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your results are being processed. We&apos;ll notify you once they&apos;re ready.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => router.push('/dashboard/interviews')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to interviews
        </Button>
      </Card>
    </div>
  )
}

