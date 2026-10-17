'use client'

import { usePageGuard } from '@/lib/use-page-guard'
import { CadAssessmentWorkspace } from '@/components/cad/cad-assessment-workspace'

/** Try-it CAD task: sample brief, no timer, nothing uploaded or scored. */
export default function DemoCADPage() {
  const gate = usePageGuard('user')
  if (!gate.ready || !gate.allowed) return null
  return <CadAssessmentWorkspace mode="demo" examId="demo" />
}
