'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DynamicInterview } from '@/components/interviews/dynamic-interview'
import type { InterviewFeedback } from '@/lib/interview-service'

export default function DynamicInterviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleId = searchParams.get('role') || 'software-engineer'
  const interviewType = (searchParams.get('type') || 'technical') as
    | 'technical'
    | 'behavioral'
    | 'system-design'
  const resumeInfo = searchParams.get('resume')

  const handleInterviewComplete = (feedback: InterviewFeedback[]) => {
    // Store feedback in session/state and redirect to results page
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
