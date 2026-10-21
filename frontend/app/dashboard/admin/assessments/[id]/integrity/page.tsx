'use client'

/** Integrity review for one test: trust timelines, similar code, AI-written signals, settings (lib/integrity). */
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { IntegrityReview } from '@/components/integrity/IntegrityReview'

export default function TestIntegrityPage() {
  const gate = usePageGuard('tenant_admin')
  const params = useParams()
  const id = String(params.id)
  if (!gate.ready) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /></div>
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <IntegrityReview kind="exam" id={id} backHref={`/dashboard/admin/assessments/${encodeURIComponent(id)}/results`} backLabel="Results" />
    </div>
  )
}
