'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { usePageGuard } from '@/lib/use-page-guard'
import { CadAssessmentWorkspace } from '@/components/cad/cad-assessment-workspace'

/**
 * CAD task for a real exam: files + design rationale are uploaded, tied to the
 * exam attempt and land as "pending review" (see /api/exams/[id]/cad-submission).
 * The try-it version without uploads lives at /assessment/demo/cad.
 */
export default function CandidateCADAssessmentPage() {
  const gate = usePageGuard('user')
  const params = useParams()
  const searchParams = useSearchParams()
  const examId = String(params?.id || '')

  if (!gate.ready || !gate.allowed || !examId) return null
  return (
    <CadAssessmentWorkspace
      mode="exam"
      examId={examId}
      inviteToken={searchParams.get('inviteToken')}
      linkToken={searchParams.get('link')}
    />
  )
}
