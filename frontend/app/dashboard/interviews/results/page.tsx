'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowLeft } from 'lucide-react'

export default function InterviewResultsPage() {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-border/60 p-10 text-center max-w-md w-full space-y-6">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <div>
          <h2 className="text-xl font-bold text-foreground">Interview Completed!</h2>
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
          Back to Interviews
        </Button>
      </Card>
    </div>
  )
}
