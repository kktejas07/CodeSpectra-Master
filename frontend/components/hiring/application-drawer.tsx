'use client'

/** Side drawer with one application, opened from the board or list. */
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAts } from './lib/api'
import type { ApplicationDetail } from './lib/types'
import { ApplicationDetailView } from './application-detail'
import { ErrorState, LoadingRows } from './ui'

export function ApplicationDrawer({ appId, onClose, onChanged }: { appId: string | null; onClose: () => void; onChanged: () => void }) {
  const q = useAts<ApplicationDetail>(appId ? `/api/ats/applications/${encodeURIComponent(appId)}` : null)
  const d = q.data && q.data.application?.id === appId ? q.data : null
  return (
    <Sheet open={!!appId} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-xl lg:max-w-2xl">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">{d?.candidate?.name ?? 'Candidate'}</SheetTitle>
          <SheetDescription className="sr-only">Application details and actions</SheetDescription>
          {d && (
            <Link href={`/dashboard/hiring/candidates/${d.application.candidate_id}?app=${d.application.id}`} className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline">
              Open full page <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </SheetHeader>
        {q.error && !d ? (
          <ErrorState compact message={q.error.message} onRetry={q.reload} />
        ) : !d ? (
          <LoadingRows rows={5} />
        ) : (
          <ApplicationDetailView detail={d} onChanged={() => { q.reload(); onChanged() }} />
        )}
      </SheetContent>
    </Sheet>
  )
}
