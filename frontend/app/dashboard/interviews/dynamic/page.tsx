'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DynamicInterview } from '@/components/interviews/dynamic-interview'
import type { InterviewFeedback } from '@/lib/interview-service'

function DynamicInterviewPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleId = searchParams.get('role') || 'software-engineer'
  const interviewType = (searchParams.get('type') || 'technical') as
    | 'technical'
    | 'behavioral'
    | 'system-design'
  const resumeInfo = searchParams.get('resume')

  const handleInterviewComplete = (feedback: InterviewFeedback[]) => {
    sessionStorage.setItem('interviewFeedback', JSON.stringify(feedback))
    router.push('/dashboard/interviews/results')
  }

  return (
    <DynamicInterview
      roleId={roleId}
      interviewType={interviewType}
      resumeInfo={resumeInfo || undefined}
      onComplete={handleInterviewComplete}
    />
  )
}

export default function DynamicInterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          Loading interview…
        </div>
      }
    >
      <DynamicInterviewPageInner />
    </Suspense>
  )
}
